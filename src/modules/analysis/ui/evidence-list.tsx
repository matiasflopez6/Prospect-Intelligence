import { EmptyState, Panel } from "@/components/ui";

/** Sección de la ficha de empresa. Propietario: la sesión de análisis. Sustituir este stub por la implementación real. */
export function EvidenceList({ companyId }: { companyId: number }) {
  void companyId;
  return (
    <Panel id="evidence" title="Evidencias">
      <EmptyState title="Pendiente de implementar" description="Esta sección la construye la sesión de análisis." />
    </Panel>
  );
}
