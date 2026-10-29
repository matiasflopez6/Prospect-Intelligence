# Descubrimiento de empresas

Entrada: nicho + ubicación + nº aproximado de empresas. Salida: empresas reales persistidas (`companies`) con la
procedencia de cada dato (`company_sources`), redes (`social_profiles`), reseñas (`reviews`) y estado CRM `new`.

```
createSearch() → job "discovery.run" → runDiscovery()
   proveedores (en paralelo) → mergeBusinesses() (dedupe + atribución por campo)
   → enrichFromWebsite() (email, redes, WhatsApp de la web propia) → persist() → job "company.analyze"
```

## Fuentes

| Proveedor | Clave | Qué aporta | Límites reales |
|---|---|---|---|
| `google-places` (Places API New, Text Search) | `GOOGLE_PLACES_API_KEY` | nombre, dirección, coords, teléfono, web, valoración, nº reseñas, horarios, hasta 5 reseñas, estado | Máx. 60 resultados por consulta; no informa si el dueño respondió una reseña (`ownerReplied` queda sin definir); factura por petición |
| `openstreetmap` (Nominatim + Overpass) | ninguna (`OSM_CONTACT` opcional) | nombre, categoría, dirección, coords y, **solo si alguien los cargó en el mapa**, teléfono, web, email, horarios, redes | Sin valoraciones ni reseñas; cobertura variable. Nichos sin etiqueta OSM conocida se buscan por nombre (menos precisión) |
| `website` (enriquecimiento) | ninguna | email, redes y WhatsApp enlazados en la web del negocio | Respeta robots.txt, bloquea redes privadas (SSRF), máx. 3 páginas, 1,5 MB |

Un proveedor sin configurar o que falla **no inventa datos**: queda en `searches.providerResults` (`skipped`/`failed`
+ motivo) y la búsqueda termina `partial` (o `failed` si ninguna fuente respondió).

## Decisiones

- **Deduplicación** (`merge.ts`): misma web propia (salvo sucursales lejanas), mismo teléfono + nombre parecido, o mismo
  nombre a < 250 m (sin coordenadas: misma calle). Reglas conservadoras: ante la duda no se fusionan.
  Contra la base de datos se reconoce por `googlePlaceId`, `osmId`, dominio + nombre o nombre + ciudad; repetir una
  búsqueda actualiza (rating, reseñas, horarios) y no duplica.
- **Rate limit y errores** (`lib/http.ts`): 1 req/s a Nominatim/Overpass (política OSM), reintentos con backoff ante
  429/5xx/red, `Retry-After`, timeouts, Overpass con instancia alternativa.
- **Nichos** (`lib/niche.ts`): tabla es/en → etiquetas OSM. Añadir un nicho = añadir una regla.

## Añadir una empresa por su web

`addCompanyByWebsite()` (formulario en *Nueva búsqueda*): lee la home del negocio, deduce el nombre (`og:site_name` o `<title>`, editable) y
guarda la empresa con procedencia `manual` + `website` y estado CRM `new`. Existe porque la cobertura de OpenStreetMap es muy desigual
(verificado: Salta capital tiene ~3 dentistas etiquetados) y no todas las ciudades tendrán Google Places configurado.

## Probar contra las fuentes reales

```bash
npm run discovery:live -- "clínicas dentales" "Salta, Argentina" 10            # todas las fuentes configuradas
npm run discovery:live -- "clínicas dentales" "Salta, Argentina" 10 --providers=openstreetmap --no-web
```

Imprime la tabla y guarda el JSON con procedencia en `data/discovery-live.json`. Los tests (`npm test`) usan
respuestas sintéticas con el formato real de cada API; **no** tocan la red.

## Añadir una fuente

Crear `providers/<id>.ts` que implemente `DiscoveryProvider` (ver `types.ts`), registrarla en `registry.ts` y
declarar sus variables en `src/lib/config/integrations.ts`.
