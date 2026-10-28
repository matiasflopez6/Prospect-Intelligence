import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Badge, ButtonLink, EmptyState, Panel } from "@/components/ui";
import { getDb, tables } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { activeJobId, lastJobError } from "../../profile/jobs";
import { listReports } from "../service";
import { GenerateReportButton } from "./report-actions";

/** Sección de la ficha: informe comercial (vista previa en la app y PDF descargable). */
export function ReportPanel({ companyId }: { companyId: number }) {
  const db = getDb();
  const reports = listReports({ companyId }, db);
  const hasAnalysis = Boolean(
    db
      .select({ id: tables.analyses.id })
      .from(tables.analyses)
      .where(and(eq(tables.analyses.companyId, companyId), eq(tables.analyses.status, "done")))
      .limit(1)
      .get(),
  );
  const jobId = activeJobId(companyId, "report.generate", db);
  const lastError = lastJobError(companyId, "report.generate", db);
  const [latest, ...older] = reports;

  return (
    <Panel
      id="report"
      title="Informe comercial"
      description="Documento profesional para enseñar al cliente: situación, problemas, evidencias, oportunidades y recomendaciones."
    >
      <div className="flex flex-col gap-4">
        {!hasAnalysis ? (
          <EmptyState
            title="Se necesita un análisis completado"
            description="El informe se construye con el análisis, las oportunidades y las evidencias de la empresa. Analízala primero."
          />
        ) : (
          <GenerateReportButton
            companyId={companyId}
            label={latest ? "Generar informe nuevo" : "Generar informe y PDF"}
            variant={latest ? "secondary" : "primary"}
            initialJobId={jobId}
            initialError={lastError}
          />
        )}

        {latest && (
          <div className="rounded-md border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{latest.title}</p>
                <p className="text-xs text-muted">{formatDateTime(latest.createdAt)}</p>
              </div>
              <Badge tone={latest.status === "ready" ? "ok" : latest.status === "failed" ? "bad" : "warn"}>
                {latest.status === "ready" ? "PDF listo" : latest.status === "failed" ? "PDF fallido" : "Generando"}
              </Badge>
            </div>
            {latest.status === "failed" && latest.error && (
              <p role="alert" className="mt-2 rounded-md bg-bad-soft px-2.5 py-1.5 text-xs text-bad">
                {latest.error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ButtonLink href={`/reports/${latest.id}`} size="sm" variant="secondary">
                Ver informe
              </ButtonLink>
              {latest.status === "ready" && (
                <ButtonLink href={`/api/reports/${latest.id}?format=pdf&download=1`} size="sm" variant="primary" prefetch={false}>
                  Descargar PDF
                </ButtonLink>
              )}
              {latest.status === "failed" && (
                <GenerateReportButton companyId={companyId} reportId={latest.id} label="Reintentar PDF" variant="secondary" />
              )}
            </div>
          </div>
        )}

        {older.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer select-none text-muted hover:text-ink">Informes anteriores ({older.length})</summary>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {older.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                  <Link href={`/reports/${r.id}`} className="text-accent hover:underline">
                    {formatDateTime(r.createdAt)}
                  </Link>
                  {r.status === "ready" ? (
                    <a href={`/api/reports/${r.id}?format=pdf&download=1`} className="text-muted hover:text-ink">
                      PDF
                    </a>
                  ) : (
                    <span className="text-faint">{r.status === "failed" ? "PDF fallido" : "Generando"}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Panel>
  );
}
