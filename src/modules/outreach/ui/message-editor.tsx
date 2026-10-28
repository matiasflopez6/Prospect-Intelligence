"use client";

import { useState, useTransition } from "react";
import { MESSAGE_CHANNEL_LABELS, MESSAGE_STATUSES, type MessageChannel, type MessageStatus } from "@/domain";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import { saveMessage } from "../actions";
import { countWords, WORD_LIMITS } from "../validate";

const STATUS_LABELS: Record<MessageStatus, string> = { draft: "Borrador", approved: "Aprobado", sent: "Enviado" };

export interface MessageView {
  id: number;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  status: MessageStatus;
  createdAt: string;
  evidence: { id: number; label: string; detail: string }[];
}

/** Dónde se puede abrir el mensaje, solo con datos reales de la empresa. */
export interface ContactTargets {
  email?: string | null;
  whatsappDigits?: string | null;
  linkedinUrl?: string | null;
}

function openHref(m: { channel: MessageChannel; subject: string; body: string }, t: ContactTargets): { href: string; label: string } | null {
  if (m.channel === "email" && t.email) {
    return { href: `mailto:${t.email}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`, label: "Abrir en el correo" };
  }
  if (m.channel === "whatsapp" && t.whatsappDigits) {
    return { href: `https://wa.me/${t.whatsappDigits}?text=${encodeURIComponent(m.body)}`, label: "Abrir en WhatsApp" };
  }
  if (m.channel === "linkedin" && t.linkedinUrl) return { href: t.linkedinUrl, label: "Abrir perfil de LinkedIn" };
  return null;
}

export function MessageEditor({ message, targets, readOnly }: { message: MessageView; targets: ContactTargets; readOnly?: boolean }) {
  const [subject, setSubject] = useState(message.subject ?? "");
  const [body, setBody] = useState(message.body);
  const [status, setStatus] = useState<MessageStatus>(message.status);
  const [saved, setSaved] = useState({ subject: message.subject ?? "", body: message.body, status: message.status });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = subject !== saved.subject || body !== saved.body || status !== saved.status;
  const words = countWords(body);
  const limit = WORD_LIMITS[message.channel];
  const open = openHref({ channel: message.channel, subject, body }, targets);

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveMessage({ id: message.id, subject: message.channel === "email" ? subject : null, body, status });
      if ("error" in res) setError(res.error);
      else setSaved({ subject, body, status });
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.channel === "email" && subject ? `Asunto: ${subject}\n\n${body}` : body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se pudo copiar al portapapeles. Selecciona el texto y cópialo manualmente.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {message.channel === "email" && (
        <Input aria-label="Asunto" placeholder="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} readOnly={readOnly} />
      )}
      <Textarea
        aria-label={`Mensaje de ${MESSAGE_CHANNEL_LABELS[message.channel]}`}
        className="min-h-28 leading-relaxed"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        readOnly={readOnly}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={words > limit ? "text-warn" : "text-faint"}>
          {words} palabras · objetivo ≤ {limit}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && (
            <Select aria-label="Estado del mensaje" className="h-7 w-auto text-xs" value={status} onChange={(e) => setStatus(e.target.value as MessageStatus)}>
              {MESSAGE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? "Copiado" : "Copiar"}
          </Button>
          {open && (
            <a className="inline-flex h-7 items-center rounded-md border border-line-strong px-2.5 text-sm text-ink hover:bg-sunken" href={open.href} target="_blank" rel="noreferrer">
              {open.label}
            </a>
          )}
          {!readOnly && (
            <Button size="sm" variant="primary" onClick={save} disabled={!dirty || pending || body.trim() === ""}>
              {pending ? "Guardando…" : dirty ? "Guardar cambios" : "Guardado"}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-bad-soft px-2.5 py-1.5 text-xs text-bad">
          {error}
        </p>
      )}
      {message.evidence.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none hover:text-ink">Basado en {message.evidence.length} {message.evidence.length === 1 ? "evidencia" : "evidencias"}</summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {message.evidence.map((e) => (
              <li key={e.id} className="flex gap-1.5">
                <Badge tone="outline" className="shrink-0">#{e.id}</Badge>
                <span>
                  <span className="font-medium text-ink-2">{e.label}.</span> {e.detail}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
