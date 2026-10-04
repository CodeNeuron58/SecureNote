import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// Lightweight access check that never meters or logs: lets an open viewer
// tab revalidate its grant (on focus) so revocation and expiry take effect
// immediately, without burning view quota.
export async function GET(_req: NextRequest, ctx: Ctx) {
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
  const note = await db.collection("notes").findOne({ _id: new ObjectId(id) });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  if (note.ownerId.equals(uid)) {
    return NextResponse.json({ ok: true, role: "owner" });
  }

  const grant = await db
    .collection("grants")
    .findOne({ noteId: note._id, viewerId: uid });
  if (!grant || grant.revoked) {
    return NextResponse.json(
      { error: "You no longer have access to this note", reason: "no-access" },
      { status: 403 }
    );
  }
  if (grant.expiresAt && (grant.expiresAt as Date).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This share has expired", reason: "expired" },
      { status: 403 }
    );
  }
  if (
    grant.maxViews != null &&
    Number(grant.views || 0) >= Number(grant.maxViews)
  ) {
    return NextResponse.json(
      { error: "This note's view limit has been reached", reason: "limit" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    role: "viewer",
    viewsLeft:
      grant.maxViews == null
        ? null
        : Math.max(0, Number(grant.maxViews) - Number(grant.views || 0)),
  });
}
