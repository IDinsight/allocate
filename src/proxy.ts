import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Next 16 renamed the `middleware` convention to `proxy`. With a `src/`
// directory the file must live at `src/proxy.ts` (same level as `app`).

// Read-only API keys, comma-separated. Grant GET-only access to /api/* routes.
const READONLY_API_KEYS = (process.env.READONLY_API_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The login page and the Google OAuth endpoints must stay reachable to
  // signed-out visitors, otherwise sign-in can never complete.
  if (pathname === "/login" || pathname.startsWith("/api/auth/google")) {
    return NextResponse.next();
  }

  // API-key auth: Authorization: Bearer <key> (falls back to x-api-key).
  const key =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    req.headers.get("x-api-key")?.trim();
  if (key && READONLY_API_KEYS.includes(key)) {
    if (pathname.startsWith("/api/") && req.method === "GET") {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "read-only API key" }, { status: 403 });
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
