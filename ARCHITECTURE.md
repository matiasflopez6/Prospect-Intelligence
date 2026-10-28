# Prospect Intelligence — Arquitectura

Aplicación de inteligencia comercial: **descubre** negocios reales por nicho y ubicación, los **analiza**, detecta **oportunidades**, las **puntúa**, prepara **mensajes** e **informes** y gestiona el **pipeline** (CRM) desde un dashboard.

## Stack

| Capa | Elección | Motivo |
|---|---|---|
| App | Next.js 16 (App Router) + React 19 + TypeScript estricto | Un solo proceso: UI, rutas API y trabajos |
| Estilos | Tailwind CSS 4 con tokens en `src/app/globals.css` | Diseño consistente, sin librería de componentes pesada |
| Datos | SQLite (`better-sqlite3`) + Drizzle ORM | Persistente en `data/prospect.db`, sin servidor, migrable a Postgres |
| Trabajos | Cola en tabla `jobs` + runner en proceso (`src/instrumentation.ts`) | Discovery/análisis son largos; persisten y se reanudan |
| IA | `@anthropic-ai/sdk` vía `src/lib/llm/anthropic.ts` | Un único punto de configuración |
| Validación | zod | Env, salidas del LLM |

Idioma de la UI y de los textos generados: **español**.

## Reglas del producto (no negociables)

1. **Nada inventado**: sin datos de ejemplo. Una integración sin credencial lanza `MissingCredentialError` y se muestra como bloqueo (Ajustes → Integraciones). Un módulo sin implementar lanza `NotImplementedError` (el trabajo falla con mensaje explícito).
2. **Toda afirmación tiene evidencia**: oportunidades y mensajes referencian filas de `evidence`. Sin evidencia no hay oportunidad. Ausencia de algo solo se afirma si se pudo leer la fuente (`kind: "absence"`).
3. **El scoring es heurístico y explicable**: se guarda el desglose por componente y se muestra `SCORE_DISCLAIMER`.

## Flujo de datos

```
Nueva búsqueda ──createSearch()──▶ searches + job "discovery.run"
  discovery.run  → providers (Google Places, OSM…) → deduplica → companies, company_sources,
                   social_profiles, reviews, search_companies, crm_entries(status=new)
                   → (autoAnalyze) job "company.analyze" por empresa
  company.analyze (analysis/pipeline.ts)
      WebsiteAnalyzer → señales ──▶ AnalysisInterpreter → resumen + hallazgos + evidence (analyses, evidence)
      OpportunityEngine → opportunities (+ opportunity_evidence)
      ScoringEngine → scores + companies.score/scoreTier/opportunityCount/topServiceKey
      crm_entries.status new → analyzed ; activity_log
  UI ficha → generar mensajes (job "message.generate") / informe (job "report.generate")
```

## Estructura y propiedad de archivos

Cada sesión toca **solo** su carpeta. Lo compartido lo cambia el propietario indicado; pide cambios por el hilo coordinador.

| Ruta | Contenido | Propietario |
|---|---|---|
| `src/lib/db/schema/*` | Esquema Drizzle (ver más abajo) y `drizzle/` (migraciones) | Fundación (cambios aditivos permitidos a cada módulo en SU archivo de tablas, ver "Migraciones") |
| `src/lib/config/*`, `src/lib/errors.ts`, `src/lib/llm/*`, `src/lib/{cn,format,url-state}.ts` | Entorno, integraciones, errores, cliente LLM, utilidades | Fundación |
| `src/domain/*` | Constantes y tipos de dominio (estados CRM, servicios, tipos de oportunidad, tiers, canales) | Fundación (ampliar listas está bien; **no renombrar claves persistidas**) |
| `src/components/ui/*`, `src/components/layout/*`, `src/app/{layout,globals.css,error,not-found}` | Sistema de diseño y shell | Fundación |
| `src/modules/jobs/*`, `src/modules/activity/*`, `src/instrumentation.ts` | Cola de trabajos, registro de actividad | Fundación |
| `src/app/settings`, `src/app/api/{health,jobs}` | Ajustes/integraciones, salud, estado de trabajos | Fundación |
| `src/modules/discovery/*`, `src/app/searches/**` | Proveedores de descubrimiento, orquestación, UI de búsquedas | **Sesión 1 — Discovery** |
| `src/modules/analysis/{types,pipeline,…}.ts`, `src/modules/opportunities/*` (salvo `ui/`), `src/modules/scoring/*` (salvo `ui/`) | Analizador web, interpretación, motor de oportunidades, scoring, `pipeline.ts` | **Sesión 2 — Análisis + oportunidades + scoring** |
| `src/modules/analysis/ui/*`, `opportunities/ui/*`, `scoring/ui/*` | Secciones de la ficha: Análisis, Evidencias, Oportunidades, Puntuación | Sesión 2 (la ficha solo las importa) |
| `src/app/companies/[id]/page.tsx`, `src/modules/outreach/*`, `src/modules/reports/*`, `src/app/reports/**` | Composición de la ficha, mensajes, informe + PDF | **Sesión 3 — Ficha / mensajes / informe** |
| `src/modules/crm/*`, `src/modules/dashboard/*`, `src/modules/companies/*` (service/types), `src/app/{page.tsx,companies/page.tsx,pipeline/**}` | CRM, dashboard, listado con filtros | **Sesión 4 — CRM / dashboard / filtros** |

La ficha (`companies/[id]/page.tsx`) es un ensamblaje de secciones: cada módulo exporta un componente `ui/*` con `{ companyId }`. Los stubs actuales ("Pendiente de implementar") se sustituyen sin tocar la página.

## Contratos de módulo

Todos los tipos están en `src/modules/<modulo>/types.ts`.

- **Discovery** (`discovery/types.ts`): `DiscoveryProvider { id, label, requiredEnv, availability(), search(query, ctx) → DiscoveredBusiness[], enrich?() }`. Se registra en `registry.ts`. `service.ts`: `createSearch()` (hecho), `runDiscovery(searchId, ctx)` (hecho; ver `src/modules/discovery/README.md`). Mapeo a tablas: ver `DiscoveredBusiness` → `companies` + `company_sources` (procedencia por campo) + `social_profiles` + `reviews`. Deduplicación: `googlePlaceId`, `osmId`, `websiteDomain`, nombre normalizado + dirección.
- **Análisis** (`analysis/types.ts`): `WebsiteAnalyzer.analyze() → WebsiteSignals` (hechos objetivos); `AnalysisInterpreter.interpret() → { summary, quality, findings[] }` (interpretación redactada con evidencias); `pipeline.ts: analyzeCompany(companyId, ctx)` orquesta analizador → intérprete → oportunidades → scoring y actualiza `companies` / `crm_entries`.
- **Oportunidades** (`opportunities/types.ts`): `OpportunityEngine.detect() → OpportunityDraft[]` (problema, evidencia, consecuencia, solución, `serviceKey`, impacto, severidad 1–5, confianza 0–1).
- **Scoring** (`scoring/types.ts`): `ScoringEngine.score()` función pura → `ScoreResult { total 0–100, tier, confidence, components[] }`; `methodVersion` versiona la heurística.
- **Mensajes** (`outreach/types.ts`): `generateMessages({ companyId, channels, opportunityId? })` → filas `messages` (email/linkedin/whatsapp) con `evidenceIds`.
- **Informes** (`reports/types.ts`): `ReportContent` estructurado → `reports.content`; PDF en `REPORTS_DIR`. (Sugerencia: HTML + Chromium headless/Playwright.)
- **CRM** (`crm/service.ts`): `updateCrm()`, `addNote()`; toda mutación llama a `logActivity("crm.*")`.
- **Dashboard** (`dashboard/service.ts`): agregados sobre tablas; hoy solo conteos.
- **Companies** (`companies/{types,service}.ts`): `getCompany()` (hecho), `listCompanies(query)` con `CompanyFilters` (nombre, nicho, ubicación, score, nº oportunidades, problema, servicio, estado CRM, valoración, reseñas).
- **Jobs** (`jobs/service.ts`): `enqueueJob({ type, payload, searchId?, companyId? })`; `jobs/handlers.ts` enlaza tipo → función de servicio; progreso con `ctx.setProgress(pct, label)`; estado vía `GET /api/jobs/:id`.
- **Actividad** (`activity/service.ts`): `logActivity({ type, message, companyId?, searchId? })` en cada hito (búsqueda creada/completada, empresa analizada, estado CRM, mensaje/informe generado).

## Modelo de datos (`src/lib/db/schema`)

- `discovery.ts`: `searches`, `companies` (incluye resumen desnormalizado: `score`, `scoreTier`, `opportunityCount`, `topServiceKey`, `analysisStatus`), `search_companies`, `company_sources`, `social_profiles`, `reviews`.
- `analysis.ts`: `analyses` (señales JSON, resumen, calidad, hallazgos), `evidence`, `opportunities`, `opportunity_evidence`, `scores` (historial con desglose JSON).
- `outreach.ts`: `messages`, `reports`.
- `crm.ts`: `members`, `crm_entries` (1:1 con empresa: estado, responsable, próxima acción, fecha de seguimiento), `crm_notes`.
- `system.ts`: `jobs`, `activity_log`, `settings`.

Los campos de resumen de `companies` los escribe el pipeline de análisis; el listado/dashboard los lee para filtrar y ordenar sin joins pesados.

### Migraciones
- Cambiar esquema: editar el archivo de tablas del módulo → `npm run db:generate -- --name <descripcion>` → commit del SQL y `drizzle/meta`. La app aplica migraciones pendientes al abrir la base.
- **Conflictos** (dos sesiones generaron migración a la vez): tras rebasar sobre `main`, borra tu migración y su snapshot, regenera. Prefiere cambios aditivos (columnas nuevas nullable) y avisa en el hilo.

## UI

Tokens en `globals.css` (`canvas, surface, line, ink, muted, accent…`). Un único acento (teal `#0b6e6a`); verde/ámbar/rojo solo como semántica de estado. Componentes base en `src/components/ui`: `Button/ButtonLink`, `Badge/CrmStatusBadge/ImpactBadge/ScoreBadge/ConfidenceMeter`, `Panel/Stat/StatRow/DescriptionList/EmptyState`, `DataTable/Pagination`, `FilterBar` (estado en la URL), `Field/Input/Select/Textarea`, `PageHeader`. Reutiliza estos componentes antes de crear otros; si falta algo genérico, añádelo ahí.

Evitar: tarjetas gigantes, degradados, iconos decorativos, gráficos sin información.

## Variables de entorno

Ver `.env.example`. Estado visible en **Ajustes**. Credenciales actuales: `GOOGLE_PLACES_API_KEY` (discovery), `ANTHROPIC_API_KEY` (interpretación, mensajes, informes), `OSM_CONTACT` (opcional, se añade al User-Agent de OSM; OSM funciona sin él), `NOMINATIM_URL`/`OVERPASS_URL` (opcionales, instancias propias), `PAGESPEED_API_KEY` opcional.

## Comandos

```
npm run dev         # servidor de desarrollo (+ runner de trabajos)
npm run build && npm start
npm run typecheck   # tsc
npm run lint        # eslint
npm test            # vitest
npm run db:generate # nueva migración
npm run db:migrate  # aplicar migraciones manualmente
```
