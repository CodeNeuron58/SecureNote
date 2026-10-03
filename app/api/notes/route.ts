import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  const own = await db
    .collection("notes")
    .find({ ownerId: uid })
    .sort({ updatedAt: -1 })
    .toArray();
  const grants = await db
    .collection("grants")
    .find({ viewerId: uid, revoked: { $ne: true } })
    .toArray();
  const grantByNote = new Map<string, (typeof grants)[number]>();
  for (const g of grants) grantByNote.set(g.noteId.toString(), g);
  const sharedNotes = grants.length
    ? await db
        .collection("notes")
        .find({ _id: { $in: grants.map((g) => g.noteId) } })
        .toArray()
    : [];

  const out: unknown[] = [];
  for (const n of own) {
    out.push({
      id: n._id.toString(),
      titleEnc: n.title,
      wrap: n.selfWrap,
      role: "owner",
      updatedAt: (n.updatedAt as Date).toISOString(),
    });
  }
  for (const n of sharedNotes) {
    const g = grantByNote.get(n._id.toString());
    if (!g) continue;
    out.push({
      id: n._id.toString(),
      titleEnc: n.title,
      wrap: g.wrap,
      role: "viewer",
      updatedAt: (n.updatedAt as Date).toISOString(),
      grant: {
        viewsLeft:
          g.maxViews == null ? null : Math.max(0, Number(g.maxViews) - Number(g.views || 0)),
        expiresAt: g.expiresAt ? (g.expiresAt as Date).toISOString() : null,
        maxViews: g.maxViews ?? null,
      },
    });
  }

  return NextResponse.json({ notes: out });
}

export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.titleEnc?.ct || !body?.bodyEnc?.ct || !body?.selfWrap?.ct) {
    return NextResponse.json({ error: "Invalid note payload" }, { status: 400 });
  }
  let uid: ObjectId;
  try {
    uid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  const now = new Date();
  const r = await db.collection("notes").insertOne({
    ownerId: uid,
    title: body.titleEnc,
    body: body.bodyEnc,
    selfWrap: body.selfWrap,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({ id: r.insertedId.toString() });
}
