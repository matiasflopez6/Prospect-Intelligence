import { EmptyState, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Empresas" };

/** Propietario: sesión CRM/dashboard/filtros. Tabla + FilterBar sobre modules/companies/service.listCompanies. */
export default function CompaniesPage() {
  return (
    <>
      <PageHeader title="Empresas" description="Todas las empresas descubiertas, con búsqueda y filtros." />
      <Panel>
        <EmptyState title="Listado pendiente" description="Lo implementa la sesión de CRM, dashboard y filtros." />
      </Panel>
    </>
  );
}
