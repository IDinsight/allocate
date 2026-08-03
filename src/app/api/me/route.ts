import { NextRequest, NextResponse } from "next/server";
import { auth, resolveAccess } from "@/lib/auth";

// Who the caller is and what they may do.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { email, name } = session.user;
  return NextResponse.json({ email, name, access: await resolveAccess(email) });
}
