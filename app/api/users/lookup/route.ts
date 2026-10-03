import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const email = (req.nextUrl.searchParams.get("email") || "")
    .trim()
    .toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const db = await getDb();
  const u = await db.collection("users").findOne(
    { email },
    { projection: { pubJwk: 1, name: 1, email: 1 } }
  );
  if (!u) {
    return NextResponse.json(
      { error: "No SecureNote account exists for that email yet" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: u._id.toString(),
    email: String(u.email),
    name: String(u.name),
    pubJwk: u.pubJwk,
  });
}
