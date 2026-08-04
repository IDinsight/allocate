import { prisma } from "@/lib/prisma";
import type { TeammateStatus } from "@/generated/prisma/enums";

// Shared read queries, used by both the REST routes under /api and the MCP
// tools at /api/mcp so the two surfaces cannot drift.

export function listProjects() {
  return prisma.project.findMany({
    include: { lead: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export function listTeammates(status?: TeammateStatus) {
  return prisma.teammate.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

// Narrow projection for pickers: Active members only, id and name.
export function listTeam() {
  return prisma.teammate.findMany({
    where: { status: "Active" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type AllocationFilter = {
  from?: string;
  to?: string;
  teammateIds?: string[];
  projectIds?: string[];
};

const toDateString = (d: Date) => d.toISOString().split("T")[0];

export async function getAllocations(filter: AllocationFilter) {
  const { from, to, teammateIds, projectIds } = filter;

  const where: Record<string, unknown> = {};
  if (from || to) {
    const weekStart: Record<string, Date> = {};
    if (from) weekStart.gte = new Date(from);
    if (to) weekStart.lte = new Date(to);
    where.weekStart = weekStart;
  }
  if (teammateIds && teammateIds.length > 0) {
    where.teammateId =
      teammateIds.length === 1 ? teammateIds[0] : { in: teammateIds };
  }
  if (projectIds && projectIds.length > 0) {
    where.projectId =
      projectIds.length === 1 ? projectIds[0] : { in: projectIds };
  }

  const [allocations, weekStartsRaw] = await Promise.all([
    prisma.allocation.findMany({
      where,
      select: {
        id: true,
        teammateId: true,
        projectId: true,
        weekStart: true,
        fraction: true,
        isHidden: true,
      },
      orderBy: { weekStart: "asc" },
    }),
    prisma.allocation.findMany({
      where,
      select: { weekStart: true },
      distinct: ["weekStart"],
      orderBy: { weekStart: "asc" },
    }),
  ]);

  return {
    allocations: allocations.map((a) => ({
      ...a,
      weekStart: toDateString(a.weekStart),
    })),
    weekStarts: weekStartsRaw.map((w) => toDateString(w.weekStart)),
  };
}

// ─── Agent-facing grouped view ────────────────────────────

// Resolves user-supplied filter terms — names or ids, case-insensitive on
// names — to ids. Unmatched terms are returned so callers can reject typos
// loudly instead of silently returning an empty result.
export async function resolveFilterIds(
  kind: "teammate" | "project",
  terms: string[]
): Promise<{ ids: string[]; unmatched: string[] }> {
  const cleaned = terms.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return { ids: [], unmatched: [] };

  const rows: { id: string; name: string }[] =
    kind === "teammate"
      ? await prisma.teammate.findMany({ select: { id: true, name: true } })
      : await prisma.project.findMany({ select: { id: true, name: true } });

  const ids: string[] = [];
  const unmatched: string[] = [];
  for (const term of cleaned) {
    const lower = term.toLowerCase();
    const hit = rows.find(
      (r) => r.id === term || r.name.toLowerCase() === lower
    );
    if (hit) ids.push(hit.id);
    else unmatched.push(term);
  }
  return { ids, unmatched };
}

export type GroupBy = "teammate" | "project";

export type GroupedAllocations = {
  unit: string;
  from?: string;
  to?: string;
  byTeammate?: Record<string, Record<string, Record<string, number>>>;
  byProject?: Record<string, Record<string, Record<string, number>>>;
};

const UNIT =
  "fraction is % of a work week; keys are week-start Mondays (YYYY-MM-DD); a missing week means 0";

// Pre-pivoted view for agents: outer key is the teammate (or project), inner
// keys are that person's projects (or that project's people) plus a TOTAL row
// summing across them per week. Grouping and summing happen here — in code —
// because they are exactly the steps language models get subtly wrong when
// handed flat rows. Hidden allocations are excluded.
export async function getGroupedAllocations(
  filter: AllocationFilter,
  groupBy: GroupBy
): Promise<GroupedAllocations> {
  const { from, to, teammateIds, projectIds } = filter;

  const where: Record<string, unknown> = { isHidden: false };
  if (from || to) {
    const weekStart: Record<string, Date> = {};
    if (from) weekStart.gte = new Date(from);
    if (to) weekStart.lte = new Date(to);
    where.weekStart = weekStart;
  }
  if (teammateIds && teammateIds.length > 0) {
    where.teammateId = { in: teammateIds };
  }
  if (projectIds && projectIds.length > 0) {
    where.projectId = { in: projectIds };
  }

  const rows = await prisma.allocation.findMany({
    where,
    select: {
      weekStart: true,
      fraction: true,
      teammate: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { weekStart: "asc" },
  });

  // Names are display keys, so duplicates get a short id suffix to stay
  // unambiguous. "TOTAL" is reserved for the per-week sum row.
  const ambiguousNames = (entities: { id: string; name: string }[]) => {
    const byName = new Map<string, Set<string>>();
    for (const e of entities) {
      if (!byName.has(e.name)) byName.set(e.name, new Set());
      byName.get(e.name)!.add(e.id);
    }
    return new Set(
      [...byName]
        .filter(([name, ids]) => ids.size > 1 || name === "TOTAL")
        .map(([name]) => name)
    );
  };
  const dupTeammates = ambiguousNames(rows.map((r) => r.teammate));
  const dupProjects = ambiguousNames(rows.map((r) => r.project));
  const label = (e: { id: string; name: string }, dups: Set<string>) =>
    dups.has(e.name) ? `${e.name} (${e.id.slice(-4)})` : e.name;

  const groups: Record<string, Record<string, Record<string, number>>> = {};
  for (const r of rows) {
    const outer =
      groupBy === "teammate"
        ? label(r.teammate, dupTeammates)
        : label(r.project, dupProjects);
    const inner =
      groupBy === "teammate"
        ? label(r.project, dupProjects)
        : label(r.teammate, dupTeammates);
    const week = toDateString(r.weekStart);
    groups[outer] ??= { TOTAL: {} };
    groups[outer][inner] ??= {};
    groups[outer][inner][week] =
      (groups[outer][inner][week] ?? 0) + r.fraction;
    groups[outer].TOTAL[week] = (groups[outer].TOTAL[week] ?? 0) + r.fraction;
  }

  // Alphabetical outer keys; TOTAL first inside each group.
  const sorted = Object.fromEntries(
    Object.keys(groups)
      .sort()
      .map((k) => [k, groups[k]])
  );

  const weeks = rows.map((r) => toDateString(r.weekStart));
  const result: GroupedAllocations = { unit: UNIT };
  const effectiveFrom = from ?? weeks[0];
  const effectiveTo = to ?? weeks[weeks.length - 1];
  if (effectiveFrom) result.from = effectiveFrom;
  if (effectiveTo) result.to = effectiveTo;
  if (groupBy === "teammate") result.byTeammate = sorted;
  else result.byProject = sorted;
  return result;
}
