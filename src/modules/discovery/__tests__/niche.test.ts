import { describe, expect, it } from "vitest";
import { resolveNiche } from "../lib/niche";

describe("resolveNiche", () => {
  it.each([
    ["clínicas dentales", "Dentista"],
    ["Odontólogos", "Dentista"],
    ["veterinarias", "Veterinaria"],
    ["estudios jurídicos", "Estudio jurídico"],
    ["gimnasios", "Gimnasio"],
    ["restaurantes", "Restaurante"],
    ["clínicas", "Clínica / consultorio"],
  ])("%s → %s", (niche, label) => {
    expect(resolveNiche(niche).profile?.label).toBe(label);
  });

  it("para un nicho desconocido no inventa etiquetas: devuelve palabras clave para buscar por nombre", () => {
    const r = resolveNiche("estudios de tatuajes");
    expect(r.profile).toBeUndefined();
    expect(r.keywords).toEqual(["estudio", "tatuaje"]);
  });
});
