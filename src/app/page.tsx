import { ButtonLink, EmptyState, PageHeader, Panel, Stat, StatRow } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { getDashboardCounts } from "@/modules/dashboard/service";

export const metadata = { title: "Panel" };

/** Propietario: sesión CRM/dashboard/filtros. Esto es solo el esqueleto con conteos reales. */
export default function DashboardPage() {
  const c = getDashboardCounts();
  return (
    <>
      <PageHeader
        title="Panel"
        description="Resumen del mercado y del pipeline."
        actions={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
      />
      <StatRow>
        <Stat label="Empresas encontradas" value={formatNumber(c.companies)} />
        <Stat label="Empresas analizadas" value={formatNumber(c.analyzed)} />
        <Stat label="Búsquedas" value={formatNumber(c.searches)} />
        <Stat label="Oportunidades prioritarias" value="—" hint="Disponible tras el primer análisis" />
      </StatRow>
      {c.companies === 0 && (
        <Panel className="mt-4">
          <EmptyState
            title="Todavía no hay empresas"
            description="Lanza una búsqueda por nicho y ubicación para descubrir negocios reales y analizarlos."
            action={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>}
          />
        </Panel>
      )}
    </>
  );
}
