import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

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
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const db = await getDb();
  const note = await db.collection("notes").findOne({
    _id: new ObjectId(id),
    ownerId: uid,
  });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const views = await db
    .collection("views")
    .find({ noteId: note._id })
    .sort({ at: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json({
    views: views.map((v) => ({
      at: (v.at as Date).toISOString(),
      viewerEmail: String(v.viewerEmail),
      kind: String(v.kind),
      n: v.n == null ? null : Number(v.n),
      ip: String(v.ip || "unknown"),
      ua: String(v.ua || ""),
    })),
  });
}
