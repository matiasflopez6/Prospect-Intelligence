/** Contenido estructurado de un informe comercial (reports.content). El PDF se renderiza a partir de esto. */
export interface ReportContent {
  company: { name: string; website?: string; address?: string; niche?: string };
  generatedAt: string; // ISO
  /** Situación actual del negocio. */
  currentSituation: string;
  problems: { title: string; description: string; severity: 1 | 2 | 3 | 4 | 5 }[];
  evidence: { label: string; detail: string; sourceUrl?: string }[];
  opportunities: {
    title: string;
    problem: string;
    consequence: string;
    solution: string;
    impact: "low" | "medium" | "high";
    confidence: number;
  }[];
  recommendations: string[];
  proposedSystems: { service: string; description: string }[];
  potentialImpact: string;
  score?: { total: number; tier: string; disclaimer: string };
}
