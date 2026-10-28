import { CRM_STATUSES, CRM_STATUS_LABELS, SERVICES, SCORE_TIERS, SCORE_TIER_LABELS, opportunityTypeLabel, serviceLabel, type CrmStatus, type ScoreTier, type ServiceKey } from "@/domain";
import { ButtonLink, CrmStatusBadge, DataTable, EmptyState, FilterBar, PageHeader, Pagination, Panel, ScoreBadge, type Column, type FilterField } from "@/components/ui";
import { firstParam, numParam, withParams, type SearchParams } from "@/lib/url-state";
import { formatDate, formatNumber } from "@/lib/format";
import { followUpLabel } from "@/modules/crm/dates";
import { getFilterOptions, listCompanies } from "@/modules/companies/service";
import type { CompanyListQuery, CompanyListRow, CompanySortKey } from "@/modules/companies/types";

export const metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";

const SORTS: CompanySortKey[] = ["score", "name", "rating", "reviews", "opportunities", "createdAt"];
const oneOf = <T extends string>(v: string | undefined, list: readonly T[]): T | undefined => (v && (list as readonly string[]).includes(v) ? (v as T) : undefined);

function parseQuery(sp: SearchParams): CompanyListQuery {
  const sort = oneOf(firstParam(sp.sort), SORTS) ?? "score";
  return {
    q: firstParam(sp.q),
    niche: firstParam(sp.niche),
    location: firstParam(sp.location),
    scoreMin: numParam(sp.scoreMin),
    tier: oneOf<ScoreTier>(firstParam(sp.tier), SCORE_TIERS),
    opportunitiesMin: numParam(sp.opportunitiesMin),
    opportunityType: firstParam(sp.opportunityType),
    service: oneOf<ServiceKey>(firstParam(sp.service), Object.keys(SERVICES) as ServiceKey[]),
    crmStatus: oneOf<CrmStatus>(firstParam(sp.crmStatus), CRM_STATUSES),
    ratingMin: numParam(sp.ratingMin),
    reviewsMin: numParam(sp.reviewsMin),
    ownerId: numParam(sp.owner),
    searchId: numParam(sp.search),
    sort,
    dir: oneOf(firstParam(sp.dir), ["asc", "desc"] as const) ?? (sort === "name" ? "asc" : "desc"),
    page: numParam(sp.page),
  };
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const query = parseQuery(sp);
  const result = listCompanies(query);
  const options = getFilterOptions();
  const hasFilters = Object.entries(sp).some(([k, v]) => !["sort", "dir", "page"].includes(k) && firstParam(v));

  const fields: FilterField[] = [
    { type: "text", name: "q", placeholder: "Buscar por nombre", width: "13rem" },
    { type: "select", name: "crmStatus", placeholder: "Estado CRM", options: CRM_STATUSES.map((s) => ({ value: s, label: CRM_STATUS_LABELS[s] })) },
    { type: "select", name: "tier", placeholder: "Prioridad", options: SCORE_TIERS.map((t) => ({ value: t, label: SCORE_TIER_LABELS[t] })) },
    { type: "select", name: "service", placeholder: "Servicio recomendado", width: "13rem", options: options.services.map((s) => ({ value: s, label: serviceLabel(s) })) },
    { type: "select", name: "opportunityType", placeholder: "Problema detectado", width: "13rem", options: options.opportunityTypes.map((t) => ({ value: t, label: opportunityTypeLabel(t) })) },
    { type: "select", name: "niche", placeholder: "Nicho", options: options.niches.map((n) => ({ value: n, label: n })) },
    { type: "select", name: "location", placeholder: "Ubicación", options: options.locations.map((n) => ({ value: n, label: n })) },
    { type: "select", name: "owner", placeholder: "Responsable", options: options.owners.map((o) => ({ value: String(o.id), label: o.name })) },
    { type: "number", name: "scoreMin", placeholder: "Puntuación mín.", min: 0, max: 100, width: "8.5rem" },
    { type: "number", name: "opportunitiesMin", placeholder: "Oportunidades mín.", min: 0, width: "9.5rem" },
    { type: "number", name: "ratingMin", placeholder: "Valoración mín.", min: 0, max: 5, step: 0.1, width: "8.5rem" },
    { type: "number", name: "reviewsMin", placeholder: "Reseñas mín.", min: 0, width: "7.5rem" },
  ];

  const sortHref = (key: CompanySortKey) => {
    const active = query.sort === key;
    const defaultDir = key === "name" ? "asc" : "desc";
    const next = active ? (query.dir === "asc" ? "desc" : "asc") : defaultDir;
    return withParams("/companies", sp, { sort: key, dir: next, page: undefined });
  };
  const sortProps = (key: CompanySortKey) => ({ sortHref: sortHref(key), sorted: query.sort === key ? query.dir : undefined });

  const columns: Column<CompanyListRow>[] = [
    {
      key: "name",
      header: "Empresa",
      className: "min-w-44",
      ...sortProps("name"),
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span>{r.name}</span>
          {(r.niche || r.location) && <span className="text-xs font-normal text-muted">{[r.niche, r.location].filter(Boolean).join(" · ")}</span>}
        </span>
      ),
    },
    {
      key: "score",
      header: "Puntuación",
      ...sortProps("score"),
      cell: (r) =>
        r.score != null ? <ScoreBadge score={r.score} tier={r.scoreTier} /> : <span className="text-xs text-muted">{r.analysisStatus === "running" ? "Analizando…" : r.analysisStatus === "failed" ? "Error de análisis" : "Sin analizar"}</span>,
    },
    { key: "opps", header: "Oport.", align: "right", hideBelow: "sm", ...sortProps("opportunities"), cell: (r) => <span className="tnum">{r.score != null ? r.opportunityCount : "—"}</span> },
    { key: "service", header: "Servicio principal", hideBelow: "lg", cell: (r) => (r.topServiceKey ? <span className="text-ink-2">{serviceLabel(r.topServiceKey)}</span> : <span className="text-faint">—</span>) },
    {
      key: "rating",
      header: "Valoración",
      hideBelow: "md",
      ...sortProps("rating"),
      cell: (r) => (r.rating != null ? <span className="tnum">{r.rating.toFixed(1)}</span> : <span className="text-faint">—</span>),
    },
    { key: "reviews", header: "Reseñas", align: "right", hideBelow: "md", ...sortProps("reviews"), cell: (r) => <span className="tnum text-ink-2">{formatNumber(r.reviewCount)}</span> },
    { key: "status", header: "Estado", cell: (r) => <CrmStatusBadge status={r.crmStatus} /> },
    { key: "owner", header: "Responsable", hideBelow: "lg", cell: (r) => r.ownerName ?? <span className="text-faint">—</span> },
    {
      key: "followup",
      header: "Seguimiento",
      hideBelow: "lg",
      cell: (r) => {
        if (!r.followUpAt || r.crmStatus === "won" || r.crmStatus === "lost") return <span className="text-faint">—</span>;
        const f = followUpLabel(r.followUpAt);
        return <span className={f.overdue ? "font-medium text-bad" : "text-ink-2"} title={r.nextAction ?? undefined}>{formatDate(r.followUpAt)}</span>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Empresas"
        description="Todas las empresas descubiertas, con búsqueda y filtros."
        actions={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
      />
      <Panel flush>
        <div className="border-b border-line p-3">
          <FilterBar fields={fields} />
        </div>
        <DataTable
          rows={result.rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/companies/${r.id}`}
          columns={columns}
          empty={
            hasFilters ? (
              <EmptyState title="Ninguna empresa coincide con los filtros" description="Prueba a quitar algún filtro." />
            ) : (
              <EmptyState
                title="Todavía no hay empresas"
                description="Lanza una búsqueda por nicho y ubicación para descubrir negocios reales."
                action={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
              />
            )
          }
        />
        {result.total > 0 && (
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={(p) => withParams("/companies", sp, { page: p === 1 ? undefined : p })} />
        )}
      </Panel>
    </>
  );
}
