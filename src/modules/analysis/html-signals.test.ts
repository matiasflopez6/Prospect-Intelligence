import { describe, expect, it } from "vitest";
import { BASIC_CLINIC_CONTACT, BASIC_CLINIC_HOME, FULL_FEATURED_HOME, NO_VIEWPORT_HTTP_HOME, SPA_SHELL } from "./__fixtures__/sites";
import { extractPageSignals } from "./html-signals";

describe("extractPageSignals", () => {
  it("extrae propuesta, contacto, redes y tecnología de una web básica", () => {
    const s = extractPageSignals(BASIC_CLINIC_HOME, "https://clinicasonrisa.example/");
    expect(s.title).toMatch(/Clínica Dental Sonrisa/);
    expect(s.h1).toEqual(["Tu sonrisa, en las mejores manos"]);
    expect(s.metaDescription).toMatch(/Implantes/);
    expect(s.viewportMeta).toBe(true);
    expect(s.emails).toContain("info@clinicasonrisa.example");
    expect(s.phones.some((p) => p.replace(/\D/g, "").endsWith("4221234"))).toBe(true);
    expect(s.hasClickToCall).toBe(false);
    expect(s.whatsappLinks).toEqual([]);
    expect(s.whatsappWidget).toBe(false);
    expect(s.bookingVendor).toBeUndefined();
    expect(s.chatVendor).toBeUndefined();
    expect(s.tech.cms).toBe("WordPress");
    expect(s.tech.analytics).toContain("Google Analytics");
    expect(s.copyrightYear).toBe(2018);
    expect(s.likelyClientRendered).toBe(false);
    // redes: se ignoran los enlaces de "compartir"
    expect(s.social.map((x) => x.platform).sort()).toEqual(["facebook", "instagram"]);
    expect(s.followLinks).toContainEqual({ url: "https://clinicasonrisa.example/contacto", kind: "contact" });
  });

  it("ignora un año de copyright que un script actualiza al cargar (curYear)", () => {
    const html = '<html><body><p>Hola</p><footer>Copyright &#169; <span id="_publicarCurYear">2020</span> | Legales</footer></body></html>';
    expect(extractPageSignals(html, "https://x.example/").copyrightYear).toBeUndefined();
    const fixed = '<html><body><footer>© <span class="year">2020</span></footer></body></html>';
    expect(extractPageSignals(fixed, "https://x.example/").copyrightYear).toBe(2020);
  });

  it("reconoce un botón «Solicitar turno» que sale a un sistema externo de reservas", () => {
    const html = '<html><body><a href="https://www.neocita.com/clinica-x">Solicitar Turno</a><a href="https://wa.me/549387">Reservar</a></body></html>';
    expect(extractPageSignals(html, "https://clinica.example/").bookingVendor).toBe("NeoCita");
    const unknown = '<html><body><a href="https://agenda.nuevoservicio.test/x">Sacar turno online</a></body></html>';
    expect(extractPageSignals(unknown, "https://clinica.example/").bookingVendor).toBe("Enlace externo de turnos (agenda.nuevoservicio.test)");
    const social = '<html><body><a href="https://wa.me/549387">Reservar turno</a></body></html>';
    expect(extractPageSignals(social, "https://clinica.example/").bookingVendor).toBeUndefined();
  });

  it("conserva el prefijo +54 9 de los móviles argentinos", () => {
    const html = "<html><body><p>Cel: +54 9 387 220 2442</p></body></html>";
    expect(extractPageSignals(html, "https://clinica.example/").phones).toEqual(["+54 9 387 220 2442"]);
  });

  it("no confunde iconos de plantilla (portada de la red), no pega textos contiguos y cuenta formularios dibujados por JS", () => {
    const html =
      '<html><body><a href="https://www.instagram.com/">ig</a><a href="https://www.instagram.com/clinica_x/">ig</a>' +
      "<p><span>Cel: 387 220 2442</span><span>20 de Febrero 731</span></p>" +
      '<form class="framer-x"><button type="submit">Enviar</button></form></body></html>';
    const s = extractPageSignals(html, "https://clinica.example/");
    expect(s.social.map((x) => x.url)).toEqual(["https://www.instagram.com/clinica_x/"]);
    expect(s.phones).toEqual(["387 220 2442"]);
    expect(s.forms).toHaveLength(1);
    expect(s.forms[0]?.fieldCount).toBeUndefined();
  });

  it("detecta formularios con sus campos y distingue los largos", () => {
    const s = extractPageSignals(BASIC_CLINIC_CONTACT, "https://clinicasonrisa.example/contacto");
    expect(s.forms).toHaveLength(1);
    const f = s.forms[0]!;
    expect(f.fieldCount).toBe(8); // el checkbox de consentimiento y el submit no cuentan
    expect(f.hasRequiredPhone).toBe(true);
    expect(f.hasChoiceField).toBe(false);
    expect(f.isNewsletter).toBe(false);
    expect(s.isContactPage).toBe(true);
  });

  it("detecta WhatsApp, reservas, chat, formulario cualificado, píxeles y CRM", () => {
    const s = extractPageSignals(FULL_FEATURED_HOME, "https://dentalplus.example/");
    expect(s.whatsappLinks[0]).toMatch(/wa\.me\/5493874221234/);
    expect(s.hasClickToCall).toBe(true);
    expect(s.bookingVendor).toBe("Calendly");
    expect(s.chatVendor).toBe("Tidio");
    expect(s.forms[0]?.hasChoiceField).toBe(true);
    expect(s.tech.pixels).toContain("Meta Pixel");
    expect(s.tech.crm).toContain("HubSpot");
    expect(s.ctas.map((c) => c.kind)).toEqual(expect.arrayContaining(["whatsapp", "call", "booking"]));
  });

  it("detecta ausencia de viewport", () => {
    const s = extractPageSignals(NO_VIEWPORT_HTTP_HOME, "http://perez.example/");
    expect(s.viewportMeta).toBe(false);
    expect(s.h1).toEqual(["Odontología Pérez"]);
    expect(s.metaDescription).toBeUndefined();
  });

  it("marca como renderizada en cliente una página vacía con mucho script", () => {
    const s = extractPageSignals(SPA_SHELL, "https://bella.example/");
    expect(s.likelyClientRendered).toBe(true);
    expect(s.wordCount).toBeLessThan(10);
  });

  it("no confunde un buscador ni una suscripción con un formulario de consulta", () => {
    const html = `<body><form role="search"><input type="search" name="q"></form>
      <form><input type="email" name="email"><button>Suscribirme</button></form></body>`;
    const s = extractPageSignals(html, "https://x.example/");
    expect(s.forms).toHaveLength(1);
    expect(s.forms[0]?.isNewsletter).toBe(true);
  });
});
