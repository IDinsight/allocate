import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
import type { Implementation } from "@modelcontextprotocol/server";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";
import { auth, resolveAccess, type Access } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getGroupedAllocations,
  listProjects,
  listTeammates,
  resolveFilterIds,
} from "@/lib/queries";
import { createProject, updateProject } from "@/lib/projectMutations";

// MCP endpoint (streamable HTTP). This route is the sanctioned exception to
// "src/proxy.ts is the only enforcement boundary": the proxy passes /api/mcp
// through untouched because requests carry OAuth bearer tokens, not session
// cookies, and the spec requires unauthenticated requests to get a 401 with a
// WWW-Authenticate header — which withMcpAuth below produces. The proxy's
// write block never runs here either, so every write tool must call
// requireEdit() itself — see the project tools below.

/**
 * The caller's access tier, for the duration of one request.
 *
 * The handler is built once at module load, so a tool closure cannot capture
 * per-request state — and a module-level variable would be a cross-request
 * leak, since requests interleave. AsyncLocalStorage keeps each request's tier
 * on its own async context, which the tool callbacks run inside.
 */
const callerAccess = new AsyncLocalStorage<Access>();

/**
 * Mirrors the UI exactly: `edit` means an email matching an Active teammate row
 * (or an EXTRA_ALLOWED_EMAILS entry), resolved per request by the same
 * resolveAccess the proxy uses, so revoking access takes effect at once rather
 * than when the OAuth token expires. Returns an error result, not a throw, so
 * the agent sees why it was refused.
 */
function requireEdit() {
  if (callerAccess.getStore() === "edit") return null;
  return toolError(
    "Forbidden: this account has read-only access to Allocate. Only active " +
      "IDinsight team members can change projects."
  );
}

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});

const toolError = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

const rpcError = (message: string, status: number) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status }
  );

const readOnly = { readOnlyHint: true, destructiveHint: false };
// Not destructive (nothing is removed) but not idempotent either: calling
// create_project twice makes two projects.
const writes = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
};

// The editable fields, shared by create_project and update_project. Every one
// is optional here; each tool adds its own required arguments on top. Nullable
// throughout so an agent can clear a field it can also set — with the
// exception of `name`, `status` and `billable`, which the column requires.
const PROJECT_FIELDS = z.object({
  pillar: z
    .enum(["Products", "Services", "Advisory", "Admin"])
    .nullable()
    .optional()
    .describe("Which pillar owns the project."),
  region: z
    .enum(["Global", "IND", "WNA", "ESA", "SEA"])
    .nullable()
    .optional()
    .describe("Delivery region."),
  billingRate: z
    .enum(["Internal", "L1", "Fractional", "CoImpact", "Standard"])
    .nullable()
    .optional()
    .describe("Rate card the project bills at."),
  status: z
    .enum(["Upcoming", "Active", "Paused", "Archived", "Completed"])
    .optional()
    .describe("Lifecycle status. New projects default to Upcoming."),
  conversionProbability: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe("For Upcoming work: percent chance it converts (0-100)."),
  billable: z.boolean().optional().describe("Whether the project is billable."),
  unit4Code: z.string().nullable().optional().describe("Unit4 finance code."),
  startDate: DATE.nullable().optional().describe("Start date (YYYY-MM-DD)."),
  endDate: DATE.nullable().optional().describe("End date (YYYY-MM-DD)."),
  blurb: z
    .string()
    .nullable()
    .optional()
    .describe("Short free-text description."),
  lead: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Project lead — a teammate name (case-insensitive) or id. Null clears it."
    ),
});

/** Turns the `lead` argument into the `leadId` the database wants. Absent means
 *  "don't touch"; null means "clear"; anything else must resolve to a teammate. */
async function resolveLead(
  lead: string | null | undefined
): Promise<{ leadId?: string | null } | { error: ReturnType<typeof toolError> }> {
  if (lead === undefined) return {};
  if (lead === null) return { leadId: null };

  const { ids, unmatched } = await resolveFilterIds("teammate", [lead]);
  if (unmatched.length > 0 || ids.length === 0) {
    return {
      error: toolError(
        `No teammate matches "${lead}". Check the name against list_team_members.`
      ),
    };
  }
  return { leadId: ids[0] };
}

/** The one shape a project is described in, whether an agent just listed it or
 *  just wrote it. */
const projectView = (p: Awaited<ReturnType<typeof createProject>>) =>
  compact({
    id: p.id,
    name: p.name,
    status: p.status,
    pillar: p.pillar,
    region: p.region,
    billingRate: p.billingRate,
    billable: p.billable,
    conversionProbability: p.conversionProbability,
    unit4Code: p.unit4Code,
    start: day(p.startDate),
    end: day(p.endDate),
    blurb: p.blurb,
    lead: p.lead?.name,
  });

// Strip null/undefined so agents never wade through empty fields.
const compact = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined)
  );

const day = (d: Date | null) => d?.toISOString().split("T")[0];

// Monday of the week containing `d`, in UTC.
const mondayOf = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};

// Default window when no from/to is given: ~3 months back and ~3 months
// ahead of the current week.
const DEFAULT_PAST_WEEKS = 13;
const DEFAULT_FUTURE_WEEKS = 13;

const serverInfo = {
  name: "allocate",
  version: "2.1.0",
  title: "Allocate",
  description: "IDinsight's project staffing tracker.",
  ...(process.env.BETTER_AUTH_URL && {
    websiteUrl: process.env.BETTER_AUTH_URL,
  }),
  icons: [
    {
      src: "data:image/png;base64,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",
      mimeType: "image/png",
      sizes: ["128x128"],
    },
    {
      src: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB4PSIyIiAgeT0iMiIgIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgcng9IjQiIGZpbGw9IiNjNGI1ZmQiLz4KICA8cmVjdCB4PSIxNyIgeT0iMiIgIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgcng9IjQiIGZpbGw9IiNiZmRiZmUiLz4KICA8cmVjdCB4PSIyIiAgeT0iMTciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgcng9IjQiIGZpbGw9IiNhN2YzZDAiLz4KICA8cmVjdCB4PSIxNyIgeT0iMTciIHdpZHRoPSIxMyIgaGVpZ2h0PSIxMyIgcng9IjQiIGZpbGw9IiNmZGU2OGEiLz4KPC9zdmc+Cg==",
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ],
} satisfies Implementation;

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_projects",
      {
        title: "List projects",
        description:
          "List every project: name, status, pillar, region, billing rate, " +
          "billable flag, Unit4 code, start/end, blurb, and lead (a teammate " +
          "name). Ids returned here are what update_project accepts. " +
          "Null fields are omitted. All statuses are included — filter " +
          "client-side. For staffing data use get_allocations, which accepts " +
          "these project names directly.",
        annotations: readOnly,
      },
      async () => json((await listProjects()).map(projectView))
    );

    server.registerTool(
      "create_project",
      {
        title: "Create project",
        description:
          "Create a new project. Only `name` is required; everything else " +
          "defaults (status Upcoming, not billable). Requires an account with " +
          "edit access — active IDinsight team members only. Names are not " +
          "unique, so check list_projects first and confirm with the user " +
          "before creating something that may already exist. Returns the " +
          "created project, including its id.",
        inputSchema: PROJECT_FIELDS.extend({
          name: z.string().min(1).describe("Project name."),
        }),
        annotations: writes,
      },
      async (input) => {
        const denied = requireEdit();
        if (denied) return denied;

        const { lead: leadTerm, ...fields } = input;
        const lead = await resolveLead(leadTerm);
        if ("error" in lead) return lead.error;

        return json(projectView(await createProject({ ...fields, ...lead })));
      }
    );

    server.registerTool(
      "update_project",
      {
        title: "Update project",
        description:
          "Change fields on an existing project, identified by name " +
          "(case-insensitive) or id. Only the fields you pass are touched; " +
          "everything else is left alone. Pass null to clear an optional " +
          "field. Requires an account with edit access — active IDinsight " +
          "team members only. This edits shared team data, so confirm the " +
          "change with the user before calling. Returns the updated project.",
        inputSchema: PROJECT_FIELDS.extend({
          project: z
            .string()
            .describe("Which project to change — its name or id."),
          name: z.string().min(1).optional().describe("New project name."),
        }),
        annotations: writes,
      },
      async (input) => {
        const denied = requireEdit();
        if (denied) return denied;

        const { project: target, lead: leadTerm, ...fields } = input;
        const { ids, unmatched } = await resolveFilterIds("project", [target]);
        if (unmatched.length > 0 || ids.length === 0) {
          return toolError(
            `No project matches "${target}". Check the name against ` +
              "list_projects."
          );
        }

        const lead = await resolveLead(leadTerm);
        if ("error" in lead) return lead.error;

        return json(
          projectView(await updateProject(ids[0], { ...fields, ...lead }))
        );
      }
    );

    server.registerTool(
      "list_team_members",
      {
        title: "List team members",
        description:
          "List teammates: name, email, role, level, region, status. Null " +
          "fields are omitted. Includes Active and Alumni unless filtered. " +
          "For staffing data use get_allocations, which accepts these names " +
          "directly.",
        inputSchema: z.object({
          status: z
            .enum(["Active", "Alumni"])
            .optional()
            .describe("Only return members with this status. Omit for everyone."),
        }),
        annotations: readOnly,
      },
      async ({ status }) =>
        json(
          (await listTeammates(status)).map((t) =>
            compact({
              id: t.id,
              name: t.name,
              email: t.email,
              role: t.role,
              level: t.level,
              region: t.region,
              status: t.status,
            })
          )
        )
    );

    server.registerTool(
      "get_allocations",
      {
        title: "Get allocations",
        description:
          "Weekly staffing, pre-grouped and pre-summed. groupBy 'teammate' " +
          "returns byTeammate: {teammate: {TOTAL: {week: fraction}, project: " +
          "{week: fraction}}}; groupBy 'project' is the mirror image. TOTAL " +
          "sums that teammate's (or project's) fractions per week — read " +
          "over-allocation (>100) and free capacity (<100) straight off it. " +
          "fraction is % of a work week; week keys are Mondays (YYYY-MM-DD); " +
          "a missing week means 0. When from/to are omitted the result covers " +
          "roughly 3 months back and 3 months ahead only, and says so in a " +
          "note — ask the user whether they want a different period rather " +
          "than assuming this window answers their question. Unknown filter " +
          "names return an error, not an empty result.",
        inputSchema: z.object({
          groupBy: z
            .enum(["teammate", "project"])
            .describe(
              "Pivot orientation: 'teammate' to analyse people's workloads, " +
                "'project' to analyse project staffing."
            ),
          from: DATE.optional().describe(
            "Only weeks starting on or after this date (YYYY-MM-DD)."
          ),
          to: DATE.optional().describe(
            "Only weeks starting on or before this date (YYYY-MM-DD)."
          ),
          teammates: z
            .array(z.string())
            .optional()
            .describe("Only these teammates — names (case-insensitive) or ids."),
          projects: z
            .array(z.string())
            .optional()
            .describe("Only these projects — names (case-insensitive) or ids."),
        }),
        annotations: readOnly,
      },
      async ({ groupBy, from, to, teammates, projects }) => {
        const [t, p] = await Promise.all([
          resolveFilterIds("teammate", teammates ?? []),
          resolveFilterIds("project", projects ?? []),
        ]);
        const unmatched = [...t.unmatched, ...p.unmatched];
        if (unmatched.length > 0) {
          return toolError(
            `No teammate or project matches: ${unmatched.join(", ")}. ` +
              "Check spelling against list_team_members / list_projects."
          );
        }

        let effectiveFrom = from;
        let effectiveTo = to;
        const defaulted = !from && !to;
        if (defaulted) {
          const monday = mondayOf(new Date());
          const start = new Date(monday);
          start.setUTCDate(start.getUTCDate() - DEFAULT_PAST_WEEKS * 7);
          const end = new Date(monday);
          end.setUTCDate(end.getUTCDate() + DEFAULT_FUTURE_WEEKS * 7);
          effectiveFrom = start.toISOString().split("T")[0];
          effectiveTo = end.toISOString().split("T")[0];
        }

        const grouped = await getGroupedAllocations(
          {
            from: effectiveFrom,
            to: effectiveTo,
            teammateIds: teammates?.length ? t.ids : undefined,
            projectIds: projects?.length ? p.ids : undefined,
          },
          groupBy
        );
        return json(
          defaulted
            ? {
                note:
                  `No from/to given, so this covers only the default window ` +
                  `${effectiveFrom} to ${effectiveTo} (≈3 months back and ` +
                  `ahead). If the user's question concerns another period, ` +
                  `ask them and re-query with explicit from/to.`,
                ...grouped,
                from: effectiveFrom,
                to: effectiveTo,
              }
            : grouped
        );
      }
    );
  },
  {
    serverInfo,
    instructions:
      "Access to Allocate, IDinsight's project staffing tracker. Staffing and " +
      "team data are read-only; the project list can also be written, via " +
      "create_project and update_project, and only by accounts with edit " +
      "access (active IDinsight team members) — other callers get a clear " +
      "error. Project writes change data the whole team sees, so confirm the " +
      "specific change with the user before calling, and check list_projects " +
      "first so you edit an existing project rather than duplicating it. " +
      "get_allocations returns pre-grouped, pre-summed data keyed by names — " +
      "no id resolution or arithmetic needed: each group's TOTAL row is the " +
      "per-week sum (100 = fully booked). Weeks are Mondays; a missing week " +
      "means 0. Without from/to, get_allocations covers only ≈3 months back " +
      "and 3 months ahead and flags this in a note — when a question implies " +
      "a different period, ask the user for the range instead of assuming.",
  }
);

// "none" (access revoked after the token was issued) is rejected outright;
// "read" and "edit" both get in, and the write tools re-check for "edit".
const handler = withMcpAuth(auth, async (req, session) => {
  const origin = req.headers.get("origin");
  const allowedOrigin = process.env.BETTER_AUTH_URL;
  if (origin && (!allowedOrigin || new URL(allowedOrigin).origin !== origin)) {
    // Spec-required DNS-rebinding protection. Non-browser MCP clients don't
    // send Origin and are unaffected.
    return rpcError("Origin not allowed", 403);
  }

  const user = session.userId
    ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: { email: true },
      })
    : null;
  const access = user ? await resolveAccess(user.email) : "none";
  if (access === "none") {
    return rpcError("Forbidden: account has no access", 403);
  }

  // Everything the handler does — including every tool callback — runs inside
  // this context, which is how requireEdit() sees the caller's tier.
  return callerAccess.run(access, () => mcpHandler(req));
});

export { handler as GET, handler as POST, handler as DELETE };
