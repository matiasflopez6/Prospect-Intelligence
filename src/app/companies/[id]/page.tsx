import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CrmStatusBadge, PageHeader, ScoreBadge } from "@/components/ui";
import { getDb, tables } from "@/lib/db";
import { AnalysisSummary } from "@/modules/analysis/ui/analysis-summary";
import { EvidenceList } from "@/modules/analysis/ui/evidence-list";
import { listRecentActivity } from "@/modules/activity/service";
import { getCompany } from "@/modules/companies/service";
import { CrmPanel } from "@/modules/crm/ui/crm-panel";
import { OpportunityList } from "@/modules/opportunities/ui/opportunity-list";
import { MessagePanel } from "@/modules/outreach/ui/message-panel";
import { getProfileData } from "@/modules/profile/queries";
import { ActivitySection, NextActionsSection, OverviewSection, ReputationSection, ServicesSection } from "@/modules/profile/ui/sections";
import { ReportPanel } from "@/modules/reports/ui/report-panel";
import { ScoreBreakdown } from "@/modules/scoring/ui/score-breakdown";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const company = getCompany(Number((await params).id));
  return { title: company?.name ?? "Empresa" };
}

/**
 * Composición de la ficha. Cada sección vive en el `ui/` de su módulo; aquí solo se ensamblan.
 * Análisis, oportunidades, puntuación y evidencias son de la sesión de análisis (solo se importan).
 */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  const company = Number.isInteger(companyId) ? getCompany(companyId) : undefined;
  if (!company) notFound();

  const db = getDb();
  const data = getProfileData(company.id, db);
  const hasMessages = Boolean(db.select({ id: tables.messages.id }).from(tables.messages).where(eq(tables.messages.companyId, company.id)).limit(1).get());
  const hasReport = Boolean(db.select({ id: tables.reports.id }).from(tables.reports).where(and(eq(tables.reports.companyId, company.id), eq(tables.reports.status, "ready"))).limit(1).get());
  const activity = listRecentActivity({ companyId: company.id, limit: 8 });

  const sections = [
    ["overview", "General"],
    ["reputation", "Redes y reseñas"],
    ["analysis", "Análisis"],
    ["opportunities", "Oportunidades"],
    ["services", "Servicios"],
    ["score", "Puntuación"],
    ["evidence", "Evidencias"],
    ["messages", "Mensajes"],
    ["report", "Informe"],
  ] as const;

  return (
    <>
      <PageHeader
        breadcrumb={<Link href="/companies" className="hover:text-ink">Empresas</Link>}
        title={company.name}
        description={[company.category, company.address].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {data.crm && <CrmStatusBadge status={data.crm.status} />}
            <ScoreBadge score={company.score} tier={company.scoreTier} />
          </>
        }
      />
      <nav className="sticky top-12 z-10 -mx-4 mb-4 flex gap-4 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8" aria-label="Secciones de la ficha">
        {sections.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="h-9 whitespace-nowrap py-2 text-sm text-muted hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <OverviewSection company={company} data={data} />
          <ReputationSection company={company} data={data} />
          <AnalysisSummary companyId={company.id} />
          <OpportunityList companyId={company.id} />
          <ServicesSection data={data} />
          <ScoreBreakdown companyId={company.id} />
          <EvidenceList companyId={company.id} />
          <MessagePanel companyId={company.id} />
          <ReportPanel companyId={company.id} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <CrmPanel companyId={company.id} />
          <NextActionsSection data={data} analysisStatus={company.analysisStatus} hasMessages={hasMessages} hasReport={hasReport} />
          <ActivitySection items={activity} />
        </aside>
      </div>
    </>
  );
}
