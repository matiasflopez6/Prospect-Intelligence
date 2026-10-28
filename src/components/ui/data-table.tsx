import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Si se define, la cabecera es un enlace de ordenación. */
  sortHref?: string;
  sorted?: "asc" | "desc";
  className?: string;
  /** Ocultar bajo este breakpoint. */
  hideBelow?: "sm" | "md" | "lg";
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowHref?: (row: T) => string;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-left text-xs font-medium text-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "h-8 px-3 font-medium whitespace-nowrap",
                  c.align === "right" && "text-right",
                  c.hideBelow && hide[c.hideBelow],
                  c.className,
                )}
              >
                {c.sortHref ? (
                  <Link href={c.sortHref} className={cn("inline-flex items-center gap-1 hover:text-ink", c.sorted && "text-ink")}>
                    {c.header}
                    {c.sorted && <span aria-hidden>{c.sorted === "asc" ? "↑" : "↓"}</span>}
                  </Link>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)} className="group border-b border-line last:border-b-0 hover:bg-canvas/70">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      "h-10 px-3 align-middle",
                      c.align === "right" && "text-right",
                      c.hideBelow && hide[c.hideBelow],
                      c.className,
                    )}
                  >
                    {i === 0 && href ? (
                      <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
                        {c.cell(row)}
                      </Link>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && empty}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "rounded-md border border-line-strong px-2 py-1 text-xs hover:bg-sunken";
  return (
    <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
      <span className="tnum">
        {from}–{to} de {total}
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={link}>
            Anterior
          </Link>
        ) : (
          <span className={cn(link, "opacity-40")}>Anterior</span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={link}>
            Siguiente
          </Link>
        ) : (
          <span className={cn(link, "opacity-40")}>Siguiente</span>
        )}
      </div>
    </div>
  );
}
