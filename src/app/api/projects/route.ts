import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listProjects } from "@/lib/queries";

export async function GET() {
  return NextResponse.json(await listProjects());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const project = await prisma.project.create({
    data: {
      name: body.name ?? "New Project",
      pillar: body.pillar ?? null,
      region: body.region ?? null,
      billingRate: body.billingRate ?? null,
      status: body.status ?? "Upcoming",
      conversionProbability: body.conversionProbability ?? null,
      billable: body.billable ?? false,
      unit4Code: body.unit4Code ?? null,
      leadId: body.leadId ?? null,
    },
    include: { lead: { select: { id: true, name: true } } },
  });
  return NextResponse.json(project, { status: 201 });
}
