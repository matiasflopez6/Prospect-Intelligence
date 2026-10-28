import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, DataTable, EmptyState, PageHeader, Panel, ScoreBadge } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getSearchDetail } from "@/modules/discovery/queries";
import { AutoRefresh } from "@/modules/discovery/ui/auto-refresh";
import { PROVIDER_STATUS, SEARCH_STATUS } from "@/modules/discovery/ui/status";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const detail = getSearchDetail(Number((await params).id));
  return { title: detail ? `${detail.search.niche} en ${detail.search.location}` : "Búsqueda" };
}

const PROVIDER_LABEL: Record<string, string> = { "google-places": "Google Places", openstreetmap: "OpenStreetMap", website: "Web propia" };

export default async function SearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const detail = Number.isInteger(id) ? getSearchDetail(id) : undefined;
  if (!detail) notFound();
  const { search, results, job } = detail;
  const active = search.status === "queued" || search.status === "running";
  const status = SEARCH_STATUS[search.status];
  const providerRows = Object.entries(search.providerResults ?? {}).map(([provider, r]) => ({ provider, ...r }));

  return (
    <>
      <AutoRefresh active={active} />
      <PageHeader
        breadcrumb={<Link href="/searches" className="hover:text-ink">Búsquedas</Link>}
        title={`${search.niche} en ${search.location}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={status?.tone}>{status?.label ?? search.status}</Badge>
            <span className="tnum">{formatNumber(search.foundCount)} de ~{formatNumber(search.targetCount)} empresas</span>
            <span>· {formatDateTime(search.createdAt)}</span>
          </span>
        }
        actions={<ButtonLink href="/searches/new">Nueva búsqueda</ButtonLink>}
      />

      {active && (
        <Panel className="mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink">{job?.progressLabel ?? (search.status === "queued" ? "En cola" : "Buscando…")}</span>
            <span className="tnum text-muted">{job?.progress ?? 0}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(3, job?.progress ?? 0)}%` }} />
          </div>
        </Panel>
      )}

      {search.error && (
        <p role="alert" className="mb-4 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          {search.error}
        </p>
      )}

      {providerRows.length > 0 && (
        <Panel title="Fuentes consultadas" className="mb-4" flush>
          <DataTable
            rows={providerRows}
            rowKey={(r) => r.provider}
            columns={[
              { key: "p", header: "Fuente", cell: (r) => <span className="font-medium">{PROVIDER_LABEL[r.provider] ?? r.provider}</span> },
              { key: "s", header: "Estado", cell: (r) => <Badge tone={PROVIDER_STATUS[r.status]?.tone}>{PROVIDER_STATUS[r.status]?.label ?? r.status}</Badge> },
              { key: "n", header: "Resultados", align: "right", cell: (r) => <span className="tnum">{r.found}</span> },
              { key: "e", header: "Detalle", hideBelow: "sm", cell: (r) => <span className="text-xs text-muted">{r.error ?? "—"}</span> },
            ]}
          />
        </Panel>
      )}

      <Panel title="Empresas encontradas" description="Cada dato indica su fuente en la ficha de la empresa. Los vacíos son datos que la fuente no tiene." flush>
        <DataTable
          rows={results}
          rowKey={(r) => r.id}
          rowHref={(r) => `/companies/${r.id}`}
          empty={
            <EmptyState
              title={active ? "Buscando empresas…" : "Sin resultados"}
              description={active ? "Los resultados aparecen aquí al terminar la búsqueda." : search.status === "failed" ? "La búsqueda falló; revisa el detalle de las fuentes." : "Ninguna fuente devolvió negocios para esta búsqueda. Prueba con otro nicho o una ubicación más amplia."}
            />
          }
          columns={[
            { key: "name", header: "Empresa", cell: (r) => r.name },
            { key: "cat", header: "Categoría", hideBelow: "md", cell: (r) => <span className="text-ink-2">{r.category ?? "—"}</span> },
            { key: "contact", header: "Contacto", hideBelow: "sm", cell: (r) => <ContactCell phone={r.phone} email={r.email} website={r.website} /> },
            { key: "rating", header: "Valoración", align: "right", hideBelow: "sm", cell: (r) => (r.rating == null ? <span className="text-faint">—</span> : <span className="tnum">{r.rating.toFixed(1)} <span className="text-faint">({formatNumber(r.reviewCount)})</span></span>) },
            { key: "social", header: "Redes", align: "right", hideBelow: "lg", cell: (r) => <span className="tnum text-ink-2">{r.socialCount}</span> },
            { key: "src", header: "Fuentes", hideBelow: "lg", cell: (r) => <span className="text-xs text-muted">{r.sources.map((s) => PROVIDER_LABEL[s] ?? s).join(" · ")}</span> },
            { key: "score", header: "Puntuación", cell: (r) => <ScoreBadge score={r.score} tier={r.scoreTier} /> },
          ]}
        />
      </Panel>
    </>
  );
}

function ContactCell({ phone, email, website }: { phone: string | null; email: string | null; website: string | null }) {
  if (!phone && !email && !website) return <span className="text-faint">Sin datos de contacto</span>;
  return (
    <div className="flex flex-col text-xs leading-tight text-ink-2">
      {phone && <span>{phone}</span>}
      {email && <span>{email}</span>}
      {website && <span className="max-w-56 truncate text-muted">{website.replace(/^https?:\/\/(www\.)?/, "")}</span>}
    </div>
  );
}
