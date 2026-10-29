// Los tests no deben tocar servicios reales aunque el entorno tenga claves configuradas.
for (const key of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_PLACES_API_KEY", "PAGESPEED_API_KEY", "LLM_PROVIDER"]) delete process.env[key];
