import { NextRequest, NextResponse } from "next/server";
import { auth, resolveAccess } from "@/lib/auth";

// Next 16 renamed the `middleware` convention to `proxy`. With a `src/`
// directory the file must live at `src/proxy.ts` (same level as `app`).
// Proxy runs on the Node.js runtime, so it can validate sessions against the
// database rather than merely checking that a cookie exists.

// Read-only API keys, comma-separated. Grant GET-only access to /api/* routes.
const READONLY_API_KEYS = (process.env.READONLY_API_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

const isRead = (method: string) => method === "GET" || method === "HEAD";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login page and Better Auth's own routes must stay reachable to
  // signed-out visitors, otherwise sign-in can never complete.
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // API-key auth: Authorization: Bearer <key> (falls back to x-api-key).
  const key =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    req.headers.get("x-api-key")?.trim();
  if (key && READONLY_API_KEYS.includes(key)) {
    if (pathname.startsWith("/api/") && isRead(req.method)) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "read-only API key" }, { status: 403 });
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Resolved per request rather than read off the session, so both losing and
  // gaining access take effect at once instead of at the next sign-in.
  const access = await resolveAccess(session.user.email);

  if (access === "none") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (access !== "edit" && !isRead(req.method)) {
    return NextResponse.json({ error: "read-only account" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
