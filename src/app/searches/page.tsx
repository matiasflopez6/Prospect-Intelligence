import { Badge, ButtonLink, DataTable, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import { listSearches } from "@/modules/discovery/queries";
import { SEARCH_STATUS } from "@/modules/discovery/ui/status";

export const metadata = { title: "Búsquedas" };
export const dynamic = "force-dynamic";

export default function SearchesPage() {
  const searches = listSearches();
  return (
    <>
      <PageHeader
        title="Búsquedas"
        description="Historial de búsquedas por nicho y ubicación."
        actions={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
      />
      <Panel flush>
        <DataTable
          rows={searches}
          rowKey={(s) => s.id}
          rowHref={(s) => `/searches/${s.id}`}
          empty={<EmptyState title="Aún no hay búsquedas" description="Cuando lances una búsqueda aparecerá aquí con su progreso y resultados." />}
          columns={[
            { key: "niche", header: "Nicho", cell: (s) => (s.providers?.length === 1 && s.providers[0] === "manual" ? <>{s.niche} <Badge>Alta manual</Badge></> : s.niche) },
            { key: "location", header: "Ubicación", cell: (s) => <span className="text-ink-2">{s.location}</span> },
            { key: "found", header: "Empresas", align: "right", cell: (s) => <span className="tnum">{formatNumber(s.foundCount)} / {formatNumber(s.targetCount)}</span> },
            { key: "status", header: "Estado", cell: (s) => <Badge tone={SEARCH_STATUS[s.status]?.tone}>{SEARCH_STATUS[s.status]?.label ?? s.status}</Badge> },
            { key: "date", header: "Fecha", hideBelow: "sm", cell: (s) => <span className="text-muted">{formatDateTime(s.createdAt)}</span> },
          ]}
        />
      </Panel>
    </>
  );
}
