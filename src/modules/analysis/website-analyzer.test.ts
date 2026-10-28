import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASIC_CLINIC_CONTACT, BASIC_CLINIC_HOME, FULL_FEATURED_HOME } from "./__fixtures__/sites";
import { isPrivateAddress, normalizeWebsiteUrl, safeFetchHtml } from "./safe-fetch";
import { analyzeWebsite } from "./website-analyzer";

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const send = (status: number, body: string, type = "text/html; charset=utf-8") => {
      res.writeHead(status, { "content-type": type });
      res.end(body);
    };
    switch (req.url) {
      case "/":
        return send(200, BASIC_CLINIC_HOME.replaceAll("/contacto", "/contacto"));
      case "/contacto":
        return send(200, BASIC_CLINIC_CONTACT);
      case "/full":
        return send(200, FULL_FEATURED_HOME);
      case "/redirect":
        res.writeHead(302, { location: "/full" });
        return res.end();
      case "/to-metadata":
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        return res.end();
      case "/loop":
        res.writeHead(302, { location: "/loop" });
        return res.end();
      case "/missing":
        return send(404, "nope");
      case "/pdf":
        return send(200, "%PDF", "application/pdf");
      case "/huge":
        return send(200, "<html><body>" + "a ".repeat(2_000_000) + "</body></html>");
      default:
        return send(404, "nope");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

describe("seguridad de la descarga", () => {
  it("clasifica direcciones privadas", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "142.250.1.1", "2606:4700::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("normaliza y rechaza URLs inválidas", () => {
    expect(normalizeWebsiteUrl("clinica.com")?.toString()).toBe("https://clinica.com/");
    expect(normalizeWebsiteUrl("ftp://x.com")).toBeUndefined();
    expect(normalizeWebsiteUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeWebsiteUrl("")).toBeUndefined();
  });

  it("bloquea localhost y IPs privadas por defecto (SSRF)", async () => {
    const r = await safeFetchHtml(`${base}/`);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("blocked");
  });

  it("bloquea redirecciones hacia direcciones privadas", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    }) as unknown as typeof fetch;
    const r = await safeFetchHtml("http://8.8.8.8/", { fetchImpl });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("blocked");
    expect(calls).toBe(1); // nunca se llegó a pedir la dirección interna
  });
});

describe("safeFetchHtml (servidor local)", () => {
  const opts = { allowPrivate: true };

  it("descarga HTML y mide tiempos", async () => {
    const r = await safeFetchHtml(`${base}/full`, opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toMatch(/Dental Plus/);
      expect(r.ttfbMs).toBeGreaterThanOrEqual(0);
      expect(r.status).toBe(200);
    }
  });

  it("sigue redirecciones y reporta la URL final", async () => {
    const r = await safeFetchHtml(`${base}/redirect`, opts);
    expect(r.ok && r.finalUrl.endsWith("/full")).toBe(true);
  });

  it("corta bucles de redirección", async () => {
    const r = await safeFetchHtml(`${base}/loop`, opts);
    expect(r.ok).toBe(false);
  });

  it("clasifica errores HTTP y contenido no HTML", async () => {
    const missing = await safeFetchHtml(`${base}/missing`, opts);
    expect(!missing.ok && missing.kind).toBe("http");
    expect(!missing.ok && missing.status).toBe(404);
    const pdf = await safeFetchHtml(`${base}/pdf`, opts);
    expect(!pdf.ok && pdf.kind).toBe("not-html");
  });

  it("limita el tamaño descargado", async () => {
    const r = await safeFetchHtml(`${base}/huge`, { ...opts, maxBytes: 100_000 });
    expect(r.ok && r.truncated).toBe(true);
    expect(r.ok && r.bytes).toBeLessThan(400_000);
  });

  it("devuelve fallo (sin lanzar) si el servidor no existe", async () => {
    const r = await safeFetchHtml("http://127.0.0.1:1/", { ...opts, timeoutMs: 2000 });
    expect(r.ok).toBe(false);
  });
});

describe("analyzeWebsite", () => {
  it("combina portada y página de contacto", async () => {
    const s = await analyzeWebsite(`${base}/`, { allowPrivate: true });
    expect(s.reachable).toBe(true);
    expect(s.pagesVisited).toHaveLength(2);
    expect(s.forms?.count).toBe(1);
    expect(s.forms?.items[0]?.fieldCount).toBe(8);
    expect(s.contact?.hasContactPage).toBe(true);
    expect(s.contact?.whatsappLinks).toEqual([]);
    expect(s.booking?.detected).toBe(false);
    expect(s.social?.map((x) => x.platform).sort()).toEqual(["facebook", "instagram"]);
    expect(s.https).toBe(false); // el servidor de pruebas es http
  });

  it("detecta funcionalidades en una web completa", async () => {
    const s = await analyzeWebsite(`${base}/full`, { allowPrivate: true });
    expect(s.booking).toMatchObject({ detected: true, vendor: "Calendly" });
    expect(s.chat).toMatchObject({ detected: true, vendor: "Tidio" });
    expect(s.contact?.whatsappLinks.length).toBe(1);
    expect(s.contact?.hasClickToCall).toBe(true);
  });

  it("una web caída produce reachable=false con causa, sin lanzar", async () => {
    const s = await analyzeWebsite(`${base}/missing`, { allowPrivate: true });
    expect(s.reachable).toBe(false);
    expect(s.fetchErrorKind).toBe("http");
    expect(s.httpStatus).toBe(404);
  });

  it("una URL inválida no lanza", async () => {
    const s = await analyzeWebsite("ftp://nope", { allowPrivate: true });
    expect(s).toMatchObject({ reachable: false, fetchErrorKind: "invalid-url" });
  });
});
