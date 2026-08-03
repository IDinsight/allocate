<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## API conventions

- **Keep the OpenAPI spec in sync.** Whenever you add, remove, or change an API route under `src/app/api/` — new endpoints, query params, request/response shapes, or status codes — update the hand-written spec in `src/app/api/openapi/route.ts` in the same change.
- **Error responses** use the shape `NextResponse.json({ error: "message" }, { status })`, documented in the spec via the `#/components/schemas/Error` schema.

## Auth

- **`src/proxy.ts` is the only enforcement boundary.** It validates the Better
  Auth session, rejects accounts that may not sign in, and blocks writes from
  read-only accounts. New routes under `src/app/api/` therefore need no auth
  check of their own — but they also must not assume the caller may write.
- Anything gated behind `useCanEdit()` in the UI is cosmetic. Never rely on it
  for access control.
