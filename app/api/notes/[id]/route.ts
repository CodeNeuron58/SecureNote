import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession, clientIp } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

function deny(res: string, reason: string, msg: string) {
  return NextResponse.json({ error: msg, reason }, { status: 403 });
}

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
  const note = await db
    .collection("notes")
    .findOne({ _id: new ObjectId(id) });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  // Owner reads are unlimited and never logged: it is their own note.
  if (note.ownerId.equals(uid)) {
    return NextResponse.json({
      role: "owner",
      note: {
        id: note._id.toString(),
        titleEnc: note.title,
        bodyEnc: note.body,
        selfWrap: note.selfWrap,
        role: "owner",
        createdAt: (note.createdAt as Date).toISOString(),
        updatedAt: (note.updatedAt as Date).toISOString(),
      },
    });
  }

  // Viewer path: the grant is the only way in, and every open is logged.
  const grant = await db
    .collection("grants")
    .findOne({ noteId: note._id, viewerId: uid });
  if (!grant || grant.revoked) {
    return deny("no-access", "no-access", "You no longer have access to this note");
  }
  if (grant.expiresAt && (grant.expiresAt as Date).getTime() < Date.now()) {
    return deny("expired", "expired", "This share link has expired");
  }
  if (grant.maxViews != null && Number(grant.views || 0) >= Number(grant.maxViews)) {
    return deny("limit", "limit", "This note's view limit has been reached");
  }

  const upd = await db.collection("grants").findOneAndUpdate(
    { _id: grant._id },
    { $inc: { views: 1 } },
    { returnDocument: "after" }
  );
  const g = (upd as { value?: Record<string, unknown> } | null)?.value ?? (upd as unknown as Record<string, unknown>);
  const viewNumber = Number((g as { views?: number })?.views ?? 1);

  const ua = req.headers.get("user-agent") || "unknown";
  await db.collection("views").insertOne({
    noteId: note._id,
    viewerId: uid,
    viewerEmail: s.email,
    grantId: grant._id,
    kind: "open",
    n: viewNumber,
    ip: clientIp(req),
    ua,
    at: new Date(),
  });

  return NextResponse.json({
    role: "viewer",
    note: {
      id: note._id.toString(),
      titleEnc: note.title,
      bodyEnc: note.body,
      wrap: grant.wrap,
      role: "viewer",
      createdAt: (note.createdAt as Date).toISOString(),
      updatedAt: (note.updatedAt as Date).toISOString(),
      viewNumber,
    },
    viewsLeft:
      grant.maxViews == null ? null : Math.max(0, Number(grant.maxViews) - viewNumber),
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.titleEnc?.ct || !body?.bodyEnc?.ct) {
    return NextResponse.json({ error: "Invalid note payload" }, { status: 400 });
  }

  const db = await getDb();
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const r = await db.collection("notes").updateOne(
    { _id: new ObjectId(id), ownerId: uid },
    { $set: { title: body.titleEnc, body: body.bodyEnc, updatedAt: new Date() } }
  );
  if (r.matchedCount === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  const db = await getDb();
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const oid = new ObjectId(id);
  const r = await db
    .collection("notes")
    .deleteOne({ _id: oid, ownerId: uid });
  if (r.deletedCount === 0) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  await db.collection("grants").deleteMany({ noteId: oid });
  await db.collection("views").deleteMany({ noteId: oid });
  return NextResponse.json({ ok: true });
}
