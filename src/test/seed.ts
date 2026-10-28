import { tables, type Db } from "@/lib/db";

/** Fixture SOLO para tests: una empresa con análisis, evidencias, oportunidades y puntuación. Nunca se usa en la app. */
export function seedAnalyzedCompany(db: Db, over: { opportunities?: number } = {}) {
  const company = db
    .insert(tables.companies)
    .values({
      name: "Clínica Fixture Uno",
      normalizedName: "clinica fixture uno",
      niche: "clínicas dentales",
      category: "Dentista",
      address: "Calle Falsa 123",
      city: "Ciudad Fixture",
      country: "Argentina",
      phone: "+00 111 1111",
      website: "https://fixture-uno.example",
      rating: 4.6,
      reviewCount: 120,
      analysisStatus: "done",
    })
    .returning()
    .get();
  const analysis = db
    .insert(tables.analyses)
    .values({
      companyId: company.id,
      status: "done",
      summary: "La web presenta bien los tratamientos pero no ofrece un modo rápido de reservar ni un canal de mensajería.",
      quality: { claridad: 78, movil: 64 },
      findings: [
        { key: "no_booking", title: "Sin reserva online", explanation: "Para pedir turno hay que llamar por teléfono en horario de oficina.", severity: 4, evidence: [] },
        { key: "good_copy", title: "Propuesta clara", explanation: "Los tratamientos se explican con claridad.", severity: 1, positive: true, evidence: [] },
      ],
      finishedAt: new Date(),
    })
    .returning()
    .get();
  const ev = (label: string, detail: string, kind: "website" | "absence" | "listing" = "website") =>
    db.insert(tables.evidence).values({ companyId: company.id, analysisId: analysis.id, kind, label, detail, sourceUrl: "https://fixture-uno.example/contacto" }).returning().get();
  const e1 = ev("Sin sistema de reservas", "Se revisó la web y no hay agenda online ni formulario de turno.", "absence");
  const e2 = ev("Teléfono como único canal", "El único modo de contacto visible es el teléfono.");
  const e3 = ev("Valoración alta", "4,6 sobre 5 con 120 reseñas en la ficha pública.", "listing");

  const opps = [
    { type: "no_booking", title: "Sin sistema de reserva", serviceKey: "online_booking", impact: "high", severity: 4, confidence: 0.85 },
    { type: "no_whatsapp", title: "Sin WhatsApp visible", serviceKey: "whatsapp_automation", impact: "medium", severity: 3, confidence: 0.7 },
  ] as const;
  const created = opps.slice(0, over.opportunities ?? 2).map((o, i) => {
    const row = db
      .insert(tables.opportunities)
      .values({
        companyId: company.id,
        analysisId: analysis.id,
        ...o,
        problem: `Problema: ${o.title}`,
        consequence: "Se pierden consultas fuera del horario de atención.",
        proposedSolution: "Implantar una solución automática de atención.",
        impactNote: i === 0 ? "Más turnos captados fuera de horario." : null,
      })
      .returning()
      .get();
    db.insert(tables.opportunityEvidence).values({ opportunityId: row.id, evidenceId: i === 0 ? e1.id : e2.id }).run();
    return row;
  });
  db.insert(tables.scores).values({ companyId: company.id, analysisId: analysis.id, total: 72, tier: "high", confidence: 0.8, components: [], methodVersion: "test" }).run();
  return { company, analysis, evidence: [e1, e2, e3], opportunities: created };
}
