"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const root = () => document.documentElement;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(root(), { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const getTheme = (): Theme => (root().dataset.theme === "dark" ? "dark" : "light");
const getServerTheme = (): Theme => "light";

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Mantiene `data-theme` al día: sigue al sistema mientras no haya elección guardada
 * y recoge los cambios hechos en otras pestañas. Se monta una sola vez (en la navegación).
 */
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root().dataset.theme = readStored() ?? (media.matches ? "dark" : "light");
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY || e.key === null) apply();
    };
    media.addEventListener("change", apply);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", apply);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/**
 * Botón de tema: muestra el sol en oscuro (para pasar a claro) y la luna en claro (para pasar a oscuro).
 * Los iconos se alternan con CSS (variante `dark:`) para no depender de la hidratación.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Cambiar a tema oscuro" : "Cambiar a tema claro";

  return (
    <button
      type="button"
      onClick={() => {
        root().dataset.theme = next;
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          /* almacenamiento no disponible: el tema solo dura esta visita */
        }
      }}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      <span className="dark:hidden"><MoonIcon /></span>
      <span className="hidden dark:inline-flex"><SunIcon /></span>
    </button>
  );
}
