import { ButtonLink, EmptyState, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Búsquedas" };

/** Propietario: sesión discovery (src/app/searches/**). */
export default function SearchesPage() {
  return (
    <>
      <PageHeader title="Búsquedas" description="Historial de búsquedas por nicho y ubicación." actions={<ButtonLink href="/searches/new" variant="primary">Nueva búsqueda</ButtonLink>} />
      <Panel>
        <EmptyState title="Aún no hay búsquedas" description="Cuando lances una búsqueda aparecerá aquí con su progreso y resultados." />
      </Panel>
    </>
  );
}
