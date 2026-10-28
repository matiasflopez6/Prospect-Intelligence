import type { ImpactLevel, ServiceKey, Severity } from "@/domain";
import type { AnalysisInterpretation, EvidenceDraft, WebsiteSignals } from "../analysis/types";

export interface OpportunityDraft {
  /** Clave de OPPORTUNITY_TYPES o una nueva si el motor detecta otro tipo. */
  type: string;
  title: string;
  /** Problema detectado. */
  problem: string;
  /** Evidencias que lo justifican. Sin evidencias no hay oportunidad. */
  evidence: EvidenceDraft[];
  /** Consecuencia potencial para el negocio. */
  consequence: string;
  /** Solución propuesta. */
  proposedSolution: string;
  serviceKey: ServiceKey;
  impact: ImpactLevel;
  impactNote?: string;
  severity: Severity;
  /** 0–1. Baja si la evidencia es indirecta. */
  confidence: number;
}

export interface OpportunityContext {
  company: typeof import("@/lib/db/schema").companies.$inferSelect;
  signals?: WebsiteSignals;
  interpretation: AnalysisInterpretation;
  reviews: (typeof import("@/lib/db/schema").reviews.$inferSelect)[];
}

export interface OpportunityEngine {
  /** Detecta oportunidades justificables con la información disponible. No inventa problemas. */
  detect(ctx: OpportunityContext): Promise<OpportunityDraft[]>;
}
