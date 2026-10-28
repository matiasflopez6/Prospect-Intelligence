import { EmptyState, PageHeader, Panel } from "@/components/ui";

export const metadata = { title: "Nueva búsqueda" };

/** Propietario: sesión discovery. Formulario: nicho, ubicación, nº de empresas → createSearch(). */
export default function NewSearchPage() {
  return (
    <>
      <PageHeader title="Nueva búsqueda" />
      <Panel>
        <EmptyState title="Formulario pendiente" description="Lo implementa la sesión de descubrimiento (modules/discovery)." />
      </Panel>
    </>
  );
}
