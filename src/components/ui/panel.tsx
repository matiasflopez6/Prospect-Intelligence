import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  flush,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Sin padding interno (para tablas). */
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 rounded-lg border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

/** Fila de KPIs en una sola tarjeta con divisores (más densa que tarjetas sueltas). */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-line rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-x [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-line sm:[&>*:nth-child(n+3)]:border-t-0">
      {children}
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted">{i.label}</dt>
          <dd className="min-w-0 break-words text-ink">{i.value ?? <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({
  title,
  description,
  action,
  tone = "neutral",
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "blocked";
}) {
  return (
    <div className="flex flex-col items-start gap-1 px-4 py-8 sm:items-center sm:text-center">
      <p className={cn("text-sm font-medium", tone === "blocked" ? "text-warn" : "text-ink")}>{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
