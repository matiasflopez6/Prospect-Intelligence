# Prospect Intelligence

Inteligencia comercial: encuentra negocios reales por nicho y ubicación, los analiza, detecta oportunidades, puntúa y prepara el contacto.

Ver `ARCHITECTURE.md` (módulos, contratos y propiedad de archivos).

## Ejecutar en local

Requisitos: Node.js 20+ y npm. La base de datos es SQLite (`data/prospect.db`) y se crea y migra sola al abrir la app.

```bash
npm install
cp .env.example .env.local   # completa las claves que tengas
npm run dev                  # http://localhost:3000
```

Para uso real (más rápido y sin recarga en caliente): `npm run build && npm start`.

### Variables de entorno (`.env.local`)

Ninguna es obligatoria para arrancar: lo que falte aparece como «Falta configurar» en **Ajustes → Integraciones** y solo bloquea esa función.

| Variable | Para qué | Dónde conseguirla |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Descubrimiento con Google Places (valoraciones, reseñas, teléfono, web, horarios) | Google Cloud: habilita **Places API (New)**, activa la facturación y crea una clave |
| `GEMINI_API_KEY` o `ANTHROPIC_API_KEY` | IA: interpretación del análisis, oportunidades, mensajes. Basta una (`LLM_PROVIDER=anthropic\|gemini` fuerza cuál si hay ambas) | https://aistudio.google.com/apikey · https://console.anthropic.com/ |
| `CHROMIUM_PATH` | Chromium/Chrome para generar el **PDF** del informe | Ver abajo |
| `PAGESPEED_API_KEY`, `OSM_CONTACT` | Opcionales (cuota de PageSpeed; User-Agent de OpenStreetMap) | |

Sin clave de IA el análisis funciona con reglas deterministas (se indica en la ficha), pero los mensajes de contacto requieren IA. OpenStreetMap funciona sin clave. Con el plan gratuito de Gemini puedes recibir errores 429 de cuota: el análisis de esa empresa usa reglas y queda anotado; reanalízala más tarde.

### PDF del informe

El informe se maqueta en HTML (siempre disponible) y se convierte a PDF con Chromium headless. Si no tienes Chrome/Chromium instalado:

```bash
npx playwright-core install chromium
```

o apunta `CHROMIUM_PATH` a un ejecutable existente. Si el PDF falla, el informe queda guardado y se reintenta desde la ficha. Los PDF se guardan en `data/reports/`.

### Comprobaciones

```bash
npm run typecheck && npm run lint && npm test
npm run discovery:live -- "clínicas dentales" "Salta, Argentina" 10   # prueba real de las fuentes
```

Si al abrir `npm run dev` una página se recarga sin parar tras actualizar el código, borra la caché con `rm -rf .next` y reinicia.
