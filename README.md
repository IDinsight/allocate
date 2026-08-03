# Allocate

Staff allocation tracker for IDinsight. Shows who is working on what, week by
week, as an editable grid you can view by project or by teammate — plus project
and teammate tables, a shared notepad, and a read-only JSON API for agents and
scripts.

Built with Next.js 16 (App Router), React 19, Tailwind 4, Prisma 7 against
Postgres, and Better Auth for Google sign-in.

## Setup

Requires Node 20+, [pnpm](https://pnpm.io), and a Postgres database — either the
shared one or [a local one](#optional-a-local-postgres).

```bash
pnpm install
cp template.env .env    # then fill it in — see below
pnpm exec prisma migrate deploy
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | Pooled connection, used by the app at runtime |
| `DIRECT_URL` | Direct connection, used for migrations |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client, for sign-in |
| `BETTER_AUTH_SECRET` | Signs sessions. Generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | This deployment's public origin, used for OAuth redirects |
| `ALLOWED_EMAIL_DOMAINS` | Optional, comma-separated. Domains that may sign in. Defaults to `idinsight.org` |
| `EXTRA_ALLOWED_EMAILS` | Optional, comma-separated. Emails granted edit access without a teammate record |
| `READONLY_API_KEYS` | Optional, comma-separated. Grants GET-only API access |

### Optional: a local Postgres

You can point `.env` at the shared database, but running your own keeps
experiments off it. With Docker:

```bash
docker run --name allocate-db -e POSTGRES_PASSWORD=allocate \
  -e POSTGRES_DB=allocate -p 5433:5432 -d postgres:17
```

Port 5433 avoids clashing with a Postgres you may already have on 5432. Set both
URLs to it — there is no pooler locally, so they are the same:

```bash
DATABASE_URL=postgresql://postgres:allocate@localhost:5433/allocate
DIRECT_URL=postgresql://postgres:allocate@localhost:5433/allocate
```

Then `pnpm exec prisma migrate deploy` creates the schema. No extensions are
needed. The database starts empty, so set `EXTRA_ALLOWED_EMAILS` to your own
address — otherwise you can sign in but everything is read-only.

`docker start allocate-db` brings it back after a reboot; `docker rm -f
allocate-db` throws it away. To work with real data instead, restore the dump in
`data/` or run `data/seed.py`.

## Auth

Sign-in is Google OAuth only, handled by [Better Auth](https://www.better-auth.com).
There are three tiers, resolved from the email Google returns:

| Who | What they get |
| --- | --- |
| On the `teammates` list, or in `EXTRA_ALLOWED_EMAILS` | Full edit access |
| Any other address on an allowed domain (`idinsight.org` by default) | Read-only |
| Everyone else | Cannot sign in |

Read-only accounts may make GET and HEAD requests and nothing else.
`src/proxy.ts` enforces this on every request and rejects writes with 403; the UI
hides editing affordances to match, but the proxy is the boundary that counts.

Tiers are resolved from the database per request rather than stored on the
session, so both granting and revoking access take effect without signing out.
Adding someone to the teammates table lets them write immediately, though the UI
only unlocks its editing affordances after a page reload. Sessions last 30 days
and are cached in a signed cookie for 5 minutes, so a deleted session survives
that long — but an access tier is never cached.

`EXTRA_ALLOWED_EMAILS` exists because a fresh database has no teammates, which
would leave the whole app read-only. It is also a break-glass for admins who are
not themselves on the team.

### Login history

Better Auth deletes `session` rows on sign-out and expiry, so they show who is
signed in now, not who has ever signed in. Every sign-in is therefore also
appended to a `login_log` table (email, name, `access` tier, IP, user agent,
timestamp),
which is never pruned:

```sql
SELECT "createdAt", email, access, "ipAddress" FROM login_log ORDER BY "createdAt" DESC LIMIT 20;
```

### Google client setup

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
create an OAuth 2.0 Web application client and register an authorised redirect
URI for every origin you run on, each ending in `/api/auth/callback/google`:

```text
http://localhost:3000/api/auth/callback/google
https://your-deployment.example.com/api/auth/callback/google
```

Google requires an exact full-path match, so a bare origin will not work.

## API

Every endpoint lives under `/api` and requires auth: either a browser session
cookie, or a read-only key from `READONLY_API_KEYS` passed as
`Authorization: Bearer <key>` (or `x-api-key`). Read-only keys may only make GET
and HEAD requests; anything else returns 403. The exception is `/api/auth/*`,
which Better Auth serves and which must stay reachable to signed-out visitors.
Pages are gated too — an unauthenticated browser request is redirected to
`/login`.

The full contract is served as OpenAPI 3.1 from
[`/api/openapi`](http://localhost:3000/api/openapi) — hand an agent the base URL
and a key and point it there. It is hand-written in
[`src/app/api/openapi/route.ts`](src/app/api/openapi/route.ts) and must be kept
in sync whenever a route changes.

## Database

The schema lives in [`prisma/schema.prisma`](prisma/schema.prisma). After
editing it:

```bash
pnpm exec prisma migrate dev --name describe_your_change
```

`prisma generate` runs automatically on install and build, emitting the client
to `src/generated/prisma`. `data/seed.py` imports the original allocations
spreadsheet into an empty database.

## Deployment

`pnpm build` compiles the app; `pnpm start` runs `prisma migrate deploy` before
booting, so migrations apply on release. Set every environment variable above in
the hosting platform, and add that deployment's callback URL to the Google OAuth
client.
