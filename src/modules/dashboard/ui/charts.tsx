import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Texto secundario a la derecha del valor (p. ej. «3 de impacto alto»). */
  note?: string;
  href?: string;
}

/** Barras horizontales de un solo color: la longitud es la magnitud, el valor va escrito. */
export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => {
        const label = <span className="truncate text-sm text-ink-2 group-hover:text-ink">{i.label}</span>;
        return (
          <li key={i.key} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            {i.href ? <Link href={i.href} className="truncate hover:underline">{label}</Link> : label}
            <span className="tnum text-sm font-medium text-ink">
              {formatNumber(i.value)}
              {i.note && <span className="ml-2 text-xs font-normal text-muted">{i.note}</span>}
            </span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: i.value === 0 ? 0 : `${Math.max(2, (i.value / top) * 100)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Histograma de puntuaciones en tramos de 10. La intensidad sigue los umbrales de prioridad. */
export function ScoreHistogram({ buckets }: { buckets: number[] }) {
  const top = Math.max(1, ...buckets);
  const tone = (i: number) => (i >= 7 ? "bg-accent" : i >= 4 ? "bg-accent/55" : "bg-line-strong");
  const summary = buckets.map((n, i) => `${i * 10}–${i === 9 ? 100 : i * 10 + 9}: ${n}`).join(", ");
  return (
    <div>
      <div role="img" aria-label={`Empresas por tramo de puntuación. ${summary}`} className="flex h-32 items-end gap-1.5">
        {buckets.map((n, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${i * 10}–${i === 9 ? 100 : i * 10 + 9} puntos: ${n} ${n === 1 ? "empresa" : "empresas"}`}>
            <span className="tnum mb-1 text-center text-xs text-muted">{n > 0 ? n : ""}</span>
            <span className={cn("block w-full rounded-t-[3px]", n > 0 ? tone(i) : "bg-sunken")} style={{ height: n > 0 ? `${Math.max(4, (n / top) * 100)}%` : "2px" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {buckets.map((_, i) => (
          <span key={i} className="tnum flex-1 text-center text-2xs text-faint">{i * 10}</span>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <Legend className="bg-accent" label="Alta (≥ 70)" />
        <Legend className="bg-accent/55" label="Media (40–69)" />
        <Legend className="bg-line-strong" label="Baja (< 40)" />
      </p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-[2px]", className)} />
      {label}
    </span>
  );
}
