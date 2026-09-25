import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidFraction } from "@/lib/validation";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const fraction = body?.fraction;

  // Before this check a missing or malformed fraction silently deleted the row.
  if (!isValidFraction(fraction)) {
    return NextResponse.json(
      { error: "fraction must be a whole number of percent, 0 or more" },
      { status: 400 }
    );
  }

  // 0 clears the cell, the same as blanking it in the grid.
  if (fraction === 0) {
    await prisma.allocation.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  }

  const allocation = await prisma.allocation.update({
    where: { id },
    data: { fraction },
  });

  return NextResponse.json({
    ...allocation,
    weekStart: allocation.weekStart.toISOString().split("T")[0],
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.allocation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
