import { NextResponse } from "next/server";

// Machine-readable API contract. Served under /api/* so the read-only Bearer
// key (GET /api/* only) can fetch it — hand an agent the base URL + key and
// point it here. Keep in sync with the route handlers and prisma/schema.prisma.

const REGION = ["Global", "IND", "WNA", "ESA", "SEA"];

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Allocate API",
    version: "1.0.0",
    description:
      "Staff allocation tracker. All endpoints require auth except /api/auth/* " +
      "(the sign-in flow) and the OAuth discovery documents under " +
      "/.well-known/. A read-only API key (`Authorization: " +
      "Bearer <key>`, or the `x-api-key` header) grants GET and HEAD only; any " +
      "other method returns 403. Browser sessions come from signing in with " +
      "Google: teammates may use every method, while other allowed-domain " +
      "accounts are read-only and get 403 on writes. Unauthenticated requests " +
      "get 401. MCP clients connect to /api/mcp instead, authenticating with " +
      "OAuth 2.1 (this app is the authorization server; users sign in with " +
      "Google) — see the mcp-tagged paths.",
  },
  servers: [{ url: "/", description: "Same origin as this document" }],
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
  tags: [
    { name: "projects" },
    { name: "teammates" },
    { name: "allocations" },
    { name: "notepad" },
    { name: "meta" },
    { name: "auth" },
    { name: "mcp" },
  ],
  paths: {
    "/api/projects": {
      get: {
        tags: ["projects"],
        summary: "List all projects (with lead), ordered by status then name",
        responses: {
          "200": {
            description: "Projects",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Project" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["projects"],
        summary: "Create a project (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProjectInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created project",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Project" },
              },
            },
          },
        },
      },
    },
    "/api/projects/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      patch: {
        tags: ["projects"],
        summary: "Update a project (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProjectInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated project",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Project" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["projects"],
        summary: "Delete a project (write — blocked for read-only keys)",
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Ok" },
              },
            },
          },
        },
      },
    },
    "/api/team": {
      get: {
        tags: ["teammates"],
        summary: "List active teammates (id + name only), ordered by name",
        responses: {
          "200": {
            description: "Active teammates",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TeammateRef" },
                },
              },
            },
          },
        },
      },
    },
    "/api/teammates": {
      get: {
        tags: ["teammates"],
        summary: "List all teammates, ordered by status then name",
        responses: {
          "200": {
            description: "Teammates",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Teammate" },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["teammates"],
        summary: "Create a teammate (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TeammateInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created teammate",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Teammate" },
              },
            },
          },
        },
      },
    },
    "/api/teammates/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      patch: {
        tags: ["teammates"],
        summary: "Update a teammate (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TeammateInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated teammate",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Teammate" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["teammates"],
        summary: "Delete a teammate (write — blocked for read-only keys)",
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Ok" },
              },
            },
          },
          "409": {
            description: "Has allocations; set status to Alumni instead",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/api/allocations": {
      get: {
        tags: ["allocations"],
        summary:
          "List allocations, optionally filtered by week-start range, teammate, or project",
        parameters: [
          {
            name: "from",
            in: "query",
            required: false,
            description: "Inclusive lower bound on weekStart (YYYY-MM-DD).",
            schema: { type: "string", format: "date" },
          },
          {
            name: "to",
            in: "query",
            required: false,
            description: "Inclusive upper bound on weekStart (YYYY-MM-DD).",
            schema: { type: "string", format: "date" },
          },
          {
            name: "teammateId",
            in: "query",
            required: false,
            description:
              "Restrict to one or more teammates by id. Comma-separate multiple ids (e.g. `id1,id2`).",
            schema: { type: "string" },
          },
          {
            name: "projectId",
            in: "query",
            required: false,
            description:
              "Restrict to one or more projects by id. Comma-separate multiple ids (e.g. `id1,id2`).",
            schema: { type: "string" },
          },
          {
            name: "teammates",
            in: "query",
            required: false,
            description:
              "Restrict to one or more teammates by name (case-insensitive) or id, comma-separated. Unknown terms return 400.",
            schema: { type: "string" },
          },
          {
            name: "projects",
            in: "query",
            required: false,
            description:
              "Restrict to one or more projects by name (case-insensitive) or id, comma-separated. Unknown terms return 400.",
            schema: { type: "string" },
          },
          {
            name: "groupBy",
            in: "query",
            required: false,
            description:
              "Return the pre-pivoted GroupedAllocations shape instead of flat rows: " +
              "`teammate` nests teammate → project → {week: fraction}, `project` is the mirror. " +
              "Each group includes a TOTAL entry summing fractions per week. " +
              "Hidden allocations are excluded from this view.",
            schema: { type: "string", enum: ["teammate", "project"] },
          },
        ],
        responses: {
          "200": {
            description:
              "Without groupBy: allocations plus the distinct sorted week-starts (empty arrays when nothing matches). " +
              "With groupBy: the GroupedAllocations shape.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    {
                      type: "object",
                      required: ["allocations", "weekStarts"],
                      properties: {
                        allocations: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Allocation" },
                        },
                        weekStarts: {
                          type: "array",
                          items: { type: "string", format: "date" },
                        },
                      },
                    },
                    { $ref: "#/components/schemas/GroupedAllocations" },
                  ],
                },
              },
            },
          },
          "400": {
            description:
              "Invalid groupBy value, or a teammates/projects term matched nothing",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      post: {
        tags: ["allocations"],
        summary:
          "Upsert an allocation for a teammate/project/week (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["teammateId", "projectId", "weekStart", "fraction"],
                properties: {
                  teammateId: { type: "string" },
                  projectId: { type: "string" },
                  weekStart: { type: "string", format: "date" },
                  fraction: {
                    type: "integer",
                    description: "Percentage points of the week (e.g. 50).",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created/updated allocation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Allocation" },
              },
            },
          },
        },
      },
    },
    "/api/allocations/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      put: {
        tags: ["allocations"],
        summary:
          "Set an allocation's fraction; fraction 0 deletes it (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fraction"],
                properties: { fraction: { type: "integer" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated allocation, or { deleted: true } if fraction was 0",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/Allocation" },
                    {
                      type: "object",
                      properties: { deleted: { type: "boolean" } },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["allocations"],
        summary: "Delete an allocation (write — blocked for read-only keys)",
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Ok" },
              },
            },
          },
        },
      },
    },
    "/api/notepad": {
      get: {
        tags: ["notepad"],
        summary: "Get the shared singleton notepad",
        responses: {
          "200": {
            description: "Notepad",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Notepad" },
              },
            },
          },
        },
      },
      patch: {
        tags: ["notepad"],
        summary: "Replace notepad content (write — blocked for read-only keys)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["content"],
                properties: { content: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated notepad",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Notepad" },
              },
            },
          },
        },
      },
    },
    "/api/version": {
      get: {
        tags: ["meta"],
        summary:
          "Cheap change-detection signature for live-sync polling (no entity data)",
        responses: {
          "200": {
            description: "Signatures",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["data", "notepad"],
                  properties: {
                    data: {
                      type: "string",
                      description:
                        "Combined `count:maxUpdatedAt` signature for projects|teammates|allocations.",
                    },
                    notepad: {
                      type: "string",
                      description: "Notepad updatedAt ISO string, or empty.",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/openapi": {
      get: {
        tags: ["meta"],
        summary: "This OpenAPI document",
        responses: { "200": { description: "OpenAPI 3.1 spec" } },
      },
    },
    "/api/auth/{path}": {
      get: {
        tags: ["auth"],
        summary: "Better Auth endpoints (browser flow)",
        description:
          "Sign-in, the Google OAuth callback (`/api/auth/callback/google`), " +
          "session lookup and sign-out are all served by Better Auth under " +
          "this prefix. Browser-only; API clients should use a read-only key " +
          "instead. Accounts that may not sign in are redirected to " +
          "`/login?error=NOT_ALLOWED`.",
        security: [],
        parameters: [
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Better Auth sub-path, e.g. `callback/google`",
          },
        ],
        responses: {
          "200": { description: "Endpoint-specific payload" },
          "302": { description: "Redirect (OAuth flows)" },
        },
      },
      post: {
        tags: ["auth"],
        summary: "Better Auth endpoints (sign-in, sign-out)",
        security: [],
        parameters: [
          {
            name: "path",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Better Auth sub-path, e.g. `sign-in/social`",
          },
        ],
        responses: { "200": { description: "Endpoint-specific payload" } },
      },
    },
    "/api/mcp": {
      post: {
        tags: ["mcp"],
        summary: "MCP endpoint (streamable HTTP, JSON-RPC)",
        description:
          "Model Context Protocol server exposing read-only tools: " +
          "`list_projects`, `list_team_members`, and `get_allocations`. Not a " +
          "REST endpoint — connect with an MCP client, which authenticates " +
          "via OAuth 2.1 with PKCE and Dynamic Client Registration " +
          "(discovery under /.well-known/) and signs the user in through the " +
          "normal Google flow. Read-only API keys do not work here. " +
          "Unauthenticated requests get 401 with a `WWW-Authenticate` header " +
          "pointing at the protected-resource metadata; accounts whose " +
          "access tier is revoked get 403.",
        security: [{ mcpOAuth: [] }],
        responses: {
          "200": { description: "JSON-RPC response" },
          "401": { description: "Missing or expired bearer token" },
          "403": {
            description:
              "Account has no access, or the Origin header is not this deployment",
          },
        },
      },
      get: {
        tags: ["mcp"],
        summary: "MCP server-to-client stream (streamable HTTP)",
        security: [{ mcpOAuth: [] }],
        responses: {
          "401": { description: "Missing or expired bearer token" },
          "405": { description: "Stateless server; no standalone stream" },
        },
      },
      delete: {
        tags: ["mcp"],
        summary: "MCP session teardown (no-op — sessions are stateless)",
        security: [{ mcpOAuth: [] }],
        responses: {
          "401": { description: "Missing or expired bearer token" },
          "405": { description: "Stateless server; nothing to tear down" },
        },
      },
    },
    "/.well-known/oauth-authorization-server": {
      get: {
        tags: ["mcp"],
        summary: "OAuth 2.1 authorization-server metadata (RFC 8414)",
        security: [],
        responses: { "200": { description: "Authorization-server metadata" } },
      },
    },
    "/.well-known/oauth-protected-resource": {
      get: {
        tags: ["mcp"],
        summary: "OAuth protected-resource metadata for /api/mcp (RFC 9728)",
        description:
          "Also served with the resource path appended " +
          "(`/.well-known/oauth-protected-resource/api/mcp`), which MCP " +
          "clients probe first.",
        security: [],
        responses: { "200": { description: "Protected-resource metadata" } },
      },
    },
    "/api/me": {
      get: {
        tags: ["auth"],
        summary: "The signed-in account and its access tier",
        description:
          "`access` is `edit` for Active teammates and `EXTRA_ALLOWED_EMAILS` " +
          "addresses, `read` for Alumni teammates and anyone else on an " +
          "allowed email domain. " +
          "Read-only accounts get 403 on anything but GET and HEAD; accounts " +
          "on neither list are rejected outright, so `none` never reaches a " +
          "caller.",
        responses: {
          "200": {
            description: "Current account",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    email: { type: "string" },
                    name: { type: "string" },
                    access: { type: "string", enum: ["edit", "read"] },
                  },
                },
              },
            },
          },
          "401": { description: "Not signed in" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Read-only API key. Grants GET/HEAD on /api/* only; anything else " +
          "returns 403. Not accepted at /api/mcp, which is OAuth-only.",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "The same read-only key, as a header instead of a Bearer token.",
      },
      mcpOAuth: {
        type: "oauth2",
        description:
          "OAuth 2.1 for /api/mcp only. MCP clients self-register via Dynamic " +
          "Client Registration; end users authenticate with Google.",
        flows: {
          authorizationCode: {
            authorizationUrl: "/api/auth/mcp/authorize",
            tokenUrl: "/api/auth/mcp/token",
            scopes: {
              openid: "OpenID Connect",
              profile: "Name and picture",
              email: "Email address",
              offline_access: "Refresh tokens",
            },
          },
        },
      },
    },
    schemas: {
      Role: { type: "string", enum: ["DS", "DE", "FSE", "PM"] },
      Level: {
        type: "string",
        enum: ["INT", "I", "II", "III", "IV", "AD", "D"],
      },
      Region: { type: "string", enum: REGION },
      TeammateStatus: { type: "string", enum: ["Active", "Alumni"] },
      Pillar: {
        type: "string",
        enum: ["Products", "Services", "Advisory", "Admin"],
      },
      BillingRate: {
        type: "string",
        enum: ["Internal", "L1", "Fractional", "CoImpact", "Standard"],
      },
      ProjectStatus: {
        type: "string",
        enum: ["Upcoming", "Active", "Paused", "Archived", "Completed"],
      },
      TeammateRef: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      },
      Teammate: {
        type: "object",
        required: ["id", "name", "status", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: ["string", "null"] },
          role: {
            oneOf: [{ $ref: "#/components/schemas/Role" }, { type: "null" }],
          },
          level: {
            oneOf: [{ $ref: "#/components/schemas/Level" }, { type: "null" }],
          },
          region: {
            oneOf: [{ $ref: "#/components/schemas/Region" }, { type: "null" }],
          },
          status: { $ref: "#/components/schemas/TeammateStatus" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      TeammateInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: ["string", "null"] },
          role: { $ref: "#/components/schemas/Role" },
          level: { $ref: "#/components/schemas/Level" },
          region: { $ref: "#/components/schemas/Region" },
          status: { $ref: "#/components/schemas/TeammateStatus" },
        },
      },
      Project: {
        type: "object",
        required: [
          "id",
          "name",
          "status",
          "billable",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          pillar: {
            oneOf: [{ $ref: "#/components/schemas/Pillar" }, { type: "null" }],
          },
          region: {
            oneOf: [{ $ref: "#/components/schemas/Region" }, { type: "null" }],
          },
          billingRate: {
            oneOf: [
              { $ref: "#/components/schemas/BillingRate" },
              { type: "null" },
            ],
          },
          status: { $ref: "#/components/schemas/ProjectStatus" },
          conversionProbability: { type: ["integer", "null"] },
          billable: { type: "boolean" },
          unit4Code: { type: ["string", "null"] },
          startDate: { type: ["string", "null"], format: "date" },
          endDate: { type: ["string", "null"], format: "date" },
          blurb: { type: ["string", "null"] },
          leadId: { type: ["string", "null"] },
          lead: {
            oneOf: [
              { $ref: "#/components/schemas/TeammateRef" },
              { type: "null" },
            ],
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ProjectInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          pillar: { $ref: "#/components/schemas/Pillar" },
          region: { $ref: "#/components/schemas/Region" },
          billingRate: { $ref: "#/components/schemas/BillingRate" },
          status: { $ref: "#/components/schemas/ProjectStatus" },
          conversionProbability: { type: ["integer", "null"] },
          billable: { type: "boolean" },
          unit4Code: { type: ["string", "null"] },
          startDate: { type: ["string", "null"], format: "date" },
          endDate: { type: ["string", "null"], format: "date" },
          blurb: { type: ["string", "null"] },
          leadId: { type: ["string", "null"] },
        },
      },
      Allocation: {
        type: "object",
        required: [
          "id",
          "teammateId",
          "projectId",
          "weekStart",
          "fraction",
          "isHidden",
        ],
        properties: {
          id: { type: "string" },
          teammateId: { type: "string" },
          projectId: { type: "string" },
          weekStart: { type: "string", format: "date" },
          fraction: { type: "integer" },
          isHidden: { type: "boolean" },
        },
      },
      GroupedAllocations: {
        type: "object",
        description:
          "Pre-pivoted staffing view. Exactly one of byTeammate/byProject is " +
          "present, matching the groupBy parameter. Outer keys are names " +
          "(suffixed with an id fragment only on collision); each group maps " +
          "its counterpart names to {week: fraction} plus a TOTAL entry " +
          "summing fractions per week. Weeks are Mondays (YYYY-MM-DD); a " +
          "missing week means 0. Hidden allocations are excluded.",
        required: ["unit"],
        properties: {
          unit: { type: "string" },
          from: { type: "string", format: "date" },
          to: { type: "string", format: "date" },
          byTeammate: {
            type: "object",
            additionalProperties: {
              type: "object",
              additionalProperties: {
                type: "object",
                additionalProperties: { type: "integer" },
              },
            },
          },
          byProject: {
            type: "object",
            additionalProperties: {
              type: "object",
              additionalProperties: {
                type: "object",
                additionalProperties: { type: "integer" },
              },
            },
          },
        },
      },
      Notepad: {
        type: "object",
        required: ["id", "content", "updatedAt"],
        properties: {
          id: { type: "string" },
          content: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Ok: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
} as const;

export function GET() {
  return NextResponse.json(spec);
}
