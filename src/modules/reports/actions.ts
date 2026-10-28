"use server";

import { z } from "zod";
import type { StartResult } from "@/components/jobs/job-button";
import { enqueueJob } from "../jobs/service";
import { activeJobId } from "../profile/jobs";

const idSchema = z.object({ companyId: z.number().int().positive(), reportId: z.number().int().positive().optional() });

/** Encola la generación de un informe nuevo, o solo el reintento del PDF de uno existente (`reportId`). */
export async function startReportGeneration(input: z.input<typeof idSchema>): Promise<StartResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos no válidos" };
  const existing = activeJobId(parsed.data.companyId, "report.generate");
  if (existing) return { jobId: existing };
  return { jobId: enqueueJob({ type: "report.generate", payload: parsed.data, companyId: parsed.data.companyId }) };
}
