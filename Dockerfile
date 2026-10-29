# syntax=docker/dockerfile:1
# Imagen de producción para Railway (y cualquier host Docker). Una sola instancia: el runner de
# trabajos corre dentro del proceso web. Estado persistente (SQLite + PDF) en el volumen /data.

ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Compilador por si better-sqlite3 no encuentra binario precompilado y debe compilarse.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
# Chromium del sistema para el PDF del informe (playwright-core no descarga navegador).
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHROMIUM_PATH=/usr/bin/chromium \
    DATABASE_URL=/data/prospect.db \
    REPORTS_DIR=/data/reports
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/next.config.ts ./next.config.ts
# /data lo monta un volumen de Railway (Settings → Volumes); no se declara VOLUME porque Railway lo rechaza.
RUN mkdir -p /data/reports
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null || exit 1
# Railway inyecta PORT. Las migraciones se aplican al arrancar (src/instrumentation.ts abre la BD).
CMD ["sh", "-c", "exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
