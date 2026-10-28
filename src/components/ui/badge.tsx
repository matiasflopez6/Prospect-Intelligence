import type { ReactNode } from "react";
import { CRM_STATUS_LABELS, SCORE_TIER_LABELS, type CrmStatus, type ImpactLevel, IMPACT_LABELS, type ScoreTier } from "@/domain";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  outline: "border border-line-strong text-ink-2",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const crmTone: Record<CrmStatus, Tone> = {
  new: "neutral",
  analyzed: "outline",
  priority: "accent",
  contacted: "accent",
  replied: "accent",
  meeting: "accent",
  proposal: "accent",
  won: "ok",
  lost: "bad",
};

export function CrmStatusBadge({ status }: { status: CrmStatus }) {
  return <Badge tone={crmTone[status]}>{CRM_STATUS_LABELS[status]}</Badge>;
}

const impactTone: Record<ImpactLevel, Tone> = { low: "neutral", medium: "warn", high: "accent" };
export function ImpactBadge({ impact }: { impact: ImpactLevel }) {
  return <Badge tone={impactTone[impact]}>Impacto {IMPACT_LABELS[impact].toLowerCase()}</Badge>;
}

/** Score 0–100 con barra fina. null = sin analizar. Un solo color: la intensidad indica prioridad. */
export function ScoreBadge({ score, tier, showBar = true }: { score: number | null; tier?: ScoreTier | null; showBar?: boolean }) {
  if (score == null) return <span className="text-faint">—</span>;
  const fill = tier === "high" ? "bg-accent" : tier === "medium" ? "bg-accent/55" : "bg-line-strong";
  return (
    <span className="inline-flex items-center gap-2" title={tier ? SCORE_TIER_LABELS[tier] : undefined}>
      <span className="tnum w-6 text-right font-semibold text-ink">{score}</span>
      {showBar && (
        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken">
          <span className={cn("block h-full rounded-full", fill)} style={{ width: `${Math.max(2, score)}%` }} />
        </span>
      )}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const label = value >= 0.75 ? "Alta" : value >= 0.5 ? "Media" : "Baja";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`Confianza ${Math.round(value * 100)}%`}>
      <span className="flex gap-0.5">
        {[0.33, 0.66, 1].map((t) => (
          <span key={t} className={cn("h-2.5 w-1 rounded-[1px]", value >= t - 0.1 ? "bg-ink-2" : "bg-line-strong")} />
        ))}
      </span>
      Confianza {label.toLowerCase()}
    </span>
  );
}
