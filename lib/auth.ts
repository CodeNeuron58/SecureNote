import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const rawSecret = process.env.JWT_SECRET || "dev-only-secret-change-me";
if (process.env.NODE_ENV === "production" && rawSecret === "dev-only-secret-change-me") {
  console.error(
    "JWT_SECRET is not configured — sessions are signed with an insecure development fallback. Set JWT_SECRET before serving real traffic."
  );
}
const SECRET = new TextEncoder().encode(rawSecret);

export const SESSION_COOKIE = "sn_session";

export type Session = { userId: string; email: string };

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT({ email: s.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySessionToken(
  token: string | undefined
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload.sub) return null;
    return { userId: payload.sub, email: String(payload.email || "") };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
