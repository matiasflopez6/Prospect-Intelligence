import Link from "next/link";
import { CRM_STATUS_LABELS, opportunityTypeLabel, serviceLabel } from "@/domain";
import { ButtonLink, CrmStatusBadge, DataTable, EmptyState, PageHeader, Panel, ScoreBadge, Stat, StatRow } from "@/components/ui";
import { formatNumber, formatRelative } from "@/lib/format";
import { getDashboard } from "@/modules/dashboard/service";
import { BarList, ScoreHistogram } from "@/modules/dashboard/ui/charts";

export const metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

export default function DashboardPage() {
  const d = getDashboard();

  const header = (
    <PageHeader
      title="Panel"
      description="Resumen del mercado y del pipeline."
      actions={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
    />
  );

  if (d.found === 0) {
    return (
      <>
        {header}
        <Panel>
          <EmptyState
            title="Todavía no hay empresas"
            description="Lanza una búsqueda por nicho y ubicación para descubrir negocios reales y analizarlos."
            action={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
          />
        </Panel>
      </>
    );
  }

  const followTotal = d.followUps.overdue + d.followUps.upcoming;

  return (
    <>
      {header}
      <StatRow>
        <Stat label="Empresas encontradas" value={formatNumber(d.found)} hint={plural(d.searches, "búsqueda", "búsquedas")} />
        <Stat
          label="Empresas analizadas"
          value={formatNumber(d.analyzed)}
          hint={d.analyzing > 0 ? `${formatNumber(d.analyzing)} en cola o en curso` : `de ${formatNumber(d.found)}`}
        />
        <Stat label="Oportunidades prioritarias" value={formatNumber(d.priorityCount)} hint="Prioridad alta y aún abiertas" />
        <Stat
          label="Seguimientos"
          value={
            <Link href="/pipeline" className={d.followUps.overdue > 0 ? "text-bad hover:underline" : "hover:underline"}>
              {formatNumber(followTotal)}
            </Link>
          }
          hint={d.followUps.overdue > 0 ? `${formatNumber(d.followUps.overdue)} vencidos · ${formatNumber(d.followUps.upcoming)} próximos 7 días` : "Vencidos y próximos 7 días"}
        />
      </StatRow>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_24rem]">
        <Panel
          flush
          title="Mejores prospectos por contactar"
          description="Mayor puntuación entre las empresas aún sin contactar."
          actions={<Link href="/companies?sort=score" className="text-xs text-accent hover:underline">Ver todas</Link>}
        >
          <DataTable
            rows={d.topProspects}
            rowKey={(r) => r.id}
            rowHref={(r) => `/companies/${r.id}`}
            empty={<EmptyState title="Aún no hay empresas puntuadas" description="Aparecerán aquí cuando termine el primer análisis." />}
            columns={[
              {
                key: "name",
                header: "Empresa",
                cell: (r) => (
                  <span className="flex flex-col leading-tight">
                    <span>{r.name}</span>
                    {(r.niche || r.city) && <span className="text-xs font-normal text-muted">{[r.niche, r.city].filter(Boolean).join(" · ")}</span>}
                  </span>
                ),
              },
              { key: "score", header: "Puntuación", cell: (r) => <ScoreBadge score={r.score} tier={r.scoreTier} /> },
              { key: "opps", header: "Oport.", align: "right", hideBelow: "sm", cell: (r) => <span className="tnum">{r.opportunityCount}</span> },
              { key: "service", header: "Servicio principal", hideBelow: "lg", cell: (r) => (r.topServiceKey ? <span className="text-ink-2">{serviceLabel(r.topServiceKey)}</span> : "—") },
              { key: "status", header: "Estado", hideBelow: "md", cell: (r) => <CrmStatusBadge status={r.status} /> },
            ]}
          />
        </Panel>

        <Panel title="Pipeline" description="Empresas por estado comercial." actions={<Link href="/pipeline" className="text-xs text-accent hover:underline">Abrir</Link>}>
          <BarList
            items={d.pipeline.map((p) => ({ key: p.status, label: CRM_STATUS_LABELS[p.status], value: p.count, href: `/companies?crmStatus=${p.status}` }))}
            max={Math.max(1, ...d.pipeline.map((p) => p.count))}
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel title="Distribución de puntuaciones" description={d.scored > 0 ? `${plural(d.scored, "empresa puntuada", "empresas puntuadas")}. Heurística, no medida científica.` : undefined}>
          {d.scored > 0 ? <ScoreHistogram buckets={d.scoreBuckets} /> : <EmptyState title="Sin puntuaciones todavía" description="Se calculan al analizar cada empresa." />}
        </Panel>
        <Panel title="Problemas más habituales" description="Empresas afectadas por cada tipo de oportunidad abierta.">
          {d.problems.length > 0 ? (
            <BarList items={d.problems.map((p) => ({ key: p.type, label: opportunityTypeLabel(p.type), value: p.companies, href: `/companies?opportunityType=${encodeURIComponent(p.type)}` }))} />
          ) : (
            <EmptyState title="Sin oportunidades detectadas" description="Se detectan al analizar las empresas." />
          )}
        </Panel>
        <Panel title="Servicios con mayor oportunidad" description="Empresas con oportunidades abiertas para cada servicio.">
          {d.services.length > 0 ? (
            <BarList
              items={d.services.map((s) => ({
                key: s.serviceKey,
                label: serviceLabel(s.serviceKey),
                value: s.companies,
                note: s.highImpact > 0 ? `${s.highImpact} de impacto alto` : undefined,
                href: `/companies?service=${s.serviceKey}`,
              }))}
            />
          ) : (
            <EmptyState title="Sin oportunidades detectadas" description="Se detectan al analizar las empresas." />
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Actividad reciente">
        {d.activity.length === 0 ? (
          <EmptyState title="Sin actividad todavía" />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {d.activity.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                <span className="min-w-0 text-sm text-ink-2">
                  {a.companyId && a.companyName && (
                    <Link href={`/companies/${a.companyId}`} className="font-medium text-ink hover:text-accent hover:underline">
                      {a.companyName}
                    </Link>
                  )}
                  {a.companyId && a.companyName && <span className="text-faint"> · </span>}
                  {a.message}
                </span>
                <span className="shrink-0 text-xs text-faint">{formatRelative(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
