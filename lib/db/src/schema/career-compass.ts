import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const candidateCategoryEnum = pgEnum("candidate_category", [
  "GENERAL",
  "OBC",
  "SC",
  "ST",
  "EWS",
  "OTHER",
]);

export const userDegreeEnum = pgEnum("user_degree", [
  "SECONDARY",
  "DIPLOMA",
  "BACHELOR",
  "MASTER",
  "DOCTORATE",
  "OTHER",
]);

export const opportunityDomainEnum = pgEnum("opportunity_domain", [
  "GOVERNMENT",
  "PRIVATE",
]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  age: integer("age").notNull(),
  category: candidateCategoryEnum("category").notNull(),
  degree: userDegreeEnum("degree").notNull(),
  branch: text("branch").notNull(),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  dailyHours: integer("daily_hours").notNull().default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const opportunitiesTable = pgTable("opportunities", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  domain: opportunityDomainEnum("domain").notNull(),
  minAge: integer("min_age").notNull(),
  maxAge: integer("max_age"),
  minDegree: userDegreeEnum("min_degree").notNull(),
  allowedBranches: jsonb("allowed_branches")
    .$type<string[]>()
    .notNull()
    .default([]),
  requiredSkills: jsonb("required_skills")
    .$type<string[]>()
    .notNull()
    .default([]),
  officialUrl: text("official_url").notNull(),
  lastUpdated: date("last_updated", { mode: "string" }).notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  updatedAt: true,
});
export const insertOpportunitySchema = createInsertSchema(opportunitiesTable);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type Opportunity = typeof opportunitiesTable.$inferSelect;
