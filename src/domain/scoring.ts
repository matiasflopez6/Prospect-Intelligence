/**
 * Niveles de prioridad derivados de la puntuación (0–100).
 * La puntuación es una heurística explicable, no una medida científica.
 */
export const SCORE_TIERS = ["high", "medium", "low"] as const;
export type ScoreTier = (typeof SCORE_TIERS)[number];

export const SCORE_TIER_LABELS: Record<ScoreTier, string> = {
  high: "Alta prioridad",
  medium: "Prioridad media",
  low: "Prioridad baja",
};

export const SCORE_TIER_THRESHOLDS = { high: 70, medium: 40 } as const;

export function tierForScore(score: number): ScoreTier {
  if (score >= SCORE_TIER_THRESHOLDS.high) return "high";
  if (score >= SCORE_TIER_THRESHOLDS.medium) return "medium";
  return "low";
}

export const SCORE_DISCLAIMER =
  "Puntuación heurística basada en las evidencias recogidas. Sirve para priorizar, no es una medida científica.";
