import type { Severity } from "@/domain";
import type { EvidenceKind } from "@/domain";

/**
 * Señales objetivas extraídas de la web de una empresa (sin interpretar).
 * Persistidas en analyses.signals. Todo campo ausente significa "no se pudo determinar",
 * NO "no existe": para afirmar ausencia hay que haber podido leer la página.
 */
export interface WebsiteSignals {
  url: string;
  finalUrl?: string;
  fetchedAt: Date;
  reachable: boolean;
  httpStatus?: number;
  fetchError?: string;
  https?: boolean;
  responseTimeMs?: number;
  htmlBytes?: number;

  title?: string;
  metaDescription?: string;
  h1?: string[];
  lang?: string;
  textExcerpt?: string;
  wordCount?: number;

  mobile?: { viewportMeta: boolean; responsiveHints: string[] };
  performance?: {
    source: "pagespeed";
    mobileScore?: number;
    desktopScore?: number;
    lcpMs?: number;
    cls?: number;
    tbtMs?: number;
  };

  contact?: {
    phones: string[];
    emails: string[];
    whatsappLinks: string[];
    hasClickToCall: boolean;
    hasContactPage: boolean;
  };
  forms?: { count: number; items: { action?: string; fields: string[]; hasRequiredPhone?: boolean }[] };
  booking?: { detected: boolean; vendor?: string; urls: string[] };
  chat?: { detected: boolean; vendor?: string };
  ctas?: { text: string; href?: string; kind: "call" | "whatsapp" | "booking" | "form" | "other" }[];
  social?: { platform: string; url: string }[];
  tech?: { cms?: string; analytics: string[]; pixels: string[]; crm?: string[] };
  pagesVisited?: string[];
}

export interface WebsiteAnalyzer {
  /** Descarga y examina la web. No debe lanzar por errores de red: devuelve reachable=false con fetchError. */
  analyze(input: { companyId: number; url: string }): Promise<WebsiteSignals>;
}

export interface EvidenceDraft {
  kind: EvidenceKind;
  key?: string;
  label: string;
  detail: string;
  sourceUrl?: string;
  excerpt?: string;
}

/** Hallazgo interpretado: lo que significa una señal y por qué importa. */
export interface Finding {
  key: string;
  title: string;
  /** Interpretación redactada, no una lista de checks. */
  explanation: string;
  severity: Severity;
  /** true = fortaleza (se reconoce lo que está bien hecho). */
  positive?: boolean;
  evidence: EvidenceDraft[];
}

export interface AnalysisInterpretation {
  /** Resumen ejecutivo de la situación del negocio. */
  summary: string;
  /** Subpuntuaciones 0–100: claridad, cta, conversion, movil, confianza, reputacion… */
  quality: Record<string, number>;
  findings: Finding[];
  model?: string;
}

export interface AnalysisInput {
  company: typeof import("@/lib/db/schema").companies.$inferSelect;
  signals?: WebsiteSignals;
  reviews: (typeof import("@/lib/db/schema").reviews.$inferSelect)[];
}

export interface AnalysisInterpreter {
  interpret(input: AnalysisInput): Promise<AnalysisInterpretation>;
}
