import { NextRequest, NextResponse } from "next/server";
import { listProjects } from "@/lib/queries";
import { createProject } from "@/lib/projectMutations";

export async function GET() {
  return NextResponse.json(await listProjects());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return NextResponse.json(await createProject(body), { status: 201 });
}
