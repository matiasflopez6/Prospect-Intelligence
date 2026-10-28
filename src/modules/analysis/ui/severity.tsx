import { Badge, type Tone } from "@/components/ui";

const LABELS: Record<number, { label: string; tone: Tone }> = {
  5: { label: "Crítico", tone: "bad" },
  4: { label: "Grave", tone: "bad" },
  3: { label: "Relevante", tone: "warn" },
  2: { label: "Menor", tone: "neutral" },
  1: { label: "Leve", tone: "neutral" },
};

export function SeverityBadge({ severity }: { severity: number }) {
  const { label, tone } = LABELS[Math.max(1, Math.min(5, Math.round(severity)))]!;
  return <Badge tone={tone}>{label}</Badge>;
}

/** Texto de la fuente que produjo la interpretación. */
export function modelLabel(model: string | null | undefined): string {
  if (!model) return "—";
  return model.startsWith("reglas") ? "Reglas deterministas" : `IA (${model})`;
}
