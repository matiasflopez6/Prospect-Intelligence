import { EmptyState, Panel } from "@/components/ui";

/** Sección de la ficha de empresa. Propietario: la sesión de oportunidades. Sustituir este stub por la implementación real. */
export function OpportunityList({ companyId }: { companyId: number }) {
  void companyId;
  return (
    <Panel id="opportunities" title="Oportunidades">
      <EmptyState title="Pendiente de implementar" description="Esta sección la construye la sesión de oportunidades." />
    </Panel>
  );
}
