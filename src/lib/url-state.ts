export type SearchParams = Record<string, string | string[] | undefined>;

export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function numParam(v: string | string[] | undefined): number | undefined {
  const s = firstParam(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Construye una URL conservando los params actuales y aplicando cambios (undefined/"" los elimina). */
export function withParams(
  base: string,
  current: SearchParams,
  changes: Record<string, string | number | undefined | null>,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const s = firstParam(v);
    if (s !== undefined && s !== "") p.set(k, s);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === null || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}
