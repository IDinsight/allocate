import { NextResponse } from "next/server";
import { listTeam } from "@/lib/queries";

export async function GET() {
  return NextResponse.json(await listTeam());
}
