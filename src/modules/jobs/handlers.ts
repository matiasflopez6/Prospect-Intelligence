import type { JobType } from "@/domain";
import type { Job } from "./service";

export interface JobContext {
  /** Actualiza la barra de progreso visible en la UI (0–100). */
  setProgress(percent: number, label?: string): void;
}

export type JobHandler = (job: Job, ctx: JobContext) => Promise<unknown>;

/**
 * Registro de manejadores. Cada módulo propietario implementa su función de servicio;
 * aquí solo se enlazan. Los imports son dinámicos para no cargar todo en cada arranque.
 * Si el servicio aún no está implementado, el trabajo falla con un mensaje explícito.
 */
export const jobHandlers: Record<JobType, JobHandler> = {
  "discovery.run": async (job, ctx) => {
    const { runDiscovery } = await import("../discovery/service");
    return runDiscovery(Number(job.payload.searchId), ctx);
  },
  "company.analyze": async (job, ctx) => {
    const { analyzeCompany } = await import("../analysis/pipeline");
    return analyzeCompany(Number(job.payload.companyId), ctx);
  },
  "message.generate": async (job, ctx) => {
    const { generateMessagesForJob } = await import("../outreach/service");
    return generateMessagesForJob(job.payload, ctx);
  },
  "report.generate": async (job, ctx) => {
    const { generateReportForJob } = await import("../reports/service");
    return generateReportForJob(job.payload, ctx);
  },
};
