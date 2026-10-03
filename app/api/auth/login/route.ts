import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { createSessionToken, cookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");

  const db = await getDb();
  const u = await db.collection("users").findOne({ email });
  if (!u || !(await bcrypt.compare(password, String(u.passHash)))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const token = await createSessionToken({
    userId: u._id.toString(),
    email,
  });
  const res = NextResponse.json({
    user: { id: u._id.toString(), email, name: String(u.name) },
    salt: String(u.salt),
    pubJwk: u.pubJwk,
    encPriv: u.encPriv,
  });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
