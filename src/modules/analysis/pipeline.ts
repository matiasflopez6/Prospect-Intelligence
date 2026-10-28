import { NotImplementedError } from "@/lib/errors";
import type { JobContext } from "../jobs/handlers";

/**
 * Orquesta el análisis completo de una empresa:
 *   1. WebsiteAnalyzer.analyze → señales
 *   2. AnalysisInterpreter.interpret → resumen + hallazgos + evidencias (tablas analyses, evidence)
 *   3. OpportunityEngine.detect → oportunidades (tabla opportunities + opportunity_evidence)
 *   4. ScoringEngine.score → puntuación (tabla scores + columnas desnormalizadas de companies)
 *   5. Actualiza companies.analysisStatus, crm_entries.status ("new" → "analyzed") y activity_log
 * TODO(sesión análisis + oportunidades + scoring).
 */
export async function analyzeCompany(_companyId: number, _ctx: JobContext): Promise<unknown> {
  throw new NotImplementedError("analysis/pipeline → analyzeCompany");
}
