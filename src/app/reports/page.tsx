import { Badge, DataTable, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { listReports } from "@/modules/reports/service";

export const metadata = { title: "Informes" };
export const dynamic = "force-dynamic";

const STATUS = {
  ready: { label: "PDF listo", tone: "ok" },
  failed: { label: "PDF fallido", tone: "bad" },
  generating: { label: "Generando", tone: "warn" },
} as const;

/** Lista de informes generados (tabla reports). */
export default function ReportsPage() {
  const reports = listReports();
  return (
    <>
      <PageHeader title="Informes" description="Informes comerciales generados para cada empresa." />
      <Panel flush>
        <DataTable
          rows={reports}
          rowKey={(r) => r.id}
          rowHref={(r) => `/reports/${r.id}`}
          empty={<EmptyState title="Aún no hay informes" description="Genera un informe desde la ficha de una empresa analizada." />}
          columns={[
            { key: "company", header: "Empresa", cell: (r) => r.companyName },
            { key: "status", header: "Estado", cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge> },
            { key: "date", header: "Generado", hideBelow: "sm", cell: (r) => <span className="text-muted">{formatDateTime(r.createdAt)}</span> },
            {
              key: "pdf",
              header: "PDF",
              align: "right",
              cell: (r) =>
                r.status === "ready" ? (
                  <a className="text-accent hover:underline" href={`/api/reports/${r.id}?format=pdf&download=1`}>
                    Descargar
                  </a>
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
