import Link from "next/link";
import { CRM_STATUS_LABELS } from "@/domain";
import { ButtonLink, DataTable, EmptyState, FilterBar, PageHeader, Panel, ScoreBadge } from "@/components/ui";
import { firstParam, numParam, type SearchParams } from "@/lib/url-state";
import { formatDate, formatNumber } from "@/lib/format";
import { getFilterOptions } from "@/modules/companies/service";
import { followUpLabel } from "@/modules/crm/dates";
import { getPipeline, listFollowUps, PIPELINE_COLUMN_LIMIT, type PipelineCard } from "@/modules/crm/service";
import { StatusSelect } from "@/modules/crm/ui/status-select";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

function Card({ card }: { card: PipelineCard }) {
  const follow = card.followUpAt && card.status !== "won" && card.status !== "lost" ? followUpLabel(card.followUpAt) : null;
  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-line bg-surface p-2.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/companies/${card.companyId}`} className="text-sm font-medium leading-snug text-ink hover:text-accent hover:underline">
          {card.name}
        </Link>
        <ScoreBadge score={card.score} tier={card.scoreTier} showBar={false} />
      </div>
      {(card.niche || card.city) && <p className="text-xs text-muted">{[card.niche, card.city].filter(Boolean).join(" · ")}</p>}
      {card.nextAction && <p className="line-clamp-2 text-xs text-ink-2">{card.nextAction}</p>}
      {(follow || card.ownerName) && (
        <p className="flex flex-wrap gap-x-2 text-xs">
          {follow && card.followUpAt && (
            <span className={follow.overdue ? "font-medium text-bad" : "text-muted"}>{follow.overdue ? "Vencido" : "Seguimiento"} · {formatDate(card.followUpAt)}</span>
          )}
          {card.ownerName && <span className="text-muted">{card.ownerName}</span>}
        </p>
      )}
      <StatusSelect companyId={card.companyId} status={card.status} name={card.name} />
    </li>
  );
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = { q: firstParam(sp.q), ownerId: numParam(sp.owner) };
  const columns = getPipeline(filters);
  const followUps = listFollowUps({ ownerId: filters.ownerId, limit: 15 });
  const options = getFilterOptions();
  const total = columns.reduce((n, c) => n + c.total, 0);

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Seguimiento comercial por estado."
        actions={<ButtonLink href="/companies">Ver listado</ButtonLink>}
      />
      <div className="mb-3">
        <FilterBar
          fields={[
            { type: "text", name: "q", placeholder: "Buscar por nombre" },
            { type: "select", name: "owner", placeholder: "Responsable", options: options.owners.map((o) => ({ value: String(o.id), label: o.name })) },
          ]}
        />
      </div>

      {followUps.length > 0 && (
        <Panel
          className="mb-4"
          flush
          title="Seguimientos pendientes"
          description="Vencidos y de los próximos 7 días en empresas abiertas."
        >
          <DataTable
            rows={followUps}
            rowKey={(f) => f.companyId}
            rowHref={(f) => `/companies/${f.companyId}#crm`}
            columns={[
              { key: "name", header: "Empresa", cell: (f) => f.name },
              {
                key: "when",
                header: "Fecha",
                cell: (f) => {
                  const l = followUpLabel(f.followUpAt!);
                  return <span className={l.overdue ? "font-medium text-bad" : "text-ink-2"}>{formatDate(f.followUpAt)} · {l.text}</span>;
                },
              },
              { key: "action", header: "Próxima acción", hideBelow: "sm", cell: (f) => f.nextAction ?? <span className="text-faint">Sin definir</span> },
              { key: "owner", header: "Responsable", hideBelow: "md", cell: (f) => f.ownerName ?? <span className="text-faint">—</span> },
              { key: "status", header: "Estado", hideBelow: "md", cell: (f) => CRM_STATUS_LABELS[f.status] },
            ]}
          />
        </Panel>
      )}

      {total === 0 ? (
        <Panel>
          <EmptyState
            title={filters.q || filters.ownerId ? "Ninguna empresa coincide" : "Todavía no hay empresas en el pipeline"}
            description="Las empresas aparecen aquí al descubrirlas y avanzan según las vayas gestionando."
            action={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
          />
        </Panel>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max items-start gap-3">
            {columns.map((col) => (
              <section key={col.status} aria-label={CRM_STATUS_LABELS[col.status]} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-sunken/70 p-2">
                <header className="flex items-center justify-between px-1 pt-0.5">
                  <h2 className="text-xs font-semibold text-ink">{CRM_STATUS_LABELS[col.status]}</h2>
                  <span className="tnum text-xs text-muted">{formatNumber(col.total)}</span>
                </header>
                {col.cards.length === 0 ? (
                  <p className="px-1 py-3 text-xs text-faint">Sin empresas</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {col.cards.map((card) => (
                      <Card key={card.companyId} card={card} />
                    ))}
                  </ul>
                )}
                {col.total > col.cards.length && (
                  <Link href={`/companies?crmStatus=${col.status}`} className="px-1 pb-1 text-xs text-accent hover:underline">
                    Ver las {formatNumber(col.total)} (se muestran {PIPELINE_COLUMN_LIMIT})
                  </Link>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
