"use client";

import { useActionState } from "react";
import { addCompany, startSearch, type SearchFormState } from "@/app/searches/actions";
import { Badge, Button, Field, Input } from "@/components/ui";

export interface ProviderOption {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  missingEnv: string[];
}

export function NewSearchForm({ providers }: { providers: ProviderOption[] }) {
  const [state, action, pending] = useActionState<SearchFormState, FormData>(startSearch, {});
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de negocio" hint="Ej.: clínicas dentales, estudios contables">
          <Input name="niche" required minLength={2} maxLength={120} placeholder="clínicas dentales" autoFocus />
        </Field>
        <Field label="Ciudad o ubicación" hint="Ej.: Salta, Argentina">
          <Input name="location" required minLength={2} maxLength={160} placeholder="Salta, Argentina" />
        </Field>
      </div>
      <Field label="Número aproximado de empresas" className="max-w-48" hint="Entre 1 y 200">
        <Input name="targetCount" type="number" min={1} max={200} defaultValue={20} required />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-medium text-ink-2">Fuentes de datos</legend>
        {providers.map((p) => (
          <label key={p.id} className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2 has-[:disabled]:bg-canvas">
            <input type="checkbox" name="providers" value={p.id} defaultChecked={p.configured} disabled={!p.configured} className="mt-0.5 accent-[var(--color-accent)]" />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {p.label}
                {!p.configured && <Badge tone="warn">Falta {p.missingEnv.join(", ")}</Badge>}
              </span>
              <span className="block text-xs text-muted">{p.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="autoAnalyze" defaultChecked className="accent-[var(--color-accent)]" />
        Analizar automáticamente cada empresa al terminar
      </label>

      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Lanzando…" : "Buscar empresas"}
        </Button>
      </div>
    </form>
  );
}

export function AddCompanyForm() {
  const [state, action, pending] = useActionState<SearchFormState, FormData>(addCompany, {});
  return (
    <form action={action} className="grid max-w-2xl gap-4">
      <Field label="Web del negocio" hint="Los datos se leen de su propia web; no se inventa nada">
        <Input name="website" required maxLength={300} placeholder="www.ejemplo.com.ar" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nombre" hint="Opcional: se deduce de la web">
          <Input name="name" maxLength={120} />
        </Field>
        <Field label="Tipo de negocio">
          <Input name="niche" required minLength={2} maxLength={120} placeholder="clínicas dentales" />
        </Field>
        <Field label="Ciudad o ubicación">
          <Input name="location" required minLength={2} maxLength={160} placeholder="Salta, Argentina" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="autoAnalyze" defaultChecked className="accent-[var(--color-accent)]" />
        Analizarla automáticamente
      </label>
      {state.error && (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Leyendo la web…" : "Añadir empresa"}
        </Button>
      </div>
    </form>
  );
}
