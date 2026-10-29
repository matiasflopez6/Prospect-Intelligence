import { PageHeader, Panel } from "@/components/ui";
import { discoveryProviders } from "@/modules/discovery/registry";
import { AddCompanyForm, NewSearchForm } from "@/modules/discovery/ui/new-search-form";

export const metadata = { title: "Nueva búsqueda" };
export const dynamic = "force-dynamic";

export default function NewSearchPage() {
  const providers = discoveryProviders.map((p) => ({ id: p.id, label: p.label, description: p.description, ...p.availability() }));
  return (
    <>
      <PageHeader title="Nueva búsqueda" description="Introduce un nicho y una ubicación: se buscan negocios reales y se guardan con la fuente de cada dato." />
      <Panel>
        <NewSearchForm providers={providers} />
      </Panel>
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">Añadir una empresa por su web</h2>
      <p className="mb-3 max-w-2xl text-xs text-muted">
        Para negocios que conoces y las fuentes no listan (la cobertura de OpenStreetMap es baja en muchas ciudades). Se guarda y se analiza igual que las descubiertas.
      </p>
      <Panel>
        <AddCompanyForm />
      </Panel>
    </>
  );
}
