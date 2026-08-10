import { prisma } from "@/lib/prisma";
import type {
  BillingRate,
  Pillar,
  ProjectStatus,
  Region,
} from "@/generated/prisma/enums";

// Shared project writes, used by both the REST routes under /api/projects and
// the MCP tools at /api/mcp — the same reason the reads live in queries.ts.
// Neither module authorises anything: /api/projects is covered by the proxy's
// write block, and /api/mcp does its own tier check. Callers must ensure the
// caller may write before calling in here.

export type ProjectInput = {
  name?: string;
  pillar?: Pillar | null;
  region?: Region | null;
  billingRate?: BillingRate | null;
  status?: ProjectStatus;
  conversionProbability?: number | null;
  billable?: boolean;
  unit4Code?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  blurb?: string | null;
  leadId?: string | null;
};

const withLead = { lead: { select: { id: true, name: true } } };

/** Plain YYYY-MM-DD in, UTC midnight out — the column is a bare `date`, so a
 *  local-time parse would drift it a day either way depending on the server. */
function toDate(v: string | Date | null | undefined): Date | null {
  if (v instanceof Date) return v;
  return typeof v === "string" && v ? new Date(`${v}T00:00:00Z`) : null;
}

/** Only the keys actually present are touched, so a patch cannot blank a field
 *  the caller never mentioned. */
function toData(input: ProjectInput) {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    data[key] =
      key === "startDate" || key === "endDate"
        ? toDate(value as string | Date | null)
        : value;
  }
  return data;
}

export function createProject(input: ProjectInput) {
  return prisma.project.create({
    data: {
      ...toData(input),
      name: input.name ?? "New Project",
      status: input.status ?? "Upcoming",
      billable: input.billable ?? false,
    },
    include: withLead,
  });
}

export function updateProject(id: string, patch: ProjectInput) {
  return prisma.project.update({
    where: { id },
    data: toData(patch),
    include: withLead,
  });
}
