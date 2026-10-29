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
| `APP_PASSWORD`, `APP_USERNAME` | Protección HTTP Basic de toda la app (obligatoria en Railway; en local, opcional) | Elígela tú |
| `PAGESPEED_API_KEY`, `OSM_CONTACT` | Opcionales (cuota de PageSpeed; User-Agent de OpenStreetMap) | |

Sin clave de IA el análisis funciona con reglas deterministas (se indica en la ficha), pero los mensajes de contacto requieren IA. OpenStreetMap funciona sin clave. Gemini usa `gemini-3.5-flash-lite` por defecto, con `gemini-3.8-flash` y los alias `gemini-flash-lite-latest` / `gemini-flash-latest` como respaldo (`GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`). Un limitador interno mantiene las peticiones por debajo de `GEMINI_RPM` (15/min por modelo, el límite del plan gratuito de Flash Lite); si Google responde 429, el trabajo espera el tiempo que indique (`Retry-After`) y reintenta, y solo cambia de modelo o cae a reglas deterministas (anotado en la ficha) cuando agota los reintentos o la cuota diaria. Cada análisis consume unas 2 peticiones (interpretación + oportunidades), así que 500 peticiones/día ≈ 250 empresas/día y 15/min ≈ 7 empresas/min.

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

## Desplegar en Railway

La app corre como **un único servicio con una sola réplica** (el runner de trabajos está dentro del proceso y SQLite no admite varias instancias escribiendo) y necesita un **volumen** para la base de datos y los PDF. El `Dockerfile` incluye Chromium para los PDF y `railway.json` define el build, el healthcheck (`/api/health`) y `numReplicas: 1`.

1. En [Railway](https://railway.com) → **New Project → Deploy from GitHub repo** → elige este repositorio. Detecta `railway.json` y construye con el `Dockerfile`.
2. En el servicio → **Settings → Volumes → Add Volume** con *mount path* `/data`. La imagen ya usa `DATABASE_URL=/data/prospect.db` y `REPORTS_DIR=/data/reports`; las migraciones se aplican solas al arrancar.
3. En **Variables** define (ver tabla de arriba):
   - `APP_PASSWORD` (**obligatoria**; `APP_USERNAME` opcional, por defecto `admin`). Toda la app pide usuario y contraseña (HTTP Basic); solo `/api/health` queda abierto para el healthcheck. Si falta, el servicio responde 503 en lugar de quedar expuesto.
   - `GEMINI_API_KEY` o `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `OSM_CONTACT` y las opcionales que uses.
4. **Settings → Networking → Generate Domain** y abre la URL: el navegador pedirá las credenciales.

No cambies el número de réplicas ni montes el volumen en otro servicio. Para probar la imagen en local: `docker build -t prospect . && docker run --rm -p 3000:3000 -e APP_PASSWORD=secreto -v prospect-data:/data prospect`.
