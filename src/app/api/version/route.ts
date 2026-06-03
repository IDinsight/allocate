import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Lightweight change-detection endpoint for live-sync polling. Returns a tiny
// signature the client can poll cheaply; only when the signature changes does
// the client run the heavy fetchAll. `count + max(updatedAt)` per table catches
// inserts (count up + new timestamp), updates (new timestamp) and deletes
// (count down) — every model has @updatedAt, see prisma/schema.prisma.
export async function GET() {
  const [projects, teammates, allocations, notepad] = await Promise.all([
    prisma.project.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.teammate.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.allocation.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.notepad.findUnique({
      where: { id: "singleton" },
      select: { updatedAt: true },
    }),
  ]);

  const sig = (agg: { _count: { _all: number }; _max: { updatedAt: Date | null } }) =>
    `${agg._count._all}:${agg._max.updatedAt?.toISOString() ?? ""}`;

  return NextResponse.json({
    // Combined signature for everything fetchAll loads.
    data: `${sig(projects)}|${sig(teammates)}|${sig(allocations)}`,
    notepad: notepad?.updatedAt?.toISOString() ?? "",
  });
}
