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
  /** Clasificación del fallo de acceso (para distinguir "web caída" de "no pudimos llegar"). */
  fetchErrorKind?: FetchErrorKind;
  https?: boolean;
  responseTimeMs?: number;
  htmlBytes?: number;

  title?: string;
  metaDescription?: string;
  h1?: string[];
  lang?: string;
  textExcerpt?: string;
  wordCount?: number;
  /** Año más reciente en un aviso © del pie de página (pista de abandono si es antiguo). */
  copyrightYear?: number;
  /**
   * La página parece construida en el navegador (poco HTML visible, mucho script): las ausencias
   * detectadas en el HTML inicial son menos fiables.
   */
  likelyClientRendered?: boolean;

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
    /** Widget flotante de WhatsApp (plugin) sin enlace directo en el HTML. */
    whatsappWidget?: boolean;
    hasClickToCall: boolean;
    hasContactPage: boolean;
  };
  forms?: {
    count: number;
    items: {
      action?: string;
      fields: string[];
      /** Campos visibles que pide el usuario (sin ocultos ni botones). */
      fieldCount?: number;
      /** Tiene selectores/opciones que permiten cualificar la consulta (servicio, motivo…). */
      hasChoiceField?: boolean;
      hasRequiredPhone?: boolean;
      /** Solo pide un email: suscripción, no consulta. */
      isNewsletter?: boolean;
      /** Formulario incrustado de un tercero (Typeform, HubSpot, Google Forms…). */
      vendor?: string;
      pageUrl?: string;
    }[];
  };
  booking?: { detected: boolean; vendor?: string; urls: string[] };
  chat?: { detected: boolean; vendor?: string };
  ctas?: { text: string; href?: string; kind: "call" | "whatsapp" | "booking" | "form" | "other" }[];
  social?: { platform: string; url: string }[];
  tech?: { cms?: string; analytics: string[]; pixels: string[]; crm?: string[] };
  pagesVisited?: string[];
}

export type FetchErrorKind = "invalid-url" | "blocked" | "dns" | "timeout" | "tls" | "refused" | "http" | "not-html" | "other";

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
  /** Si se pidió IA y no se pudo usar (sin clave, error…), el motivo: se muestra al usuario. */
  fallbackReason?: string;
}

export interface AnalysisInput {
  company: typeof import("@/lib/db/schema").companies.$inferSelect;
  signals?: WebsiteSignals;
  reviews: (typeof import("@/lib/db/schema").reviews.$inferSelect)[];
  /** Perfiles sociales ya conocidos (descubrimiento) además de los enlazados en la web. */
  socialProfiles?: { platform: string; url: string }[];
}

export interface AnalysisInterpreter {
  interpret(input: AnalysisInput): Promise<AnalysisInterpretation>;
}
