import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisSummary } from "@/modules/analysis/ui/analysis-summary";
import { EvidenceList } from "@/modules/analysis/ui/evidence-list";
import { CrmPanel } from "@/modules/crm/ui/crm-panel";
import { getCompany } from "@/modules/companies/service";
import { OpportunityList } from "@/modules/opportunities/ui/opportunity-list";
import { MessagePanel } from "@/modules/outreach/ui/message-panel";
import { ReportPanel } from "@/modules/reports/ui/report-panel";
import { ScoreBreakdown } from "@/modules/scoring/ui/score-breakdown";
import { DescriptionList, PageHeader, Panel, ScoreBadge } from "@/components/ui";

/**
 * Propietario de la composición: sesión ficha/mensajes/informe.
 * Cada sección vive en el `ui/` de su módulo; aquí solo se ensamblan.
 */
export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  const company = Number.isInteger(companyId) ? getCompany(companyId) : undefined;
  if (!company) notFound();

  const sections = [
    ["overview", "General"],
    ["analysis", "Análisis"],
    ["opportunities", "Oportunidades"],
    ["score", "Puntuación"],
    ["evidence", "Evidencias"],
    ["messages", "Mensajes"],
    ["report", "Informe"],
    ["crm", "Seguimiento"],
  ] as const;

  return (
    <>
      <PageHeader
        breadcrumb={<Link href="/companies" className="hover:text-ink">Empresas</Link>}
        title={company.name}
        description={[company.category, company.address].filter(Boolean).join(" · ") || undefined}
        actions={<ScoreBadge score={company.score} tier={company.scoreTier} />}
      />
      <nav className="sticky top-12 z-10 -mx-4 mb-4 flex gap-4 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        {sections.map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="h-9 whitespace-nowrap py-2 text-sm text-muted hover:text-ink">
            {label}
          </a>
        ))}
      </nav>
      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel id="overview" title="Información general">
            <DescriptionList
              items={[
                { label: "Teléfono", value: company.phone },
                { label: "Email", value: company.email },
                { label: "Web", value: company.website && <a className="text-accent hover:underline" href={company.website} target="_blank" rel="noreferrer">{company.website}</a> },
                { label: "Dirección", value: company.address },
                { label: "Valoración", value: company.rating != null ? `${company.rating} (${company.reviewCount ?? 0} reseñas)` : null },
              ]}
            />
          </Panel>
          <AnalysisSummary companyId={company.id} />
          <OpportunityList companyId={company.id} />
          <ScoreBreakdown companyId={company.id} />
          <EvidenceList companyId={company.id} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <CrmPanel companyId={company.id} />
          <MessagePanel companyId={company.id} />
          <ReportPanel companyId={company.id} />
        </div>
      </div>
    </>
  );
}
