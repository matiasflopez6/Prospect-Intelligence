import { EmptyState, Panel } from "@/components/ui";

/** Sección de la ficha de empresa. Propietario: la sesión de ficha/mensajes/informe. Sustituir este stub por la implementación real. */
export function ReportPanel({ companyId }: { companyId: number }) {
  void companyId;
  return (
    <Panel id="report" title="Informe comercial">
      <EmptyState title="Pendiente de implementar" description="Esta sección la construye la sesión de ficha/mensajes/informe." />
    </Panel>
  );
}
