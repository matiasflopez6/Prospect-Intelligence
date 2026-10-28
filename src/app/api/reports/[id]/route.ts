import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { renderReportHtml } from "@/modules/reports/html";
import { resolveReportPath } from "@/modules/reports/pdf";
import { getReport } from "@/modules/reports/service";
import type { ReportContent } from "@/modules/reports/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/reports/:id            → HTML del informe (vista previa)
 * GET /api/reports/:id?format=pdf → PDF (añade &download=1 para forzar descarga)
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const report = getReport(Number((await params).id));
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL(req.url);

  if (url.searchParams.get("format") === "pdf") {
    if (!report.pdfPath || report.status !== "ready") return NextResponse.json({ error: "pdf_not_ready", detail: report.error }, { status: 409 });
    try {
      const file = await fs.readFile(resolveReportPath(report.pdfPath));
      const name = report.pdfPath.split(/[\\/]/).pop() ?? "informe.pdf";
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      return NextResponse.json({ error: "pdf_missing", detail: "El archivo PDF ya no existe en disco; regenera el PDF." }, { status: 410 });
    }
  }

  if (!report.content) return NextResponse.json({ error: "no_content" }, { status: 409 });
  return new NextResponse(renderReportHtml(report.content as unknown as ReportContent), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src data:",
    },
  });
}
