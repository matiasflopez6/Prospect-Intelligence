import { ConfidenceMeter, ImpactBadge, Badge, EmptyState, Panel } from "@/components/ui";
import { opportunityTypeLabel, serviceLabel } from "@/domain";
import { SeverityBadge } from "@/modules/analysis/ui/severity";
import { listOpportunities, type OpportunityWithEvidence } from "../service";

const EVIDENCE_KIND: Record<string, string> = { listing: "Ficha", website: "Web", review: "Reseña", social: "Redes", absence: "No encontrado", other: "Otro" };

/** Sección «Oportunidades»: por cada una, problema, evidencia, consecuencia, solución, impacto y confianza. */
export function OpportunityList({ companyId }: { companyId: number }) {
  const all = listOpportunities(companyId);
  const open = all.filter((o) => o.status === "open");
  const dismissed = all.filter((o) => o.status === "dismissed");

  return (
    <Panel
      id="opportunities"
      title="Oportunidades"
      description={open.length ? `${open.length} detectada(s), ordenadas por gravedad × confianza` : undefined}
      flush
    >
      {open.length === 0 && dismissed.length === 0 ? (
        <EmptyState title="Sin oportunidades detectadas" description="Todavía no se ha analizado la empresa, o la información disponible no justifica ninguna oportunidad. No se inventan problemas sin evidencia." />
      ) : (
        <ul className="divide-y divide-line">
          {open.map((o, i) => (
            <Opportunity key={o.id} opp={o} defaultOpen={i < 2} />
          ))}
          {dismissed.map((o) => (
            <Opportunity key={o.id} opp={o} defaultOpen={false} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Opportunity({ opp, defaultOpen }: { opp: OpportunityWithEvidence; defaultOpen: boolean }) {
  const dismissed = opp.status === "dismissed";
  return (
    <li className={dismissed ? "opacity-60" : undefined}>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-sunken/50 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-sm font-medium text-ink">
            {opp.title}
            {dismissed && <span className="ml-2 text-xs font-normal text-muted">(descartada)</span>}
          </span>
          <SeverityBadge severity={opp.severity} />
          <ImpactBadge impact={opp.impact} />
          <ConfidenceMeter value={opp.confidence} />
        </summary>
        <div className="grid gap-x-6 gap-y-3 px-4 pb-4 text-sm lg:grid-cols-2">
          <Block label="Problema detectado">{opp.problem}</Block>
          <Block label="Consecuencia potencial">{opp.consequence}</Block>
          <Block label="Solución propuesta">
            {opp.proposedSolution}
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Servicio: <Badge tone="accent">{serviceLabel(opp.serviceKey)}</Badge>
              <span className="text-faint">· Tipo: {opportunityTypeLabel(opp.type)}</span>
            </p>
          </Block>
          <Block label="Impacto estimado">
            <span>Impacto {opp.impact === "high" ? "alto" : opp.impact === "medium" ? "medio" : "bajo"} (cualitativo, sin cifras inventadas).</span>
            {opp.impactNote && <span className="mt-1 block text-ink-2">{opp.impactNote}</span>}
          </Block>
          <div className="lg:col-span-2">
            <Block label={`Evidencia (${opp.evidence.length})`}>
              <ul className="flex flex-col gap-1.5">
                {opp.evidence.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <Badge tone={e.kind === "absence" ? "warn" : "outline"} className="mt-0.5 shrink-0">
                      {EVIDENCE_KIND[e.kind] ?? e.kind}
                    </Badge>
                    <span className="min-w-0 text-ink-2">
                      <span className="font-medium text-ink">{e.label}.</span> {e.detail}
                      {e.excerpt && <q className="mt-0.5 block border-l-2 border-line-strong pl-2 text-muted not-italic">{e.excerpt}</q>}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          </div>
        </div>
      </details>
    </li>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-0.5 text-xs font-medium text-muted">{label}</h4>
      <div className="text-ink">{children}</div>
    </div>
  );
}
