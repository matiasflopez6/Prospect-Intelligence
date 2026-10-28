import { PageHeader, Panel } from "@/components/ui";
import { discoveryProviders } from "@/modules/discovery/registry";
import { NewSearchForm } from "@/modules/discovery/ui/new-search-form";

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
    </>
  );
}
