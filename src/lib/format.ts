const dateFmt = new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const numFmt = new Intl.NumberFormat("es");

export const formatDate = (d: Date | number | null | undefined) => (d ? dateFmt.format(d) : "—");
export const formatDateTime = (d: Date | number | null | undefined) => (d ? dateTimeFmt.format(d) : "—");
export const formatNumber = (n: number | null | undefined) => (n == null ? "—" : numFmt.format(n));

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
export function formatRelative(d: Date | number | null | undefined): string {
  if (!d) return "—";
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "ahora";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
