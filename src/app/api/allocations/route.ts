import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAllocations,
  getGroupedAllocations,
  resolveFilterIds,
} from "@/lib/queries";
import { isIsoDate, isMonday } from "@/lib/dateUtils";
import { isValidFraction } from "@/lib/validation";

const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

const split = (param: string | null) =>
  (param ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const groupByParam = url.searchParams.get("groupBy");
  const groupBy =
    groupByParam === "teammate" || groupByParam === "project"
      ? groupByParam
      : null;
  if (groupByParam && !groupBy) {
    return NextResponse.json(
      { error: "groupBy must be 'teammate' or 'project'" },
      { status: 400 }
    );
  }

  // teammates/projects take names or ids; the legacy teammateId/projectId
  // params take ids only and are kept for existing consumers.
  const [t, p] = await Promise.all([
    resolveFilterIds("teammate", split(url.searchParams.get("teammates"))),
    resolveFilterIds("project", split(url.searchParams.get("projects"))),
  ]);
  const unmatched = [...t.unmatched, ...p.unmatched];
  if (unmatched.length > 0) {
    return NextResponse.json(
      { error: `No teammate or project matches: ${unmatched.join(", ")}` },
      { status: 400 }
    );
  }

  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  for (const [name, value] of [["from", from], ["to", to]] as const) {
    if (value !== undefined && !isIsoDate(value)) {
      return badRequest(`${name} must be a date as YYYY-MM-DD`);
    }
  }

  const filter = {
    from,
    to,
    teammateIds: [...split(url.searchParams.get("teammateId")), ...t.ids],
    projectIds: [...split(url.searchParams.get("projectId")), ...p.ids],
  };

  if (groupBy) {
    return NextResponse.json(await getGroupedAllocations(filter, groupBy));
  }
  return NextResponse.json(await getAllocations(filter));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { teammateId, projectId, weekStart, fraction } = body ?? {};

  if (typeof teammateId !== "string" || !teammateId) {
    return badRequest("teammateId is required");
  }
  if (typeof projectId !== "string" || !projectId) {
    return badRequest("projectId is required");
  }
  // Week columns are Mondays; any other day would render as a stray column.
  if (!isMonday(weekStart)) {
    return badRequest("weekStart must be a Monday as YYYY-MM-DD");
  }
  // As in the grid, 0 means "no allocation" — there is nothing to create.
  if (!isValidFraction(fraction) || fraction === 0) {
    return badRequest("fraction must be a whole number of percent, 1 or more");
  }

  // Unhide existing allocations for this teammate-project pair
  await prisma.allocation.updateMany({
    where: { teammateId, projectId, isHidden: true },
    data: { isHidden: false },
  });

  const allocation = await prisma.allocation.upsert({
    where: {
      teammateId_projectId_weekStart: {
        teammateId,
        projectId,
        weekStart: new Date(weekStart),
      },
    },
    create: {
      teammateId,
      projectId,
      weekStart: new Date(weekStart),
      fraction,
    },
    update: { fraction },
  });

  return NextResponse.json({
    ...allocation,
    weekStart: allocation.weekStart.toISOString().split("T")[0],
  }, { status: 201 });
}
