import { describe, expect, it } from "vitest";
import { daysUntil, followUpLabel, parseDateInput, toDateInput } from "./dates";

describe("fechas de seguimiento", () => {
  it("ida y vuelta de YYYY-MM-DD sin cambiar de día", () => {
    expect(toDateInput(parseDateInput("2026-03-09"))).toBe("2026-03-09");
    expect(toDateInput(null)).toBe("");
  });
  it("rechaza fechas no válidas", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("2026-02-31")).toBeNull();
    expect(parseDateInput("mañana")).toBeNull();
  });
  it("calcula días naturales y etiquetas", () => {
    const now = new Date(2026, 5, 10, 22, 30);
    expect(daysUntil(new Date(2026, 5, 10, 12), now)).toBe(0);
    expect(followUpLabel(new Date(2026, 5, 9, 12), now)).toEqual({ text: "Vencido hace 1 día", overdue: true });
    expect(followUpLabel(new Date(2026, 5, 11, 12), now).text).toBe("Mañana");
    expect(followUpLabel(new Date(2026, 5, 15, 12), now).text).toBe("En 5 días");
  });
});
