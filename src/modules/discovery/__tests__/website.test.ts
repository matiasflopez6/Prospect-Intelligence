import { describe, expect, it, vi } from "vitest";
import { enrichFromWebsite, extractEmails, extractSocialLinks, extractWhatsapp, pickBestEmail } from "../website";

const page = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

const HOME = `<html><body>
  <a href="/contacto">Contacto</a>
  <a href="https://www.instagram.com/clinica_prueba/">IG</a>
  <a href="https://www.facebook.com/sharer/sharer.php?u=x">compartir</a>
  <a href="https://www.facebook.com/clinicaprueba">FB</a>
  <a href="https://wa.me/5493875550101?text=Hola">WhatsApp</a>
  <a href="tel:+543875550101">Llamar</a>
  <img src="logo@2x.png">
</body></html>`;

describe("extracción", () => {
  it("extrae emails reales, ignora basura y desofusca &#64; y (arroba)", () => {
    const html = `<a href="mailto:Info@Clinica.example?subject=Hola">x</a> ventas&#64;clinica.example turnos (arroba) otra.example noreply@clinica.example logo@2x.png usuario@example.com`;
    expect(extractEmails(html)).toEqual(["info@clinica.example", "ventas@clinica.example", "turnos@otra.example"]);
  });

  it("extrae redes sociales de perfil y descarta enlaces de compartir", () => {
    expect(extractSocialLinks(HOME)).toEqual([
      { platform: "instagram", url: "https://www.instagram.com/clinica_prueba" },
      { platform: "facebook", url: "https://www.facebook.com/clinicaprueba" },
    ]);
  });

  it("extrae WhatsApp de wa.me y api.whatsapp.com", () => {
    expect(extractWhatsapp(HOME)).toBe("+5493875550101");
    expect(extractWhatsapp('<a href="https://api.whatsapp.com/send?phone=5491100000000&text=x">')).toBe("+5491100000000");
    expect(extractWhatsapp("<p>sin whatsapp</p>")).toBeUndefined();
  });

  it("prefiere el email del dominio de la web y buzones comerciales", () => {
    expect(pickBestEmail(["random@gmail.com", "info@clinica.example", "juan@clinica.example"], "clinica.example")).toBe("info@clinica.example");
  });
});

describe("enrichFromWebsite", () => {
  it("lee la home y la página de contacto cuando la home no trae email", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /admin\n", { headers: { "content-type": "text/plain" } });
      if (url.endsWith("/contacto")) return page('<p>Escribinos a <a href="mailto:turnos@clinica.example">turnos@clinica.example</a></p>');
      return page(HOME);
    });
    const r = await enrichFromWebsite("https://clinica.example", { fetchImpl: fetchImpl as unknown as typeof fetch, skipDnsCheck: true });
    expect(r.pagesVisited).toEqual(["https://clinica.example/", "https://clinica.example/contacto"]);
    expect(r.email).toBe("turnos@clinica.example");
    expect(r.whatsapp).toBe("+5493875550101");
    expect(r.phones).toEqual(["+543875550101"]);
    expect(r.socialLinks.map((s) => s.platform)).toEqual(["instagram", "facebook"]);
  });

  it("respeta robots.txt", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } }) : page(HOME),
    );
    const r = await enrichFromWebsite("https://cerrada.example", { fetchImpl: fetchImpl as unknown as typeof fetch, skipDnsCheck: true });
    expect(r.pagesVisited).toEqual([]);
    expect(r.note).toMatch(/robots/);
  });

  it("bloquea destinos privados/locales (SSRF), también tras una redirección", async () => {
    const fetchImpl = vi.fn(async () => page("secreto"));
    const direct = await enrichFromWebsite("http://127.0.0.1:8080/", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(direct.pagesVisited).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining("127.0.0.1/"), expect.anything());

    const redirecting = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("publica.example") ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }) : page("metadata"),
    );
    const r = await enrichFromWebsite("https://publica.example", { fetchImpl: redirecting as unknown as typeof fetch, skipDnsCheck: true });
    expect(r.pagesVisited).toEqual([]);
    expect(r.note).toMatch(/IP privada/);
  });

  it("informa sin lanzar si la web responde con error", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (String(input).endsWith("/robots.txt") ? new Response("", { status: 404 }) : page("no", 500)));
    const r = await enrichFromWebsite("https://caida.example", { fetchImpl: fetchImpl as unknown as typeof fetch, skipDnsCheck: true });
    expect(r.pagesVisited).toEqual([]);
    expect(r.note).toContain("HTTP 500");
  });
});
