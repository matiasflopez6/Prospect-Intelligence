import { EmptyState, Panel, ScoreBadge } from "@/components/ui";
import { SCORE_DISCLAIMER, SCORE_TIER_LABELS } from "@/domain";
import { formatDateTime } from "@/lib/format";
import { getLatestScore } from "../service";

/** Sección «Puntuación»: nota, nivel y desglose por factor para poder entender por qué tiene esa nota. */
export function ScoreBreakdown({ companyId }: { companyId: number }) {
  const score = getLatestScore(companyId);
  if (!score) {
    return (
      <Panel id="score" title="Puntuación">
        <EmptyState title="Sin puntuación todavía" description="Se calcula al analizar la empresa." />
      </Panel>
    );
  }
  const delta = score.previousTotal != null ? score.total - score.previousTotal : null;
  return (
    <Panel id="score" title="Puntuación" description={`${SCORE_TIER_LABELS[score.tier]} · método ${score.methodVersion} · ${formatDateTime(score.createdAt)}`} flush>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-line px-4 py-3">
        <div>
          <div className="text-xs font-medium text-muted">Prioridad comercial</div>
          <div className="mt-1 flex items-center gap-3">
            <span className="tnum text-3xl font-semibold tracking-tight text-ink">{score.total}</span>
            <span className="text-sm text-muted">/ 100</span>
            <ScoreBadge score={score.total} tier={score.tier} />
            {delta != null && delta !== 0 && (
              <span className="tnum text-xs text-muted">
                {delta > 0 ? "+" : ""}
                {delta} vs. análisis anterior
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted">Confianza en el análisis</div>
          <div className="tnum mt-1 text-sm font-medium text-ink">{Math.round(score.confidence * 100)}%</div>
        </div>
        <p className="max-w-md text-xs text-muted">{SCORE_DISCLAIMER}</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-muted">
            <th className="h-8 px-4 font-medium">Factor</th>
            <th className="hidden h-8 w-16 px-2 text-right font-medium sm:table-cell">Peso</th>
            <th className="hidden h-8 w-32 px-2 font-medium sm:table-cell">Valor</th>
            <th className="h-8 w-20 px-4 text-right font-medium">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {score.components.map((c) => (
            <tr key={c.key} className="border-b border-line last:border-0 align-top">
              <td className="px-4 py-2">
                <div className="font-medium text-ink">{c.label}</div>
                <div className="mt-0.5 text-xs text-muted">{c.explanation}</div>
              </td>
              <td className="tnum hidden px-2 py-2 text-right text-muted sm:table-cell">{Math.round(c.weight * 100)}%</td>
              <td className="hidden px-2 py-2.5 sm:table-cell">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${Math.round(c.value * 100)}%`}>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, c.value * 100)}%` }} />
                </div>
              </td>
              <td className="tnum px-4 py-2 text-right">
                <span className="font-semibold text-ink">{c.points.toFixed(1)}</span>
                <span className="text-xs text-faint"> / {Math.round(c.weight * 100)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-strong bg-canvas/60">
            <td className="px-4 py-2 font-medium text-ink" colSpan={3}>
              Total (redondeado)
            </td>
            <td className="tnum px-4 py-2 text-right font-semibold text-ink">{score.total}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}
