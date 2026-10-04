import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function ownedNote(db: Awaited<ReturnType<typeof getDb>>, id: string, uid: ObjectId) {
  if (!ObjectId.isValid(id)) return null;
  return db.collection("notes").findOne({ _id: new ObjectId(id), ownerId: uid });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const db = await getDb();
  const note = await ownedNote(db, id, uid);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const grants = await db
    .collection("grants")
    .find({ noteId: note._id })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    grants: grants.map((g) => ({
      id: g._id.toString(),
      viewerEmail: String(g.viewerEmail),
      views: Number(g.views || 0),
      maxViews: g.maxViews ?? null,
      expiresAt: g.expiresAt ? (g.expiresAt as Date).toISOString() : null,
      revoked: !!g.revoked,
      createdAt: (g.createdAt as Date).toISOString(),
    })),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const viewerEmail = String(body?.viewerEmail || "").trim().toLowerCase();
  const wrap = body?.wrap;
  const maxViews = body?.maxViews == null ? null : Number(body.maxViews);
  const expiresAt = body?.expiresAt ? new Date(String(body.expiresAt)) : null;
  if (!viewerEmail || !wrap?.ct || !wrap?.epk?.kty) {
    return NextResponse.json({ error: "Invalid share payload" }, { status: 400 });
  }
  if (maxViews != null && (!Number.isFinite(maxViews) || maxViews < 1)) {
    return NextResponse.json({ error: "Invalid view limit" }, { status: 400 });
  }

  const db = await getDb();
  const note = await ownedNote(db, id, uid);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const viewer = await db.collection("users").findOne({ email: viewerEmail });
  if (!viewer) {
    return NextResponse.json(
      { error: "That person has no SecureNote account yet — ask them to sign up first" },
      { status: 404 }
    );
  }
  if (viewer._id.equals(uid)) {
    return NextResponse.json({ error: "You already own this note" }, { status: 400 });
  }

  // Update path preserves the view counter and createdAt: re-sharing to change
  // expiry/limits must never silently refresh a viewer's used-up quota.
  const existing = await db
    .collection("grants")
    .findOne({ noteId: note._id, viewerId: viewer._id });
  if (existing) {
    await db.collection("grants").updateOne(
      { _id: existing._id },
      { $set: { wrap, maxViews, expiresAt, revoked: false, viewerEmail } }
    );
  } else {
    await db.collection("grants").insertOne({
      noteId: note._id,
      ownerId: uid,
      viewerId: viewer._id,
      viewerEmail,
      wrap,
      maxViews,
      expiresAt,
      views: 0,
      revoked: false,
      createdAt: new Date(),
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const grantId = req.nextUrl.searchParams.get("grantId") || "";
  if (!ObjectId.isValid(grantId)) {
    return NextResponse.json({ error: "Invalid share reference" }, { status: 400 });
  }

  const db = await getDb();
  const note = await ownedNote(db, id, uid);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const r = await db.collection("grants").updateOne(
    { _id: new ObjectId(grantId), noteId: note._id },
    { $set: { revoked: true } }
  );
  if (r.matchedCount === 0) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
