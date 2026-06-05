<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## API conventions

- **Keep the OpenAPI spec in sync.** Whenever you add, remove, or change an API route under `src/app/api/` — new endpoints, query params, request/response shapes, or status codes — update the hand-written spec in `src/app/api/openapi/route.ts` in the same change.
- **Error responses** use the shape `NextResponse.json({ error: "message" }, { status })`, documented in the spec via the `#/components/schemas/Error` schema.
