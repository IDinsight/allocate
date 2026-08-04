import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAllocations,
  getGroupedAllocations,
  resolveFilterIds,
} from "@/lib/queries";

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

  const filter = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    teammateIds: [...split(url.searchParams.get("teammateId")), ...t.ids],
    projectIds: [...split(url.searchParams.get("projectId")), ...p.ids],
  };

  if (groupBy) {
    return NextResponse.json(await getGroupedAllocations(filter, groupBy));
  }
  return NextResponse.json(await getAllocations(filter));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teammateId, projectId, weekStart, fraction } = body;

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
