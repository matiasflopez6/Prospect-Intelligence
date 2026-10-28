import { relations } from "drizzle-orm";
import { analyses, evidence, opportunities, opportunityEvidence, scores } from "./analysis";
import { crmEntries, crmNotes, members } from "./crm";
import { companies, companySources, reviews, searchCompanies, searches, socialProfiles } from "./discovery";
import { messages, reports } from "./outreach";
import { activityLog, jobs } from "./system";

export const searchesRelations = relations(searches, ({ many }) => ({
  searchCompanies: many(searchCompanies),
  jobs: many(jobs),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  crm: one(crmEntries, { fields: [companies.id], references: [crmEntries.companyId] }),
  searchCompanies: many(searchCompanies),
  sources: many(companySources),
  socials: many(socialProfiles),
  reviews: many(reviews),
  analyses: many(analyses),
  evidence: many(evidence),
  opportunities: many(opportunities),
  scores: many(scores),
  messages: many(messages),
  reports: many(reports),
  notes: many(crmNotes),
  activity: many(activityLog),
}));

export const searchCompaniesRelations = relations(searchCompanies, ({ one }) => ({
  search: one(searches, { fields: [searchCompanies.searchId], references: [searches.id] }),
  company: one(companies, { fields: [searchCompanies.companyId], references: [companies.id] }),
}));

export const companySourcesRelations = relations(companySources, ({ one }) => ({
  company: one(companies, { fields: [companySources.companyId], references: [companies.id] }),
}));
export const socialProfilesRelations = relations(socialProfiles, ({ one }) => ({
  company: one(companies, { fields: [socialProfiles.companyId], references: [companies.id] }),
}));
export const reviewsRelations = relations(reviews, ({ one }) => ({
  company: one(companies, { fields: [reviews.companyId], references: [companies.id] }),
}));

export const analysesRelations = relations(analyses, ({ one, many }) => ({
  company: one(companies, { fields: [analyses.companyId], references: [companies.id] }),
  evidence: many(evidence),
  opportunities: many(opportunities),
}));
export const evidenceRelations = relations(evidence, ({ one, many }) => ({
  company: one(companies, { fields: [evidence.companyId], references: [companies.id] }),
  analysis: one(analyses, { fields: [evidence.analysisId], references: [analyses.id] }),
  opportunityLinks: many(opportunityEvidence),
}));
export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  company: one(companies, { fields: [opportunities.companyId], references: [companies.id] }),
  analysis: one(analyses, { fields: [opportunities.analysisId], references: [analyses.id] }),
  evidenceLinks: many(opportunityEvidence),
}));
export const opportunityEvidenceRelations = relations(opportunityEvidence, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [opportunityEvidence.opportunityId],
    references: [opportunities.id],
  }),
  evidence: one(evidence, { fields: [opportunityEvidence.evidenceId], references: [evidence.id] }),
}));
export const scoresRelations = relations(scores, ({ one }) => ({
  company: one(companies, { fields: [scores.companyId], references: [companies.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  company: one(companies, { fields: [messages.companyId], references: [companies.id] }),
  opportunity: one(opportunities, { fields: [messages.opportunityId], references: [opportunities.id] }),
}));
export const reportsRelations = relations(reports, ({ one }) => ({
  company: one(companies, { fields: [reports.companyId], references: [companies.id] }),
}));

export const crmEntriesRelations = relations(crmEntries, ({ one }) => ({
  company: one(companies, { fields: [crmEntries.companyId], references: [companies.id] }),
  owner: one(members, { fields: [crmEntries.ownerId], references: [members.id] }),
}));
export const crmNotesRelations = relations(crmNotes, ({ one }) => ({
  company: one(companies, { fields: [crmNotes.companyId], references: [companies.id] }),
  author: one(members, { fields: [crmNotes.authorId], references: [members.id] }),
}));
export const activityLogRelations = relations(activityLog, ({ one }) => ({
  company: one(companies, { fields: [activityLog.companyId], references: [companies.id] }),
}));
export const jobsRelations = relations(jobs, ({ one }) => ({
  search: one(searches, { fields: [jobs.searchId], references: [searches.id] }),
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
}));
