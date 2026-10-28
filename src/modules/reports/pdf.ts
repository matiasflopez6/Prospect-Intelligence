import fs from "node:fs";
import path from "node:path";
import { getEnv } from "@/lib/config/env";
import { ProviderError } from "@/lib/errors";

/** Rutas habituales de Chromium/Chrome si Playwright no tiene su propio navegador descargado. */
const CANDIDATES = [
  "/opt/pw-browsers/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

function findChromium(): string | undefined {
  const fromEnv = getEnv().CHROMIUM_PATH;
  if (fromEnv) return fromEnv;
  return CANDIDATES.find((p) => fs.existsSync(p));
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Renderiza el HTML del informe a PDF (A4) con Chromium headless. Sin JavaScript ni red: el HTML es
 * autocontenido. Lanza ProviderError con instrucciones si no hay navegador.
 */
export async function renderPdf(html: string, footerTitle: string): Promise<Buffer> {
  const { chromium } = await import("playwright-core");
  const executablePath = findChromium();
  let browser;
  try {
    browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
  } catch (e) {
    throw new ProviderError(
      "chromium",
      `No se pudo iniciar Chromium para generar el PDF. Instala uno con «npx playwright-core install chromium» o define CHROMIUM_PATH con la ruta de Chrome/Chromium. (${e instanceof Error ? e.message.split("\n")[0] : e})`,
    );
  }
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-family:Arial,sans-serif;font-size:7.5px;color:#7a828e;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>${escHtml(footerTitle)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "16mm", bottom: "20mm", left: "16mm", right: "16mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Resuelve una ruta relativa de PDF dentro de REPORTS_DIR sin permitir salir de la carpeta. */
export function resolveReportPath(relative: string): string {
  const root = path.resolve(getEnv().REPORTS_DIR);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Ruta de informe no válida");
  return full;
}
