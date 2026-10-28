import fs from "node:fs";
import path from "node:path";
import { IMPACT_LABELS } from "@/domain";
import type { ReportContent } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texto con párrafos (línea en blanco) y viñetas ("• ") → HTML seguro. */
function rich(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length && lines.every((l) => l.trim().startsWith("•"))) {
        return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^\s*•\s*/, ""))}</li>`).join("")}</ul>`;
      }
      return `<p>${lines.map(esc).join("<br>")}</p>`;
    })
    .join("");
}

const SEVERITY_LABELS = ["", "Menor", "Leve", "Moderado", "Alto", "Crítico"];
const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric" });

let fontCss: string | undefined;
/** Inter embebida (base64) para que el PDF se vea igual en cualquier equipo. Si falta, cae a fuentes del sistema. */
function interFontFace(): string {
  if (fontCss === undefined) {
    try {
      const file = path.resolve(process.cwd(), "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
      const b64 = fs.readFileSync(file).toString("base64");
      fontCss = `@font-face{font-family:"Inter Report";font-weight:100 900;font-style:normal;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
    } catch {
      fontCss = "";
    }
  }
  return fontCss;
}

const CSS = `
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Inter Report",Inter,"Helvetica Neue",Arial,sans-serif;font-size:10.5pt;line-height:1.5;color:#0e1116;background:#fff}
.doc{max-width:210mm;margin:0 auto}
@media screen{body{background:#eceef1}.doc{background:#fff;margin:16px auto;padding:18mm 16mm;box-shadow:0 1px 3px rgba(14,17,22,.12)}}
@media screen and (max-width:700px){.doc{padding:20px 16px;margin:0}}
h1,h2,h3,p,ul,ol,dl,dd{margin:0}
p+p,p+ul,ul+p{margin-top:.55em}
ul{padding-left:1.1em}li{margin-top:.2em}
a{color:#0b6e6a;text-decoration:none;word-break:break-all}
.eyebrow{font-size:8.5pt;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:#0b6e6a}
.cover{padding-bottom:14pt;border-bottom:2pt solid #0e1116}
.cover h1{margin-top:6pt;font-size:25pt;line-height:1.15;letter-spacing:-.02em;font-weight:700}
.cover .sub{margin-top:5pt;font-size:11pt;color:#3a414c}
.meta{display:flex;flex-wrap:wrap;gap:6pt 28pt;margin-top:14pt;font-size:9pt}
.meta dt{color:#5b6370;font-size:8pt;text-transform:uppercase;letter-spacing:.05em}
.meta dd{font-weight:500}
.kpis{display:flex;border:.75pt solid #cfd3d9;border-radius:4pt;margin-top:14pt}
.kpi{flex:1;padding:8pt 11pt}.kpi+.kpi{border-left:.75pt solid #cfd3d9}
.kpi b{display:block;font-size:17pt;line-height:1.2;font-weight:700;letter-spacing:-.01em}
.kpi span{font-size:8pt;color:#5b6370}
section{margin-top:20pt}
h2{font-size:13pt;font-weight:700;letter-spacing:-.01em;padding-bottom:4pt;border-bottom:.75pt solid #cfd3d9;margin-bottom:9pt;break-after:avoid}
h2 .n{color:#0b6e6a;margin-right:6pt}
h3{font-size:10.5pt;font-weight:600}
.muted{color:#5b6370}.small{font-size:9pt}
.pill{display:inline-block;padding:1pt 6pt;border-radius:3pt;font-size:8pt;font-weight:600;background:#f0f1f3;color:#3a414c;white-space:nowrap}
.pill.hi{background:#e5f1f0;color:#0b6e6a}.pill.sev{background:#0e1116;color:#fff}
.item{padding:8pt 0;border-bottom:.5pt solid #e3e5e9;break-inside:avoid}
.item:last-child{border-bottom:0}
.item header{display:flex;justify-content:space-between;gap:10pt;align-items:baseline}
.opp{border:.75pt solid #cfd3d9;border-radius:4pt;padding:10pt 12pt;margin-top:9pt;break-inside:avoid}
.opp:first-of-type{margin-top:0}
.opp header{display:flex;justify-content:space-between;gap:10pt;align-items:flex-start;margin-bottom:6pt}
.opp .tags{display:flex;gap:4pt;flex-wrap:wrap;justify-content:flex-end}
.field{display:grid;grid-template-columns:78pt 1fr;gap:8pt;padding:4pt 0;border-top:.5pt solid #e3e5e9}
.field dt{font-size:8pt;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#5b6370;padding-top:1.5pt}
.q{display:grid;grid-template-columns:1fr 1fr;gap:5pt 24pt;margin-top:8pt}
.q div{display:grid;grid-template-columns:1fr 26pt;gap:6pt;align-items:center;font-size:9pt}
.bar{grid-column:1/-1;height:3pt;border-radius:2pt;background:#e3e5e9;overflow:hidden}.bar i{display:block;height:100%;background:#0b6e6a}
ol.rec{padding-left:1.3em}ol.rec li{margin-top:.45em;padding-left:.2em}
table{width:100%;border-collapse:collapse;font-size:9pt}
th{text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.05em;color:#5b6370;padding:4pt 6pt;border-bottom:.75pt solid #cfd3d9}
td{padding:5pt 6pt;vertical-align:top;border-bottom:.5pt solid #e3e5e9}
tr{break-inside:avoid}
.foot{margin-top:22pt;padding-top:8pt;border-top:.75pt solid #cfd3d9;font-size:8pt;color:#5b6370}
`;

/** HTML autocontenido del informe. Es la única fuente de verdad de la vista previa y del PDF. */
export function renderReportHtml(r: ReportContent): string {
  const by = [r.preparedBy?.name, r.preparedBy?.agency].filter(Boolean).join(" · ");
  const high = r.opportunities.filter((o) => o.impact === "high").length;
  const date = dateFmt.format(new Date(r.generatedAt));

  const kpis = [
    `<div class="kpi"><b>${r.opportunities.length}</b><span>${r.opportunities.length === 1 ? "oportunidad detectada" : "oportunidades detectadas"}</span></div>`,
    `<div class="kpi"><b>${high}</b><span>de impacto alto</span></div>`,
    `<div class="kpi"><b>${r.problems.length}</b><span>${r.problems.length === 1 ? "problema encontrado" : "problemas encontrados"}</span></div>`,
    r.score ? `<div class="kpi"><b>${r.score.total}<span style="font-size:9pt;font-weight:500">/100</span></b><span>índice orientativo · ${esc(r.score.tier.toLowerCase())}</span></div>` : "",
  ].join("");

  const quality = r.quality?.length
    ? `<div class="q">${r.quality
        .map((q) => `<div><span>${esc(q.label)}</span><b style="text-align:right">${q.value}</b><span class="bar"><i style="width:${Math.min(100, Math.max(0, q.value))}%"></i></span></div>`)
        .join("")}</div><p class="small muted" style="margin-top:6pt">Indicadores orientativos (0–100) derivados del análisis; no son una auditoría técnica.</p>`
    : "";

  const strengths = r.strengths?.length
    ? `<h3 style="margin-top:12pt">Lo que ya funciona</h3><ul>${r.strengths.map((s) => `<li><b>${esc(s.title)}.</b> ${esc(s.description)}</li>`).join("")}</ul>`
    : "";

  const problems = r.problems.length
    ? r.problems
        .map(
          (p) =>
            `<div class="item"><header><h3>${esc(p.title)}</h3><span class="pill sev">${SEVERITY_LABELS[p.severity]}</span></header>${rich(p.description)}</div>`,
        )
        .join("")
    : `<p class="muted">No se han encontrado problemas relevantes con la información disponible.</p>`;

  const opps = r.opportunities.length
    ? r.opportunities
        .map(
          (o, i) => `<article class="opp">
<header><h3>${i + 1}. ${esc(o.title)}</h3><div class="tags"><span class="pill hi">Impacto ${esc(IMPACT_LABELS[o.impact].toLowerCase())}</span><span class="pill">${o.confidence < 0.5 ? "Hipótesis a validar · " : "Confianza "}${Math.round(o.confidence * 100)}%</span></div></header>
<dl>
<div class="field"><dt>Problema</dt><dd>${esc(o.problem)}</dd></div>
${o.evidence?.length ? `<div class="field"><dt>Evidencia</dt><dd><ul>${o.evidence.map((e) => `<li><b>${esc(e.label)}.</b> ${esc(e.detail)}</li>`).join("")}</ul></dd></div>` : ""}
<div class="field"><dt>Consecuencia</dt><dd>${esc(o.consequence)}</dd></div>
<div class="field"><dt>Solución</dt><dd>${esc(o.solution)}</dd></div>
${o.impactNote ? `<div class="field"><dt>Impacto estimado</dt><dd>${esc(o.impactNote)}</dd></div>` : ""}
</dl></article>`,
        )
        .join("")
    : `<p class="muted">No se han podido justificar oportunidades con la información pública disponible.</p>`;

  const recs = r.recommendations.length ? `<ol class="rec">${r.recommendations.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : `<p class="muted">Sin recomendaciones: no hay oportunidades justificadas.</p>`;
  const systems = r.proposedSystems.length
    ? r.proposedSystems.map((s) => `<div class="item"><h3>${esc(s.service)}</h3><p class="small">${esc(s.description)}</p></div>`).join("")
    : `<p class="muted">Sin sistemas propuestos.</p>`;

  const evidence = r.evidence.length
    ? `<section><h2><span class="n">7</span>Anexo: evidencias</h2><table><thead><tr><th style="width:28%">Observación</th><th>Detalle</th></tr></thead><tbody>${r.evidence
        .map(
          (e) =>
            `<tr><td><b>${esc(e.label)}</b></td><td>${esc(e.detail)}${e.sourceUrl ? `<br><a href="${esc(e.sourceUrl)}">${esc(e.sourceUrl)}</a>` : ""}</td></tr>`,
        )
        .join("")}</tbody></table></section>`
    : "";

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe — ${esc(r.company.name)}</title>
<style>${interFontFace()}${CSS}</style></head>
<body><div class="doc">
<header class="cover">
<div class="eyebrow">Informe de oportunidades de mejora</div>
<h1>${esc(r.company.name)}</h1>
<p class="sub">${esc([r.company.niche, r.company.address].filter(Boolean).join(" · "))}</p>
<dl class="meta">
<div><dt>Fecha</dt><dd>${esc(date)}</dd></div>
${by ? `<div><dt>Preparado por</dt><dd>${esc(by)}</dd></div>` : ""}
${r.company.website ? `<div><dt>Sitio web analizado</dt><dd>${esc(r.company.website)}</dd></div>` : ""}
</dl>
<div class="kpis">${kpis}</div>
</header>
<section><h2><span class="n">1</span>Situación actual</h2>${rich(r.currentSituation)}${quality}${strengths}</section>
<section><h2><span class="n">2</span>Problemas encontrados</h2>${problems}</section>
<section><h2><span class="n">3</span>Oportunidades detectadas</h2>${opps}</section>
<section><h2><span class="n">4</span>Recomendaciones</h2>${recs}</section>
<section><h2><span class="n">5</span>Sistemas que podríamos implementar</h2>${systems}</section>
<section><h2><span class="n">6</span>Impacto potencial</h2>${rich(r.potentialImpact)}</section>
${evidence}
<p class="foot">Informe elaborado a partir de información pública disponible el ${esc(date)} (web del negocio, fichas públicas y reseñas). ${r.score ? esc(r.score.disclaimer) : ""} Las oportunidades indican dónde puede haber margen de mejora; su impacto real depende de datos internos que no se han podido revisar.</p>
</div></body></html>`;
}
