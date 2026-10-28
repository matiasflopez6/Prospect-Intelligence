import Link from "next/link";
import { MESSAGE_CHANNEL_LABELS, MESSAGE_CHANNELS, type MessageChannel } from "@/domain";
import { EmptyState, Panel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getDb, tables } from "@/lib/db";
import { eq } from "drizzle-orm";
import { activeJobId, lastJobError } from "../../profile/jobs";
import { getSenderProfile } from "../../profile/sender";
import { evidenceLabels, listMessages, listOpenOpportunities, outreachAvailability, type StoredMessage } from "../service";
import { GenerateControls } from "./generate-controls";
import { MessageEditor, type ContactTargets, type MessageView } from "./message-editor";
import { SenderForm } from "./sender-form";

const digits = (s: string | null | undefined) => (s ? s.replace(/\D/g, "") : "");

/** Sección de la ficha: mensajes de contacto personalizados (email, LinkedIn, WhatsApp), editables y regenerables. */
export function MessagePanel({ companyId }: { companyId: number }) {
  const db = getDb();
  const company = db.select().from(tables.companies).where(eq(tables.companies.id, companyId)).get();
  if (!company) return null;
  const availability = outreachAvailability();
  const opportunities = listOpenOpportunities(companyId, db);
  const all = listMessages(companyId, db);
  const sender = getSenderProfile(db);
  const linkedin = db.select().from(tables.socialProfiles).where(eq(tables.socialProfiles.companyId, companyId)).all().find((s) => s.platform === "linkedin");

  const labels = evidenceLabels([...new Set(all.flatMap((m) => m.evidenceIds ?? []))], db);
  const view = (m: StoredMessage): MessageView => ({
    id: m.id,
    channel: m.channel,
    subject: m.subject,
    body: m.body,
    status: m.status,
    createdAt: formatDateTime(m.createdAt),
    evidence: (m.evidenceIds ?? []).flatMap((id) => {
      const e = labels.get(id);
      return e ? [{ id, ...e }] : [];
    }),
  });
  const targets: ContactTargets = { email: company.email, whatsappDigits: digits(company.whatsapp) || null, linkedinUrl: linkedin?.url ?? null };

  const byChannel = (c: MessageChannel) => all.filter((m) => m.channel === c);
  const jobId = activeJobId(companyId, "message.generate", db);
  const lastError = lastJobError(companyId, "message.generate", db);
  const oppById = new Map(opportunities.map((o) => [o.id, o.title]));

  return (
    <Panel
      id="messages"
      title="Mensajes de contacto"
      description="Redactados solo con evidencias reales de la empresa. Revísalos y edítalos antes de enviar."
    >
      <div className="flex flex-col gap-4">
        {!availability.configured ? (
          <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-warn">
            <p className="font-medium">Generación bloqueada: falta una clave de IA</p>
            <p className="mt-0.5 text-xs">
              Para redactar mensajes personalizados añade <code>ANTHROPIC_API_KEY</code> o <code>GEMINI_API_KEY</code> (Google AI Studio) en <code>.env.local</code> y reinicia (estado en{" "}
              <Link href="/settings" className="underline">
                Ajustes
              </Link>
              ). No se usan plantillas genéricas como sustituto.
            </p>
          </div>
        ) : opportunities.length === 0 ? (
          <EmptyState
            title="Aún no hay oportunidades en las que basar un mensaje"
            description="Los mensajes se apoyan en las oportunidades y evidencias del análisis. Analiza la empresa primero."
          />
        ) : (
          <GenerateControls
            companyId={companyId}
            opportunities={opportunities.map((o) => ({ id: o.id, title: o.title }))}
            hasMessages={all.length > 0}
            initialJobId={jobId}
            initialError={lastError}
          />
        )}

        {all.length > 0 &&
          MESSAGE_CHANNELS.map((channel) => {
            const versions = byChannel(channel);
            const [latest, ...older] = versions;
            if (!latest) return null;
            return (
              <section key={channel} aria-label={MESSAGE_CHANNEL_LABELS[channel]} className="border-t border-line pt-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{MESSAGE_CHANNEL_LABELS[channel]}</h3>
                  <span className="text-xs text-faint">
                    {formatDateTime(latest.createdAt)}
                    {latest.opportunityId && oppById.get(latest.opportunityId) ? ` · ${oppById.get(latest.opportunityId)}` : ""}
                  </span>
                </div>
                {/* key por id: al llegar una versión nueva el editor se reinicia con su texto */}
                <MessageEditor key={latest.id} message={view(latest)} targets={targets} />
                {older.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer select-none text-muted hover:text-ink">
                      Versiones anteriores ({older.length})
                    </summary>
                    <div className="mt-2 flex flex-col gap-4 border-l-2 border-line pl-3">
                      {older.map((m) => (
                        <div key={m.id}>
                          <p className="mb-1 text-faint">{formatDateTime(m.createdAt)}</p>
                          <MessageEditor message={view(m)} targets={targets} readOnly />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })}

        <details className="border-t border-line pt-3 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted hover:text-ink">
            Remitente{sender.name || sender.agency ? `: ${[sender.name, sender.agency].filter(Boolean).join(" · ")}` : " (sin configurar: los mensajes no llevarán firma)"}
          </summary>
          <div className="mt-2">
            <SenderForm companyId={companyId} initial={sender} />
          </div>
        </details>
      </div>
    </Panel>
  );
}
