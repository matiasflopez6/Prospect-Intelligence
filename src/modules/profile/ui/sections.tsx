import { SERVICES, serviceLabel } from "@/domain";
import { Badge, DescriptionList, EmptyState, ImpactBadge, Panel } from "@/components/ui";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import type { Company } from "@/modules/companies/service";
import type { ProfileData } from "../queries";

const ext = "text-accent hover:underline break-all";
const PROVIDER_LABELS: Record<string, string> = { "google-places": "Google Places", openstreetmap: "OpenStreetMap", website: "Sitio web del negocio" };

function formatHours(h: Company["openingHours"]): string[] {
  if (!h) return [];
  if (Array.isArray(h)) return h.map(String);
  return Object.entries(h).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
}

/** Información general + datos de contacto + web + procedencia. */
export function OverviewSection({ company, data }: { company: Company; data: ProfileData }) {
  const hours = formatHours(company.openingHours);
  const where = [company.city, company.region, company.country].filter(Boolean).join(", ");
  const providers = [...new Set(data.sources.map((s) => PROVIDER_LABELS[s.provider] ?? s.provider))];
  return (
    <Panel id="overview" title="Información general">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <DescriptionList
          items={[
            { label: "Categoría", value: company.category },
            { label: "Nicho de búsqueda", value: company.niche },
            { label: "Dirección", value: company.address },
            { label: "Zona", value: where || company.location },
            { label: "Estado", value: company.businessStatus },
          ]}
        />
        <DescriptionList
          items={[
            { label: "Teléfono", value: company.phone && <a className={ext} href={`tel:${company.phone.replace(/[^\d+]/g, "")}`}>{company.phone}</a> },
            { label: "Email", value: company.email && <a className={ext} href={`mailto:${company.email}`}>{company.email}</a> },
            { label: "WhatsApp", value: company.whatsapp && <a className={ext} href={`https://wa.me/${company.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{company.whatsapp}</a> },
            { label: "Sitio web", value: company.website && <a className={ext} href={company.website} target="_blank" rel="noreferrer">{company.website}</a> },
            { label: "Valoración", value: company.rating != null ? `${company.rating.toLocaleString("es", { maximumFractionDigits: 1 })} / 5 · ${company.reviewCount ?? 0} reseñas` : null },
          ]}
        />
      </div>
      {hours.length > 0 && (
        <details className="mt-4 border-t border-line pt-3 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted hover:text-ink">Horarios</summary>
          <ul className="mt-2 grid gap-x-8 gap-y-0.5 text-ink-2 sm:grid-cols-2">
            {hours.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      )}
      {providers.length > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-faint">
          Datos obtenidos de {providers.join(", ")}. Los campos vacíos indican que la fuente no los publica, no que el negocio no los tenga.
        </p>
      )}
    </Panel>
  );
}

/** Redes sociales y reseñas públicas. */
export function ReputationSection({ company, data }: { company: Company; data: ProfileData }) {
  const { socials, reviews } = data;
  return (
    <Panel id="reputation" title="Redes y reseñas">
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="mb-1.5 text-xs font-medium text-muted">Redes sociales</h3>
          {socials.length === 0 ? (
            <p className="text-sm text-muted">No se han encontrado perfiles enlazados en las fuentes consultadas.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {socials.map((s) => (
                <li key={s.id}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2 py-1 text-sm hover:bg-sunken">
                    <span className="font-medium capitalize">{s.platform}</span>
                    {s.followers != null && <span className="tnum text-xs text-muted">{s.followers.toLocaleString("es")} seguidores</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-medium text-muted">Reseñas</h3>
            {company.rating != null && (
              <span className="text-xs text-muted">
                <b className="tnum text-sm text-ink">{company.rating.toLocaleString("es", { maximumFractionDigits: 1 })}</b> / 5 · {company.reviewCount ?? 0} en total
              </span>
            )}
          </div>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted">La fuente no ha aportado el texto de reseñas individuales{company.reviewCount ? ` (hay ${company.reviewCount} en total)` : ""}.</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line">
                {reviews.map((r) => (
                  <li key={r.id} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      {r.rating != null && <span className="tnum font-semibold text-ink">{r.rating}★</span>}
                      <span>{r.author ?? "Anónimo"}</span>
                      {r.publishedAt && <span>· {formatDate(r.publishedAt)}</span>}
                      {r.ownerReplied === true && <Badge tone="ok">Con respuesta del negocio</Badge>}
                      {r.ownerReplied === false && <Badge tone="warn">Sin respuesta del negocio</Badge>}
                    </div>
                    {r.text && <p className="mt-1 text-sm text-ink-2">{r.text}</p>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">Muestra de reseñas públicas; no es la totalidad.</p>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Servicios que se podrían ofrecer, agrupados desde las oportunidades abiertas. */
export function ServicesSection({ data }: { data: ProfileData }) {
  const groups = new Map<string, ProfileData["opportunities"]>();
  for (const o of data.opportunities) groups.set(o.serviceKey, [...(groups.get(o.serviceKey) ?? []), o]);
  return (
    <Panel id="services" title="Servicios que podríamos ofrecer" description="Derivados de las oportunidades detectadas, de mayor a menor prioridad.">
      {groups.size === 0 ? (
        <EmptyState title="Sin servicios recomendados" description="Aparecerán cuando el análisis detecte oportunidades justificadas." />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {[...groups.entries()].map(([key, opps]) => (
            <li key={key} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{serviceLabel(key)}</h3>
                <ImpactBadge impact={opps.reduce((best, o) => (o.impact === "high" || (o.impact === "medium" && best === "low") ? o.impact : best), "low" as typeof opps[number]["impact"])} />
              </div>
              {key in SERVICES && <p className="text-xs text-muted">{SERVICES[key as keyof typeof SERVICES].description}</p>}
              <p className="text-sm text-ink-2">
                <span className="text-muted">Responde a: </span>
                {opps.map((o) => o.title).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Próximas acciones: seguimiento de CRM y pasos sugeridos por el estado de la ficha. */
export function NextActionsSection({
  data,
  analysisStatus,
  hasMessages,
  hasReport,
}: {
  data: ProfileData;
  analysisStatus: Company["analysisStatus"];
  hasMessages: boolean;
  hasReport: boolean;
}) {
  const overdue = data.followUpOverdue;
  const suggestions: string[] = [];
  if (analysisStatus === "pending" || analysisStatus === "failed") suggestions.push("Analizar la empresa para detectar problemas y oportunidades.");
  else if (analysisStatus === "done") {
    if (data.opportunities.length > 0 && !hasMessages) suggestions.push("Generar los mensajes de contacto y revisarlos.");
    if (data.opportunities.length > 0 && !hasReport) suggestions.push("Generar el informe PDF para enseñárselo al cliente.");
  }
  return (
    <Panel id="next-actions" title="Próximas acciones">
      <div className="flex flex-col gap-3 text-sm">
        {data.crm?.nextAction || data.crm?.followUpAt ? (
          <div>
            <p className="text-xs font-medium text-muted">Seguimiento comercial</p>
            {data.crm.nextAction && <p className="mt-0.5 text-ink">{data.crm.nextAction}</p>}
            {data.crm.followUpAt && (
              <p className={overdue ? "mt-0.5 text-xs text-bad" : "mt-0.5 text-xs text-muted"}>
                {overdue ? "Vencida: " : "Fecha: "}
                {formatDate(data.crm.followUpAt)} ({formatRelative(data.crm.followUpAt)}){data.owner ? ` · ${data.owner.name}` : ""}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted">No hay una próxima acción de seguimiento definida.</p>
        )}
        {suggestions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted">Sugeridas</p>
            <ul className="mt-0.5 list-disc pl-4 text-ink-2">
              {suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function ActivitySection({ items }: { items: { id: number; message: string; createdAt: Date }[] }) {
  return (
    <Panel id="activity" title="Actividad">
      {items.length === 0 ? (
        <p className="text-sm text-muted">Sin actividad registrada.</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
              <div className="min-w-0">
                <p className="text-ink-2">{a.message}</p>
                <p className="text-xs text-faint">{formatDateTime(a.createdAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
