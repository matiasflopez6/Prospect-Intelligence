import { NotImplementedError } from "@/lib/errors";
import type { JobContext } from "../jobs/handlers";

/**
 * Construye ReportContent a partir de los datos persistidos (sin inventar), lo guarda en `reports`
 * y renderiza el PDF en REPORTS_DIR. Sugerencia: HTML + Chromium headless (Playwright ya disponible).
 * TODO(sesión ficha/mensajes/informe).
 */
export async function generateReport(_companyId: number): Promise<number> {
  throw new NotImplementedError("reports/service → generateReport");
}

export async function generateReportForJob(payload: Record<string, unknown>, _ctx: JobContext) {
  return generateReport(Number(payload.companyId));
}
