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
      "Staff allocation tracker. All endpoints require auth. A read-only API " +
      "key (`Authorization: Bearer <key>`) grants access to GET requests only; " +
      "non-GET methods with such a key return 403. Browser sessions (the `auth` " +
      "cookie) may use every method.",
  },
  servers: [{ url: "/", description: "Same origin as this document" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "projects" },
    { name: "teammates" },
    { name: "allocations" },
    { name: "notepad" },
    { name: "meta" },
    { name: "auth" },
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
        summary: "List allocations, optionally filtered by week-start range",
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
        ],
        responses: {
          "200": {
            description: "Allocations plus the distinct sorted week-starts",
            content: {
              "application/json": {
                schema: {
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
    "/api/auth/login": {
      post: {
        tags: ["auth"],
        summary: "Exchange the site password for an auth cookie",
        security: [],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["password"],
                properties: { password: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sets the `auth` cookie" },
          "401": { description: "Wrong password" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Clear the auth cookie",
        responses: { "200": { description: "Logged out" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Read-only API key. Grants GET access to /api/* only; non-GET returns 403.",
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
