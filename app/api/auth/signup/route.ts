import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { createSessionToken, cookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const salt = String(body.salt || "");
  const pubJwk = body.pubJwk;
  const encPriv = body.encPriv;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Enter your name (max 60 chars)" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }
  if (!salt || !pubJwk?.kty || !encPriv?.iv || !encPriv?.ct) {
    return NextResponse.json(
      { error: "Missing encryption key material" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const users = db.collection("users");
  const existing = await users.findOne({ email });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passHash = await bcrypt.hash(password, 10);
  const r = await users.insertOne({
    email,
    name,
    passHash,
    salt,
    pubJwk,
    encPriv,
    createdAt: new Date(),
  });

  const token = await createSessionToken({
    userId: r.insertedId.toString(),
    email,
  });
  const res = NextResponse.json({
    user: { id: r.insertedId.toString(), email, name },
  });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
