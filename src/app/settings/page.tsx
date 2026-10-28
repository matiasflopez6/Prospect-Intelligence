import { Badge, DataTable, PageHeader, Panel } from "@/components/ui";
import { getIntegrationStatuses } from "@/lib/config/integrations";

export const metadata = { title: "Ajustes" };

export default function SettingsPage() {
  const integrations = getIntegrationStatuses();
  return (
    <>
      <PageHeader title="Ajustes" description="Estado de las integraciones. Las claves se definen en .env.local (ver .env.example); nunca se muestran aquí." />
      <Panel title="Integraciones" flush>
        <DataTable
          rows={integrations}
          rowKey={(i) => i.id}
          columns={[
            { key: "name", header: "Integración", cell: (i) => <span className="font-medium">{i.label}</span> },
            { key: "purpose", header: "Para qué sirve", cell: (i) => (
                <span className="text-muted">
                  {i.purpose}
                  {i.detail && <span className="mt-0.5 block text-xs text-ink-2">{i.detail}</span>}
                </span>
              ),
              hideBelow: "md",
            },
            {
              key: "env",
              header: "Variables",
              hideBelow: "sm",
              cell: (i) =>
                i.requiredEnv.length + i.optionalEnv.length === 0 ? (
                  <span className="text-faint">ninguna</span>
                ) : (
                  <span className="font-mono text-xs text-ink-2">
                    {i.requiredEnv.join(i.anyOf ? " o " : ", ")}
                    {i.optionalEnv.length > 0 && <span className="text-faint"> {i.requiredEnv.length ? "· opcional: " : "opcional: "}{i.optionalEnv.join(", ")}</span>}
                  </span>
                ),
            },
            {
              key: "status",
              header: "Estado",
              cell: (i) =>
                i.configured ? (
                  <Badge tone="ok">Configurada</Badge>
                ) : (
                  <Badge tone={i.critical ? "bad" : "warn"}>Falta {i.missingEnv.join(", ")}</Badge>
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
