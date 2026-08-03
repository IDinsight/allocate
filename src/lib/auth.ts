import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { prisma } from "@/lib/prisma";

// ─── Access tiers ─────────────────────────────────────────
//
//   edit — on the teammates list, or listed in EXTRA_ALLOWED_EMAILS
//   read — any other address on an allowed domain: may GET, never write
//   none — everyone else: cannot sign in at all
//
// Tiers are resolved from the database on demand rather than baked into the
// session, so adding someone to the teammates table upgrades them on their
// next write instead of on their next sign-in.

type Access = "edit" | "read" | "none";

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const ALLOWED_EMAIL_DOMAINS = list(process.env.ALLOWED_EMAIL_DOMAINS ?? "idinsight.org");

// Exists so a fresh database isn't locked out, and as an admin break-glass.
const EXTRA_ALLOWED_EMAILS = list(process.env.EXTRA_ALLOWED_EMAILS);

export async function resolveAccess(email: string): Promise<Access> {
  const addr = email.toLowerCase();
  if (EXTRA_ALLOWED_EMAILS.includes(addr)) return "edit";

  const teammate = await prisma.teammate.findFirst({
    where: { email: { equals: addr, mode: "insensitive" } },
    select: { id: true },
  });
  if (teammate) return "edit";

  const domain = addr.split("@")[1] ?? "";
  if (ALLOWED_EMAIL_DOMAINS.includes(domain)) return "read";

  return "none";
}

// ─── Better Auth ──────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

// An OAuth callback that throws an APIError redirects to the sign-in
// `errorCallbackURL` with `?error=<code>`, which is what the login page reads.
function denied(): never {
  throw new APIError("FORBIDDEN", {
    code: "NOT_ALLOWED",
    message: "This account is not allowed to sign in.",
  });
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders: {
    google: {
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
      prompt: "select_account",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh at most daily
    // The proxy validates a session on every request; without this that means
    // a database round-trip per request. A revoked session survives at most
    // this long. Access tier is not cached — it is always read live.
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  databaseHooks: {
    // Blocks a disallowed address the first time it signs in...
    user: {
      create: {
        before: async (user) => {
          if ((await resolveAccess(user.email)) === "none") denied();
        },
      },
    },
    session: {
      // ...and on every sign-in after that, so revoking access doesn't
      // depend on the user record never having been created.
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { email: true },
          });
          if (!user || (await resolveAccess(user.email)) === "none") denied();
        },
        after: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { email: true, name: true },
          });
          if (!user) return;
          // Sessions are deleted on sign-out and expiry, so they can't serve
          // as a login history. This table is append-only and kept forever.
          await prisma.loginLog.create({
            data: {
              userId: session.userId,
              email: user.email,
              name: user.name,
              access: await resolveAccess(user.email),
              ipAddress: session.ipAddress || null,
              userAgent: session.userAgent || null,
            },
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
