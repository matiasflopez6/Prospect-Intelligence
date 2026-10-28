import { EmptyState, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Pipeline" };

/** Propietario: sesión CRM/dashboard/filtros. */
export default function PipelinePage() {
  return (
    <>
      <PageHeader title="Pipeline" description="Seguimiento comercial por estado." />
      <Panel>
        <EmptyState title="Pipeline pendiente" description="Lo implementa la sesión de CRM." />
      </Panel>
    </>
  );
}
