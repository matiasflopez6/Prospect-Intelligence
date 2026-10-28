import { NextResponse } from "next/server";
import { getJob } from "@/modules/jobs/service";

export const dynamic = "force-dynamic";

/** Estado de un trabajo en segundo plano, para polling de la UI. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob(Number((await params).id));
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { id, type, status, progress, progressLabel, error, searchId, companyId } = job;
  return NextResponse.json({ id, type, status, progress, progressLabel, error, searchId, companyId });
}
