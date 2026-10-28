import { Badge, DataTable, EmptyState, Panel, type Column } from "@/components/ui";
import { EVIDENCE_KIND_LABELS, type EvidenceKind } from "@/domain";
import { formatDate } from "@/lib/format";
import { listEvidence } from "../service";

type Row = ReturnType<typeof listEvidence>[number];

/** Sección «Evidencias»: cada hecho citable en el que se apoyan hallazgos y oportunidades. */
export function EvidenceList({ companyId }: { companyId: number }) {
  const rows = listEvidence(companyId);
  const order: Record<string, number> = { absence: 0, review: 1, website: 2, listing: 3, social: 4, other: 5 };
  rows.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.label.localeCompare(b.label, "es"));

  const columns: Column<Row>[] = [
    {
      key: "kind",
      header: "Tipo",
      className: "w-32",
      cell: (e) => <Badge tone={e.kind === "absence" ? "warn" : "outline"}>{EVIDENCE_KIND_LABELS[e.kind as EvidenceKind] ?? e.kind}</Badge>,
    },
    {
      key: "detail",
      header: "Qué se observó",
      cell: (e) => (
        <div className="min-w-0 py-1">
          <div className="font-medium text-ink">{e.label}</div>
          <div className="text-ink-2">{e.detail}</div>
          {e.excerpt && <q className="mt-0.5 block border-l-2 border-line-strong pl-2 text-muted not-italic">{e.excerpt}</q>}
          {e.sourceUrl && (
            <a className="mt-0.5 block truncate text-xs text-accent hover:underline" href={e.sourceUrl} target="_blank" rel="noreferrer">
              {e.sourceUrl}
            </a>
          )}
        </div>
      ),
    },
    {
      key: "used",
      header: "Respalda",
      hideBelow: "md",
      className: "w-56",
      cell: (e) => (e.usedBy.length ? <span className="text-xs text-ink-2">{e.usedBy.join(" · ")}</span> : <span className="text-xs text-faint">Contexto</span>),
    },
    { key: "date", header: "Fecha", hideBelow: "lg", className: "w-24", cell: (e) => <span className="text-xs text-muted">{formatDate(e.observedAt)}</span> },
  ];

  return (
    <Panel id="evidence" title="Evidencias" description={rows.length ? `${rows.length} hechos registrados en el último análisis` : undefined} flush>
      {rows.length === 0 ? (
        <EmptyState title="Sin evidencias" description="Las evidencias se registran al analizar la empresa." />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(e) => e.id} />
      )}
    </Panel>
  );
}
