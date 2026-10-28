/** Contenido estructurado de un informe comercial (reports.content). El PDF se renderiza a partir de esto. */
export interface ReportContent {
  company: { name: string; website?: string; address?: string; niche?: string };
  generatedAt: string; // ISO
  /** Quién firma el informe (perfil de remitente en el momento de generarlo). */
  preparedBy?: { name?: string; agency?: string };
  /** Situación actual del negocio. Párrafos separados por línea en blanco. */
  currentSituation: string;
  /** Indicadores de calidad 0–100 del análisis (orientativos). */
  quality?: { label: string; value: number }[];
  strengths?: { title: string; description: string }[];
  problems: { title: string; description: string; severity: 1 | 2 | 3 | 4 | 5 }[];
  evidence: { label: string; detail: string; sourceUrl?: string }[];
  opportunities: {
    title: string;
    problem: string;
    /** Evidencias concretas que respaldan esta oportunidad. */
    evidence?: { label: string; detail: string; sourceUrl?: string }[];
    consequence: string;
    solution: string;
    impact: "low" | "medium" | "high";
    impactNote?: string;
    confidence: number;
  }[];
  recommendations: string[];
  proposedSystems: { service: string; description: string }[];
  potentialImpact: string;
  score?: { total: number; tier: string; disclaimer: string };
}
