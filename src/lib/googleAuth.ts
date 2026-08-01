import { NextRequest } from "next/server";

// Helpers for the Google OAuth flow (authorization-code, web server flow).

export const STATE_COOKIE = "oauth_state";

export function getGoogleCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured");
  }
  return { clientId, clientSecret };
}

// Origin as seen by the browser. Behind Railway's proxy the request itself is
// plain HTTP, so trust the forwarded headers first.
export function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

export function redirectUri(req: NextRequest): string {
  return `${requestOrigin(req)}/api/auth/google/callback`;
}
