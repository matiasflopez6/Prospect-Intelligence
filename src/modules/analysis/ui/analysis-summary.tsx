import { Badge, Button, EmptyState, Panel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { analyzeCompanyAction } from "../actions";
import { getAnalysisState, type AnalysisView } from "../service";
import { AnalysisPoller } from "./analysis-poller";
import { SeverityBadge, modelLabel } from "./severity";

const QUALITY_LABELS: Record<string, string> = {
  clarity: "Claridad de la propuesta",
  cta: "Llamadas a la acción",
  conversion: "Captación de consultas",
  mobile: "Móvil y velocidad",
  trust: "Confianza y contacto",
  reputation: "Reputación",
};

function AnalyzeButton({ companyId, label }: { companyId: number; label: string }) {
  return (
    <form action={analyzeCompanyAction}>
      <input type="hidden" name="companyId" value={companyId} />
      <Button type="submit" size="sm">
        {label}
      </Button>
    </form>
  );
}

/** Sección «Análisis» de la ficha: resumen interpretado, calidad por dimensión y hallazgos. */
export function AnalysisSummary({ companyId }: { companyId: number }) {
  const state = getAnalysisState(companyId);

  if (state.kind === "in_progress") {
    return (
      <Panel id="analysis" title="Análisis">
        <AnalysisPoller />
        <div className="flex flex-col gap-2 py-2" role="status">
          <p className="text-sm font-medium text-ink">Analizando… {state.label ?? "en cola"}</p>
          <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(5, state.progress)}%` }} />
          </div>
          <p className="text-xs text-muted">Se lee la web, se interpretan las evidencias y se calculan oportunidades y puntuación. La página se actualiza sola.</p>
        </div>
      </Panel>
    );
  }
  if (state.kind === "never") {
    return (
      <Panel id="analysis" title="Análisis">
        <EmptyState
          title="Esta empresa aún no se ha analizado"
          description="El análisis lee su web, interpreta reseñas y presencia digital, detecta oportunidades y calcula una puntuación de prioridad."
          action={<AnalyzeButton companyId={companyId} label="Analizar ahora" />}
        />
      </Panel>
    );
  }
  if (state.kind === "failed") {
    return (
      <Panel id="analysis" title="Análisis">
        <EmptyState tone="blocked" title="El último análisis falló" description={state.error} action={<AnalyzeButton companyId={companyId} label="Reintentar análisis" />} />
      </Panel>
    );
  }

  const { analysis } = state;
  const problems = analysis.findings.filter((f) => !f.positive).sort((a, b) => b.severity - a.severity);
  const strengths = analysis.findings.filter((f) => f.positive);
  return (
    <Panel
      id="analysis"
      title="Análisis"
      description={`${formatDateTime(analysis.finishedAt ?? analysis.createdAt)} · Interpretación: ${modelLabel(analysis.model)}${state.previousAnalyses > 0 ? ` · ${state.previousAnalyses} análisis anterior(es)` : ""}`}
      actions={<AnalyzeButton companyId={companyId} label="Volver a analizar" />}
    >
      <div className="flex flex-col gap-5">
        {analysis.notes.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
            {analysis.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <p className="max-w-3xl text-sm leading-relaxed text-ink">{analysis.summary}</p>

        <QualityBars quality={analysis.quality} />

        {problems.length > 0 && (
          <FindingGroup title="Problemas y puntos débiles">
            {problems.map((f) => (
              <Finding key={f.key} finding={f} />
            ))}
          </FindingGroup>
        )}
        {strengths.length > 0 && (
          <FindingGroup title="Lo que está bien">
            {strengths.map((f) => (
              <Finding key={f.key} finding={f} />
            ))}
          </FindingGroup>
        )}
        <WebsiteReading analysis={analysis} />
      </div>
    </Panel>
  );
}

function QualityBars({ quality }: { quality: Record<string, number> }) {
  const entries = Object.entries(quality).filter(([k]) => k in QUALITY_LABELS);
  if (entries.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted">Calidad por dimensión (estimación heurística, 0–100)</h3>
      <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[10.5rem_1fr_2rem] items-center gap-2 text-sm">
            <dt className="truncate text-ink-2">{QUALITY_LABELS[key]}</dt>
            <dd className="h-1.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${value} de 100`}>
              <div className={cn("h-full rounded-full", value >= 65 ? "bg-ink-2" : value >= 40 ? "bg-ink-2/60" : "bg-ink-2/35")} style={{ width: `${Math.max(3, value)}%` }} />
            </dd>
            <span className="tnum text-right text-xs text-muted">{value}</span>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FindingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted">{title}</h3>
      <ul className="divide-y divide-line border-y border-line">{children}</ul>
    </section>
  );
}

function Finding({ finding }: { finding: AnalysisView["findings"][number] }) {
  return (
    <li className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[5.5rem_1fr]">
      <div className="pt-0.5">{finding.positive ? <Badge tone="ok">Fortaleza</Badge> : <SeverityBadge severity={finding.severity} />}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{finding.title}</p>
        <p className="mt-0.5 text-sm text-ink-2">{finding.explanation}</p>
        {finding.evidence.length > 0 && (
          <p className="mt-1 text-xs text-faint">
            Evidencia: {finding.evidence.map((e) => e.label).join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
}

/** Resumen de lo que se pudo leer: permite al usuario juzgar la fiabilidad de las ausencias. */
function WebsiteReading({ analysis }: { analysis: AnalysisView }) {
  const s = analysis.signals;
  if (!s) return null;
  const yes = (v: boolean | undefined) => (v ? "Sí" : "No detectado");
  const rows: [string, string][] = s.reachable
    ? [
        ["Páginas leídas", String(s.pagesVisited?.length ?? 1)],
        ["HTTPS", s.https ? "Sí" : "No"],
        ["Adaptada a móvil (viewport)", yes(s.mobile?.viewportMeta)],
        ["Rendimiento móvil (PageSpeed)", s.performance?.mobileScore != null ? `${s.performance.mobileScore}/100` : "No disponible"],
        ["WhatsApp", yes((s.contact?.whatsappLinks.length ?? 0) > 0 || s.contact?.whatsappWidget)],
        ["Reservas online", s.booking?.detected ? (s.booking.vendor ?? "Sí") : "No detectado"],
        ["Chat / asistente", s.chat?.detected ? (s.chat.vendor ?? "Sí") : "No detectado"],
        ["Formularios de contacto", String((s.forms?.items ?? []).filter((f) => !f.isNewsletter).length)],
        ["Llamadas a la acción", String(s.ctas?.length ?? 0)],
        ["Redes enlazadas", s.social?.length ? s.social.map((x) => x.platform).join(", ") : "Ninguna"],
        ["Tecnología", [s.tech?.cms, ...(s.tech?.analytics ?? []), ...(s.tech?.crm ?? [])].filter(Boolean).join(", ") || "—"],
      ]
    : [["Estado", s.fetchError ?? "No accesible"]];
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium text-muted hover:text-ink">
        Señales técnicas de la web {s.reachable && s.likelyClientRendered && <span className="text-warn">· contenido cargado con JavaScript (ausencias menos fiables)</span>}
      </summary>
      <dl className="mt-2 grid grid-cols-[13rem_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {s.finalUrl && (
        <p className="mt-2 text-xs text-faint">
          Fuente:{" "}
          <a className="hover:underline" href={s.finalUrl} target="_blank" rel="noreferrer">
            {s.finalUrl}
          </a>
        </p>
      )}
    </details>
  );
}
