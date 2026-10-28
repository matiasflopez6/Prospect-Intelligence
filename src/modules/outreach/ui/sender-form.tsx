"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { saveSender } from "../actions";

export function SenderForm({ companyId, initial }: { companyId: number; initial: { name?: string; agency?: string } }) {
  const [name, setName] = useState(initial.name ?? "");
  const [agency, setAgency] = useState(initial.agency ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const res = await saveSender({ companyId, name, agency });
      setMsg("error" in res ? res.error : "Guardado. Se usará en los próximos mensajes e informes.");
    });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Tu nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
      </Field>
      <Field label="Tu consultora">
        <Input value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="Nombre de la consultora" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button size="sm" onClick={save} disabled={pending}>
          Guardar remitente
        </Button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}
