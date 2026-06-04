import { NextRequest, NextResponse } from "next/server";

// Next 16 renamed the `middleware` convention to `proxy`. With a `src/`
// directory the file must live at `src/proxy.ts` (same level as `app`).

// Read-only API keys, comma-separated. Grant GET-only access to /api/* routes.
const READONLY_API_KEYS = (process.env.READONLY_API_KEYS ?? "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";
  const isLoginApi = pathname === "/api/auth/login";

  if (isLoginPage || isLoginApi) return NextResponse.next();

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

  if (req.cookies.get("auth")?.value === "1") return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
