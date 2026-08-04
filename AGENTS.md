<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## API conventions

- **Keep the OpenAPI spec in sync.** Whenever you add, remove, or change an HTTP route the app serves — under `src/app/api/` or elsewhere (e.g. `src/app/.well-known/`) — update the hand-written spec in `src/app/api/openapi/route.ts` in the same change: endpoints, query params, request/response shapes, status codes.
- **Error responses** use the shape `NextResponse.json({ error: "message" }, { status })`, documented in the spec via the `#/components/schemas/Error` schema.
- **Shared reads live in `src/lib/queries.ts`.** The REST routes and the MCP
  tools at `/api/mcp` serve the same data; query logic belongs in that module
  so the two surfaces cannot drift.

## Auth

- **`src/proxy.ts` is the enforcement boundary for everything except
  `/api/mcp`.** It validates the Better Auth session, rejects accounts that may
  not sign in, and blocks writes from read-only accounts. New routes under
  `src/app/api/` therefore need no auth check of their own — but they also must
  not assume the caller may write.
- **`/api/mcp` is the one sanctioned exception.** The proxy passes it (and the
  public OAuth discovery documents under `/.well-known/`) through untouched;
  the route authenticates itself with OAuth bearer tokens via `withMcpAuth` and
  re-checks the caller's access tier per request. Every MCP tool must stay
  read-only — a write tool would need its own tier check, since the proxy's
  write-blocking never runs there. Do not add other routes under `/api/mcp` or
  `/.well-known/` expecting the proxy to cover them.
- Anything gated behind `useCanEdit()` in the UI is cosmetic. Never rely on it
  for access control.
