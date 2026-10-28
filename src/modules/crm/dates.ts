/**
 * Fechas de seguimiento: se guardan a las 12:00 locales del día elegido para que el día
 * no cambie por zona horaria, y se comparan por día natural.
 */
const pad = (n: number) => String(n).padStart(2, "0");

/** Date → "YYYY-MM-DD" (día local), valor de `<input type="date">`. */
export function toDateInput(d: Date | null | undefined): string {
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
}

/** "YYYY-MM-DD" → Date a las 12:00 locales; null si vacío o no válido. */
export function parseDateInput(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** Días naturales entre hoy y la fecha (negativo = vencido). */
export function daysUntil(d: Date, now: Date = new Date()): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function followUpLabel(d: Date, now: Date = new Date()): { text: string; overdue: boolean } {
  const days = daysUntil(d, now);
  if (days < 0) return { text: `Vencido hace ${-days} ${-days === 1 ? "día" : "días"}`, overdue: true };
  if (days === 0) return { text: "Hoy", overdue: false };
  if (days === 1) return { text: "Mañana", overdue: false };
  return { text: `En ${days} días`, overdue: false };
}
