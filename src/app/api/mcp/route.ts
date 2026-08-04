import { createMcpHandler } from "mcp-handler";
import { withMcpAuth } from "better-auth/plugins";
import { z } from "zod";
import { auth, resolveAccess } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getGroupedAllocations,
  listProjects,
  listTeammates,
  resolveFilterIds,
} from "@/lib/queries";

// MCP endpoint (streamable HTTP). This route is the sanctioned exception to
// "src/proxy.ts is the only enforcement boundary": the proxy passes /api/mcp
// through untouched because requests carry OAuth bearer tokens, not session
// cookies, and the spec requires unauthenticated requests to get a 401 with a
// WWW-Authenticate header — which withMcpAuth below produces. Every tool here
// must stay read-only; a write tool would need its own access-tier check.

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

const DEFAULT_WINDOW_WEEKS = 12;

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_projects",
      {
        title: "List projects",
        description:
          "List every project: name, status, pillar, region, billing rate, " +
          "billable flag, start/end, blurb, and lead (a teammate name). " +
          "Null fields are omitted. All statuses are included — filter " +
          "client-side. For staffing data use get_allocations, which accepts " +
          "these project names directly.",
        annotations: readOnly,
      },
      async () =>
        json(
          (await listProjects()).map((p) =>
            compact({
              id: p.id,
              name: p.name,
              status: p.status,
              pillar: p.pillar,
              region: p.region,
              billingRate: p.billingRate,
              billable: p.billable,
              conversionProbability: p.conversionProbability,
              start: day(p.startDate),
              end: day(p.endDate),
              blurb: p.blurb,
              lead: p.lead?.name,
            })
          )
        )
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
          "a missing week means 0. Defaults to the current week plus " +
          `${DEFAULT_WINDOW_WEEKS} weeks when from/to are omitted — pass ` +
          "explicit dates for history. Unknown filter names return an error, " +
          "not an empty result.",
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
        if (!from && !to) {
          const start = mondayOf(new Date());
          const end = new Date(start);
          end.setUTCDate(end.getUTCDate() + DEFAULT_WINDOW_WEEKS * 7);
          effectiveFrom = start.toISOString().split("T")[0];
          effectiveTo = end.toISOString().split("T")[0];
        }

        return json(
          await getGroupedAllocations(
            {
              from: effectiveFrom,
              to: effectiveTo,
              teammateIds: teammates?.length ? t.ids : undefined,
              projectIds: projects?.length ? p.ids : undefined,
            },
            groupBy
          )
        );
      }
    );
  },
  {
    serverInfo: { name: "allocate", version: "2.0.0" },
    instructions:
      "Read-only access to Allocate, IDinsight's project staffing tracker. " +
      "get_allocations returns pre-grouped, pre-summed data keyed by names — " +
      "no id resolution or arithmetic needed: each group's TOTAL row is the " +
      "per-week sum (100 = fully booked). Weeks are Mondays; a missing week " +
      "means 0. Without from/to it covers the current week plus " +
      `${DEFAULT_WINDOW_WEEKS} weeks, so pass dates explicitly for history.`,
  }
);

// The tools are read-only, so "read" and "edit" tiers are treated the same;
// only "none" (access revoked after the token was issued) is rejected.
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
  if (!user || (await resolveAccess(user.email)) === "none") {
    return rpcError("Forbidden: account has no access", 403);
  }

  return mcpHandler(req);
});

export { handler as GET, handler as POST, handler as DELETE };
