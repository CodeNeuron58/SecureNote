import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let oid: ObjectId;
  try {
    oid = new ObjectId(s.userId);
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await getDb();
  const u = await db.collection("users").findOne({ _id: oid });
  if (!u) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  return NextResponse.json({
    user: { id: u._id.toString(), email: String(u.email), name: String(u.name) },
    pubJwk: u.pubJwk,
  });
}
