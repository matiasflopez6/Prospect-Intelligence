import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getReport } from "@/modules/reports/service";
import { GenerateReportButton } from "@/modules/reports/ui/report-actions";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const report = Number.isInteger(id) ? getReport(id) : undefined;
  if (!report) notFound();

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/reports" className="hover:text-ink">Informes</Link>
            {" / "}
            <Link href={`/companies/${report.companyId}#report`} className="hover:text-ink">Ficha de la empresa</Link>
          </>
        }
        title={report.title}
        description={`Generado el ${formatDateTime(report.createdAt)}`}
        actions={
          <>
            {report.status === "ready" && (
              <ButtonLink href={`/api/reports/${report.id}?format=pdf&download=1`} variant="primary" prefetch={false}>
                Descargar PDF
              </ButtonLink>
            )}
            {report.status === "failed" && <Badge tone="bad">PDF fallido</Badge>}
          </>
        }
      />
      {report.status === "failed" && (
        <div role="alert" className="mb-4 flex flex-col gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2.5 text-sm text-bad">
          <p>{report.error ?? "No se pudo generar el PDF."}</p>
          <div className="text-ink">
            <GenerateReportButton companyId={report.companyId} reportId={report.id} label="Reintentar PDF" variant="secondary" />
          </div>
        </div>
      )}
      {report.content ? (
        <iframe
          title={report.title}
          src={`/api/reports/${report.id}`}
          className="h-[calc(100dvh-11rem)] min-h-[32rem] w-full rounded-lg border border-line bg-white"
        />
      ) : (
        <p className="text-sm text-muted">Este informe no tiene contenido guardado.</p>
      )}
    </>
  );
}
