import Link from "next/link";
import { Badge, ButtonLink, DataTable, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatDateTime, formatNumber } from "@/lib/format";
import { listSearches } from "@/modules/discovery/queries";
import { DeleteSearchButton } from "@/modules/discovery/ui/delete-search-button";
import { SEARCH_STATUS } from "@/modules/discovery/ui/status";

export const metadata = { title: "Búsquedas" };
export const dynamic = "force-dynamic";

const count = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function SearchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const searches = listSearches();
  const removed = count(sp.quitadas);
  const kept = count(sp.conservadas);
  return (
    <>
      <PageHeader
        title="Búsquedas"
        description="Historial de búsquedas por nicho y ubicación."
        actions={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
      />
      {sp.borrada && (
        <p role="status" className="mb-4 flex items-start justify-between gap-3 rounded-md border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
          <span>
            Búsqueda borrada. {removed > 0 ? `Se ${removed === 1 ? "eliminó" : "eliminaron"} ${plural(removed, "empresa", "empresas")}` : "No se eliminó ninguna empresa"}
            {kept > 0 ? ` y se ${kept === 1 ? "conservó" : "conservaron"} ${plural(kept, "empresa", "empresas")} (en otra búsqueda o con seguimiento comercial)` : ""}.
          </span>
          <Link href="/searches" className="shrink-0 underline">Cerrar</Link>
        </p>
      )}
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
            { key: "actions", header: <span className="sr-only">Acciones</span>, align: "right", cell: (s) => <DeleteSearchButton searchId={s.id} label={`${s.niche} en ${s.location}`} /> },
          ]}
        />
      </Panel>
    </>
  );
}
