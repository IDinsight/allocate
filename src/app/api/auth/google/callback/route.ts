import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { getGoogleCreds, redirectUri, requestOrigin, STATE_COOKIE } from "@/lib/googleAuth";

// Google redirects here after consent. Exchange the code for an ID token,
// verify the email belongs to a teammate, and start a signed session.

function loginRedirect(req: NextRequest, error?: string) {
  const url = new URL("/login", requestOrigin(req));
  if (error) url.searchParams.set("error", error);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return loginRedirect(req, "oauth");
  }

  const { clientId, clientSecret } = getGoogleCreds();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return loginRedirect(req, "oauth");

  const { id_token: idToken } = (await tokenRes.json()) as { id_token?: string };
  if (!idToken) return loginRedirect(req, "oauth");

  // The ID token comes straight from Google's token endpoint over TLS, so its
  // payload can be trusted without verifying the JWT signature.
  let email: string | undefined;
  let name: string | undefined;
  let verified = false;
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")
    ) as { email?: string; email_verified?: boolean; name?: string };
    email = payload.email?.toLowerCase();
    name = payload.name;
    verified = payload.email_verified === true;
  } catch {
    return loginRedirect(req, "oauth");
  }
  if (!email || !verified) return loginRedirect(req, "oauth");

  const teammate = await prisma.teammate.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!teammate) return loginRedirect(req, "denied");

  const token = await createSessionToken({ email, name });
  const res = NextResponse.redirect(new URL("/", requestOrigin(req)));
  res.cookies.set(STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
