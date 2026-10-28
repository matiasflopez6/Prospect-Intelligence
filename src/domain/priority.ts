import type { ImpactLevel } from "./opportunities";

const IMPACT_WEIGHT: Record<ImpactLevel, number> = { low: 1, medium: 2, high: 3 };

/** Orden de prioridad de una oportunidad: severidad × impacto × confianza. Solo sirve para ordenar. */
export function opportunityPriority(o: { severity: number; impact: ImpactLevel; confidence: number }): number {
  return o.severity * IMPACT_WEIGHT[o.impact] * o.confidence;
}
