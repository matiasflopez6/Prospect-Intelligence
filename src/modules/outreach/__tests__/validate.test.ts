import { describe, expect, it } from "vitest";
import { validateMessage } from "../validate";

const known = new Set([1, 2, 3]);
const ok = { channel: "whatsapp" as const, body: "Hola, vi que su clínica tiene 120 reseñas y buena valoración. ¿Cómo gestionan hoy los turnos fuera de horario?", evidenceIds: [1] };

describe("validateMessage", () => {
  it("acepta un mensaje breve apoyado en evidencias reales", () => {
    expect(validateMessage(ok, known)).toEqual([]);
  });
  it("rechaza marcadores de plantilla", () => {
    expect(validateMessage({ ...ok, body: "Hola [Nombre], vi su web." }, known).join()).toMatch(/marcadores/);
    expect(validateMessage({ ...ok, body: "Hola {{nombre}}, vi su web." }, known).join()).toMatch(/marcadores/);
  });
  it("rechaza mensajes sin evidencia o con evidencias inexistentes", () => {
    expect(validateMessage({ ...ok, evidenceIds: [] }, known).join()).toMatch(/ninguna evidencia/);
    expect(validateMessage({ ...ok, evidenceIds: [99] }, known).join()).toMatch(/no existen/);
  });
  it("limita la longitud por canal", () => {
    expect(validateMessage({ ...ok, body: "palabra ".repeat(120) }, known).join()).toMatch(/demasiado largo/);
  });
  it("exige asunto en email y rechaza frases de plantilla", () => {
    const email = { channel: "email" as const, body: "Espero que este mensaje te encuentre bien. Vi su web.", evidenceIds: [2] };
    const problems = validateMessage(email, known).join();
    expect(problems).toMatch(/asunto/);
    expect(problems).toMatch(/plantilla/);
  });
});
