import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession, clientIp } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// ~10 MB plaintext + GCM overhead stays under MongoDB's 16 MB document cap.
const MAX_CIPHERTEXT = 12 * 1024 * 1024;

// Owner uploads/replaces the encrypted file. Body = raw ciphertext bytes
// ([12-byte IV || AES-GCM ciphertext], produced client-side).
export async function PUT(req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  const note = await db
    .collection("notes")
    .findOne({ _id: new ObjectId(id), ownerId: uid });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }
  if (buf.length > MAX_CIPHERTEXT) {
    return NextResponse.json(
      { error: "File too large — 10 MB max after encryption" },
      { status: 413 }
    );
  }

  await db.collection("blobs").replaceOne(
    { noteId: note._id },
    { noteId: note._id, data: buf, size: buf.length, updatedAt: new Date() },
    { upsert: true }
  );
  await db
    .collection("notes")
    .updateOne({ _id: note._id }, { $set: { updatedAt: new Date() } });

  return NextResponse.json({ ok: true, size: buf.length });
}

// Fetch the encrypted file. Owner: silent. Viewer: requires a live grant and
// writes an audit event (no view-count increment — the page open did that).
export async function GET(req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  const note = await db.collection("notes").findOne({ _id: new ObjectId(id) });
  if (!note || note.kind !== "file") {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const isOwner = note.ownerId.equals(uid);
  if (!isOwner) {
    const grant = await db
      .collection("grants")
      .findOne({ noteId: note._id, viewerId: uid, revoked: { $ne: true } });
    if (!grant) {
      return NextResponse.json(
        { error: "You no longer have access to this note" },
        { status: 403 }
      );
    }
    if (grant.expiresAt && (grant.expiresAt as Date).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This share has expired" },
        { status: 403 }
      );
    }
    await db.collection("views").insertOne({
      noteId: note._id,
      viewerId: uid,
      viewerEmail: s.email,
      grantId: grant._id,
      kind: "file",
      n: null,
      ip: clientIp(req),
      ua: req.headers.get("user-agent") || "unknown",
      at: new Date(),
    });
  }

  const blob = await db.collection("blobs").findOne({ noteId: note._id });
  if (!blob?.data) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const data = blob.data as unknown as Buffer;
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.length),
      "Cache-Control": "no-store",
    },
  });
}
