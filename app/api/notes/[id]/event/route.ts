import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession, clientIp } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// Best-effort client signals (e.g. PrintScreen pressed) land here so the
// owner's audit log reflects deterrent events. The server cannot verify
// these, and the response is always ok to avoid leaking state.
export async function POST(req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: true });
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => null);
  const kind = String(body?.kind || "");
  if (kind !== "screenshot") return NextResponse.json({ ok: true });

  try {
    let uid: ObjectId;
    try {
      uid = new ObjectId(s.userId);
    } catch {
      return NextResponse.json({ ok: true });
    }
    const db = await getDb();
    const note = await db.collection("notes").findOne({ _id: new ObjectId(id) });
    if (!note || note.ownerId.equals(uid)) return NextResponse.json({ ok: true });

    const grant = await db
      .collection("grants")
      .findOne({ noteId: note._id, viewerId: uid, revoked: { $ne: true } });
    if (!grant) return NextResponse.json({ ok: true });

    await db.collection("views").insertOne({
      noteId: note._id,
      viewerId: uid,
      viewerEmail: s.email,
      grantId: grant._id,
      kind: "screenshot",
      n: null,
      ip: clientIp(req),
      ua: req.headers.get("user-agent") || "unknown",
      at: new Date(),
    });
  } catch {
    // never fail on a deterrent signal
  }
  return NextResponse.json({ ok: true });
}
