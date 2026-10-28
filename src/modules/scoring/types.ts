import type { ScoreTier } from "@/domain";
import type { OpportunityDraft } from "../opportunities/types";

export interface ScoreComponent {
  /** Clave estable: "severity", "opportunity_count", "business_size", "reachability"… */
  key: string;
  label: string;
  /** Peso relativo en el total (suma de pesos = 1). */
  weight: number;
  /** Valor normalizado 0–1. */
  value: number;
  /** Puntos aportados al total (0–100 * weight * value). */
  points: number;
  /** Explicación en lenguaje claro de por qué este componente vale lo que vale. */
  explanation: string;
}

export interface ScoreResult {
  total: number; // 0–100
  tier: ScoreTier;
  /** Confianza global del análisis, 0–1. */
  confidence: number;
  components: ScoreComponent[];
  methodVersion: string;
}

/** Datos observados que el scoring necesita además de las oportunidades (todo opcional: ausencia = desconocido). */
export interface ScoringContext {
  /** Subpuntuaciones de calidad web 0–100 (claridad, cta, conversion, movil, confianza…). */
  quality?: Record<string, number>;
  hasWebsite?: boolean;
  phone?: boolean;
  email?: boolean;
  whatsapp?: boolean;
  /** Reseñas de la muestra publicadas en los últimos 12 meses y tamaño de la muestra. */
  recentReviews?: number;
  sampleSize?: number;
}

export interface ScoringInput {
  company: typeof import("@/lib/db/schema").companies.$inferSelect;
  opportunities: OpportunityDraft[];
  websiteReachable: boolean;
  context?: ScoringContext;
}

export interface ScoringEngine {
  /** Función pura y determinista: misma entrada → misma salida. Fácil de testear. */
  score(input: ScoringInput): ScoreResult;
}
