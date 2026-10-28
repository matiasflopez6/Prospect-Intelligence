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
