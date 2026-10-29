import { foldText } from "./normalize";

/** Filtro de etiquetas OSM, p. ej. ["amenity","dentist"]. Valor undefined = cualquier valor. */
export type OsmTag = [key: string, value?: string];

export interface NicheProfile {
  /** Etiquetas OSM que identifican este tipo de negocio (se unen con OR). */
  tags: OsmTag[];
  /** Categoría legible para cuando el elemento no la declara. */
  label: string;
  /** Patrón de nombre (Overpass regex) para incluir clínicas/consultorios genéricos que OSM no etiquetó con el nicho. */
  nameHint?: string;
}

interface NicheRule {
  /** Patrones (sobre el texto sin tildes) que activan la regla. */
  match: RegExp;
  profile: NicheProfile;
}

const rule = (match: RegExp, label: string, tags: OsmTag[], nameHint?: string): NicheRule => ({ match, profile: { tags, label, ...(nameHint ? { nameHint } : {}) } });

/**
 * Correspondencia entre nichos habituales (es/en) y etiquetas de OpenStreetMap.
 * El orden importa: la primera regla que coincide gana, así que lo más específico va antes.
 */
const RULES: NicheRule[] = [
  rule(/\b(odontolog|dentist|dental|dentales|ortodon)/, "Dentista", [["amenity", "dentist"], ["healthcare", "dentist"]], "dental|dentist|odont|ortodon"),
  rule(/\b(veterinari|vet clinic|animal hospital)/, "Veterinaria", [["amenity", "veterinary"]], "veterinari|vet\\b"),
  rule(/\b(farmacia|pharmac|drugstore)/, "Farmacia", [["amenity", "pharmacy"], ["healthcare", "pharmacy"]]),
  rule(/\b(psicolog|psycholog|psicoterap|therap)/, "Psicología / terapia", [["healthcare", "psychotherapist"], ["healthcare", "psychologist"], ["healthcare", "counselling"]]),
  rule(/\b(kinesiolog|fisioterap|physio)/, "Fisioterapia", [["healthcare", "physiotherapist"]]),
  rule(/\b(oculist|oftalmolog|optica|optic|optician)/, "Óptica / oftalmología", [["shop", "optician"], ["healthcare", "optometrist"]]),
  rule(/\b(laboratorio|laboratory|analisis clinicos)/, "Laboratorio", [["healthcare", "laboratory"]]),
  rule(/\b(hospital)/, "Hospital", [["amenity", "hospital"], ["healthcare", "hospital"]]),
  rule(/\b(clinica|clinic|sanatorio|medic|doctor|consultorio|salud)/, "Clínica / consultorio", [["amenity", "clinic"], ["healthcare", "clinic"], ["amenity", "doctors"], ["healthcare", "doctor"]]),
  rule(/\b(estetica|beauty|spa\b|centro de belleza)/, "Estética / belleza", [["shop", "beauty"], ["leisure", "spa"], ["amenity", "spa"]]),
  rule(/\b(peluquer|barber|hairdress|salon de belleza)/, "Peluquería", [["shop", "hairdresser"], ["shop", "barber"]]),
  rule(/\b(gimnasio|gym|fitness|crossfit|pilates)/, "Gimnasio", [["leisure", "fitness_centre"], ["leisure", "sports_centre"]]),
  rule(/\b(restaurant|restaurante|parrilla|pizzeri|rotiser)/, "Restaurante", [["amenity", "restaurant"]]),
  rule(/\b(cafe|cafeteri|coffee)/, "Cafetería", [["amenity", "cafe"]]),
  rule(/\b(bar\b|bares|pub\b|cerveceri)/, "Bar", [["amenity", "bar"], ["amenity", "pub"]]),
  rule(/\b(hotel|hostel|hospedaje|alojamiento|posada|cabana)/, "Alojamiento", [["tourism", "hotel"], ["tourism", "hostel"], ["tourism", "guest_house"], ["tourism", "motel"]]),
  rule(/\b(inmobiliari|real estate|bienes raices)/, "Inmobiliaria", [["office", "estate_agent"], ["shop", "estate_agent"]]),
  rule(/\b(abogad|estudios? juridic|lawyer|law firm|bufete)/, "Estudio jurídico", [["office", "lawyer"]]),
  rule(/\b(contador|contable|accountant|accounting)/, "Estudio contable", [["office", "accountant"]]),
  rule(/\b(arquitect|architect)/, "Arquitectura", [["office", "architect"]]),
  rule(/\b(seguro|insurance|aseguradora)/, "Seguros", [["office", "insurance"]]),
  rule(/\b(escuela|colegio|school|instituto|academia|academy|idiomas)/, "Educación", [["amenity", "school"], ["amenity", "language_school"], ["amenity", "college"]]),
  rule(/\b(jardin|guarderia|kindergarten|daycare)/, "Jardín / guardería", [["amenity", "kindergarten"], ["amenity", "childcare"]]),
  rule(/\b(taller mecanico|mecanic|auto repair|car repair|taller de autos)/, "Taller mecánico", [["shop", "car_repair"]]),
  rule(/\b(concesionari|car dealer|automotor|agencia de autos)/, "Concesionaria", [["shop", "car"]]),
  rule(/\b(lavadero|car wash)/, "Lavadero de autos", [["amenity", "car_wash"]]),
  rule(/\b(supermercado|supermarket|almacen)/, "Supermercado", [["shop", "supermarket"], ["shop", "convenience"]]),
  rule(/\b(panaderi|bakery|confiteri)/, "Panadería", [["shop", "bakery"], ["shop", "pastry"]]),
  rule(/\b(ferreteri|hardware)/, "Ferretería", [["shop", "hardware"], ["shop", "doityourself"]]),
  rule(/\b(libreri|bookstore)/, "Librería", [["shop", "books"], ["shop", "stationery"]]),
  rule(/\b(ropa|indumentaria|boutique|clothes|clothing)/, "Indumentaria", [["shop", "clothes"], ["shop", "boutique"]]),
  rule(/\b(florist|floreri)/, "Florería", [["shop", "florist"]]),
  rule(/\b(joyeri|jewel)/, "Joyería", [["shop", "jewelry"]]),
  rule(/\b(mueble|furniture)/, "Mueblería", [["shop", "furniture"]]),
  rule(/\b(electrodomestic|electronic|celular|computacion)/, "Electrónica", [["shop", "electronics"], ["shop", "mobile_phone"], ["shop", "computer"]]),
  rule(/\b(agencia de viaje|travel agency|turismo)/, "Agencia de viajes", [["shop", "travel_agency"], ["office", "travel_agent"]]),
  rule(/\b(escribania|notari)/, "Escribanía", [["office", "notary"]]),
  rule(/\b(fotograf|photograph)/, "Fotografía", [["shop", "photo"], ["craft", "photographer"]]),
  rule(/\b(constructora|construction|contratista)/, "Construcción", [["office", "construction_company"], ["craft", "builder"]]),
  rule(/\b(imprenta|printing|grafica)/, "Imprenta", [["shop", "copyshop"], ["craft", "printer"]]),
];

/** Palabras sin valor para buscar por nombre cuando el nicho no está mapeado. */
const GENERIC_WORDS = new Set([
  "de", "del", "la", "el", "los", "las", "en", "y", "para", "con", "centro", "centros", "empresa", "empresas",
  "negocio", "negocios", "servicio", "servicios", "the", "and", "of", "in",
]);

/** Quita el plural simple para que "clínicas" encuentre "clínica". */
function stem(word: string): string {
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

export interface ResolvedNiche {
  /** Perfil por etiquetas OSM (nicho conocido). */
  profile?: NicheProfile;
  /** Palabras clave para buscar por nombre cuando no hay perfil. */
  keywords: string[];
}

export function resolveNiche(niche: string): ResolvedNiche {
  const folded = foldText(niche);
  const known = RULES.find((r) => r.match.test(folded));
  const keywords = folded
    .split(" ")
    .filter((w) => w.length > 2 && !GENERIC_WORDS.has(w))
    .map(stem);
  return { profile: known?.profile, keywords };
}
