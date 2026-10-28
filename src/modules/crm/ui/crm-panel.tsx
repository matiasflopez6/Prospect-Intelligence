import { EmptyState, Panel } from "@/components/ui";

/** Sección de la ficha de empresa. Propietario: la sesión de CRM. Sustituir este stub por la implementación real. */
export function CrmPanel({ companyId }: { companyId: number }) {
  void companyId;
  return (
    <Panel id="crm" title="Seguimiento comercial">
      <EmptyState title="Pendiente de implementar" description="Esta sección la construye la sesión de CRM." />
    </Panel>
  );
}
