# Allocate

Staff allocation tracker for IDinsight. Shows who is working on what, week by
week, as an editable grid you can view by project or by teammate — plus project
and teammate tables, a shared notepad, and a read-only JSON API for agents and
scripts.

Built with Next.js 16 (App Router), React 19, Tailwind 4, and Prisma 7 against
Postgres.

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
| `AUTH_SECRET` | Signs the session cookie. Generate with `openssl rand -hex 32` |
| `EXTRA_ALLOWED_EMAILS` | Optional, comma-separated. Emails that may sign in without a teammate record |
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
address or you will not be able to log in.

`docker start allocate-db` brings it back after a reboot; `docker rm -f
allocate-db` throws it away. To work with real data instead, restore the dump in
`data/` or run `data/seed.py`.

### Google sign-in

Sign-in is Google OAuth only, and **only emails already present in the
`teammates` table can log in** — everyone else is bounced back to the login page.
To add someone, add them as a teammate with their work email first.

That rule locks you out of an empty database, since there is no teammate to
match. `EXTRA_ALLOWED_EMAILS` is the way in: any address listed there can sign in
regardless of the teammates table, so set it before the first login on a fresh
deployment. It stays useful afterwards as a break-glass for admins who are not
themselves on the team.

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
create an OAuth 2.0 Web application client and register an authorised redirect
URI for every origin you run on, each ending in `/api/auth/google/callback`:

```text
http://localhost:3000/api/auth/google/callback
https://your-deployment.example.com/api/auth/google/callback
```

Google requires an exact full-path match, so a bare origin will not work.

## API

Every endpoint lives under `/api` and requires auth: either a browser session
cookie, or a read-only key from `READONLY_API_KEYS` passed as
`Authorization: Bearer <key>` (or `x-api-key`). Read-only keys may only make GET
requests; anything else returns 403.

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
