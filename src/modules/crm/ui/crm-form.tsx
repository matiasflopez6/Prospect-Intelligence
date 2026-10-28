"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { CRM_STATUSES, CRM_STATUS_LABELS, type CrmStatus } from "@/domain";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { addNoteAction, saveCrmAction, type CrmFormState } from "../actions";


function Feedback({ state }: { state: CrmFormState }) {
  if (state.error) return <p role="alert" className="text-xs text-bad">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-xs text-ok">Guardado</p>;
  return null;
}

export function CrmForm({
  companyId,
  status,
  ownerId,
  nextAction,
  followUpAt,
  lostReason,
  members,
}: {
  companyId: number;
  status: CrmStatus;
  ownerId: number | null;
  nextAction: string | null;
  /** YYYY-MM-DD */
  followUpAt: string;
  lostReason: string | null;
  members: { id: number; name: string }[];
}) {
  const [state, setState] = useState<CrmFormState>({});
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [current, setCurrent] = useState<CrmStatus>(status);
  const [owner, setOwner] = useState(ownerId ? String(ownerId) : "");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveCrmAction(data);
      setState(res);
      if (res.ok) {
        setOwner(res.ownerId ? String(res.ownerId) : "");
        const newOwner = formRef.current?.elements.namedItem("newOwner");
        if (newOwner instanceof HTMLInputElement) newOwner.value = "";
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3">
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Estado">
          <Select name="status" value={current} onChange={(e) => setCurrent(e.target.value as CrmStatus)}>
            {CRM_STATUSES.map((s) => (
              <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Responsable">
          <Select name="ownerId" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Nuevo responsable" hint="Escribe un nombre para crearlo y asignarlo.">
        <Input name="newOwner" maxLength={80} placeholder="Nombre" autoComplete="off" />
      </Field>
      <Field label="Próxima acción">
        <Input key={nextAction ?? ""} name="nextAction" maxLength={500} defaultValue={nextAction ?? ""} placeholder="p. ej. Enviar mensaje por WhatsApp" />
      </Field>
      <Field label="Fecha de seguimiento">
        <Input key={followUpAt} name="followUpAt" type="date" defaultValue={followUpAt} />
      </Field>
      {current === "lost" && (
        <Field label="Motivo de la pérdida">
          <Input name="lostReason" maxLength={500} defaultValue={lostReason ?? ""} placeholder="Opcional" />
        </Field>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Guardando…" : "Guardar seguimiento"}</Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function NoteForm({ companyId, authorId }: { companyId: number; authorId: number | null }) {
  const [state, setState] = useState<CrmFormState>({});
  const [pending, start] = useTransition();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    start(async () => {
      const res = await addNoteAction(data);
      setState(res);
      if (res.ok) form.reset();
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={companyId} />
      {authorId && <input type="hidden" name="authorId" value={authorId} />}
      <Textarea name="body" required maxLength={4000} aria-label="Nota" placeholder="Añadir una nota (llamada, contexto, objeciones…)" />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Añadir nota"}</Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
