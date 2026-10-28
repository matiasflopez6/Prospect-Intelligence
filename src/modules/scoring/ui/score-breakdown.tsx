import { EmptyState, Panel } from "@/components/ui";

/** Sección de la ficha de empresa. Propietario: la sesión de scoring. Sustituir este stub por la implementación real. */
export function ScoreBreakdown({ companyId }: { companyId: number }) {
  void companyId;
  return (
    <Panel id="score" title="Puntuación">
      <EmptyState title="Pendiente de implementar" description="Esta sección la construye la sesión de scoring." />
    </Panel>
  );
}
