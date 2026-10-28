import { EmptyState, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Informes" };

/** Propietario: sesión ficha/mensajes/informe. Lista de informes generados (tabla reports). */
export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Informes" description="Informes comerciales generados." />
      <Panel>
        <EmptyState title="Aún no hay informes" description="Genera un informe desde la ficha de una empresa." />
      </Panel>
    </>
  );
}
