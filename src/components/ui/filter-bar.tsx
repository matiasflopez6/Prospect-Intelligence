"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { Input, Select } from "./form";

export type FilterField =
  | { type: "text"; name: string; placeholder: string; width?: string }
  | { type: "number"; name: string; placeholder: string; min?: number; max?: number; step?: number; width?: string }
  | { type: "select"; name: string; placeholder: string; options: { value: string; label: string }[]; width?: string };

/**
 * Barra de filtros genérica: el estado vive en la URL (compartible, sobrevive a recargas).
 * Cada cambio reinicia la paginación. Los inputs de texto/número aplican con debounce.
 */
export function FilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, params.get(f.name) ?? ""])),
  );
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function push(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const f of fields) {
      const v = next[f.name];
      if (v) p.set(f.name, v);
      else p.delete(f.name);
    }
    p.delete("page");
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function change(name: string, value: string, immediate: boolean) {
    const next = { ...values, [name]: value };
    setValues(next);
    clearTimeout(timer.current);
    if (immediate) push(next);
    else timer.current = setTimeout(() => push(next), 350);
  }

  const active = fields.some((f) => values[f.name]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {fields.map((f) => {
        const style = { width: f.width ?? (f.type === "text" ? "14rem" : "9rem") };
        if (f.type === "select") {
          return (
            <Select key={f.name} aria-label={f.placeholder} style={style} value={values[f.name]} onChange={(e) => change(f.name, e.target.value, true)}>
              <option value="">{f.placeholder}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          );
        }
        return (
          <Input
            key={f.name}
            aria-label={f.placeholder}
            style={style}
            type={f.type === "number" ? "number" : "search"}
            min={f.type === "number" ? f.min : undefined}
            max={f.type === "number" ? f.max : undefined}
            step={f.type === "number" ? f.step : undefined}
            placeholder={f.placeholder}
            value={values[f.name]}
            onChange={(e) => change(f.name, e.target.value, false)}
          />
        );
      })}
      {active && (
        <button
          type="button"
          className="h-8 px-2 text-sm text-muted hover:text-ink"
          onClick={() => {
            const cleared = Object.fromEntries(fields.map((f) => [f.name, ""]));
            setValues(cleared);
            push(cleared);
          }}
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
