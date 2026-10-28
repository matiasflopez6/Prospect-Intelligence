"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/", label: "Panel" },
  { href: "/searches", label: "Búsquedas" },
  { href: "/companies", label: "Empresas" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/reports", label: "Informes" },
];
const footerItems = [{ href: "/settings", label: "Ajustes" }];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const link = (i: { href: string; label: string }) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={onNavigate}
      aria-current={isActive(pathname, i.href) ? "page" : undefined}
      className={cn(
        "flex h-8 items-center rounded-md border-l-2 px-2.5 text-sm transition-colors",
        isActive(pathname, i.href)
          ? "border-accent bg-sunken font-semibold text-ink"
          : "border-transparent text-ink-2 hover:bg-sunken hover:text-ink",
      )}
    >
      {i.label}
    </Link>
  );
  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {items.map(link)}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">{footerItems.map(link)}</div>
    </nav>
  );
}

export function SidebarNav({ pendingIntegrations }: { pendingIntegrations: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const brand = (
    <Link href="/" className="flex items-baseline gap-1.5 px-2.5">
      <span className="text-[15px] font-bold tracking-tight text-ink">Prospect</span>
      <span className="text-[15px] font-medium tracking-tight text-accent">Intelligence</span>
    </Link>
  );
  const warning =
    pendingIntegrations > 0 ? (
      <Link
        href="/settings"
        className="mt-3 block rounded-md border border-line bg-warn-soft px-2.5 py-2 text-xs text-warn hover:border-warn/40"
      >
        {pendingIntegrations} {pendingIntegrations === 1 ? "integración sin configurar" : "integraciones sin configurar"}
      </Link>
    ) : null;

  return (
    <>
      {/* Escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="mb-5">{brand}</div>
        <NavList pathname={pathname} />
        {warning}
      </aside>

      {/* Móvil */}
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-surface px-4 lg:hidden">
        {brand}
        <button
          type="button"
          aria-expanded={open}
          aria-label="Menú"
          onClick={() => setOpen((o) => !o)}
          className="h-8 rounded-md border border-line-strong px-2.5 text-sm text-ink-2"
        >
          {open ? "Cerrar" : "Menú"}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-12 z-20 border-b border-line bg-surface px-3 py-3 shadow-pop lg:hidden">
          <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
          {warning}
        </div>
      )}
    </>
  );
}
