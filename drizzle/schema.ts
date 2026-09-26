import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const challenges = mysqlTable("challenges", {
  id: int("id").autoincrement().primaryKey(),
  citizenName: varchar("citizenName", { length: 180 }),
  name: varchar("name", { length: 220 }).notNull(),
  description: text("description").notNull(),
  phone: varchar("phone", { length: 24 }).notNull(),
  aadharLast4: varchar("aadharLast4", { length: 4 }).notNull(),
  email: varchar("email", { length: 320 }),
  location: varchar("location", { length: 220 }).notNull(),
  latitude: varchar("latitude", { length: 32 }),
  longitude: varchar("longitude", { length: 32 }),
  urgencyRequested: boolean("urgencyRequested").default(false).notNull(),
  aiUrgency: mysqlEnum("aiUrgency", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  category: varchar("category", { length: 80 }).default("Community infrastructure").notNull(),
  difficulty: mysqlEnum("difficulty", ["starter", "intermediate", "advanced"]).default("intermediate").notNull(),
  status: mysqlEnum("status", ["new", "under_review", "in_progress", "solution_proposed", "implemented"]).default("new").notNull(),
  assignedUniversity: varchar("assignedUniversity", { length: 180 }),
  solution: text("solution"),
  creatorOpenId: varchar("creatorOpenId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const challengeMedia = mysqlTable("challengeMedia", {
  id: int("id").autoincrement().primaryKey(),
  challengeId: int("challengeId").notNull(),
  url: text("url").notNull(),
  fileKey: text("fileKey").notNull(),
  fileName: varchar("fileName", { length: 220 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const projectUpdates = mysqlTable("projectUpdates", {
  id: int("id").autoincrement().primaryKey(),
  challengeId: int("challengeId").notNull(),
  authorRole: varchar("authorRole", { length: 40 }).notNull(),
  authorName: varchar("authorName", { length: 180 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const techEvents = mysqlTable("techEvents", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description").notNull(),
  date: varchar("date", { length: 40 }).notNull(),
  location: varchar("location", { length: 180 }).notNull(),
  university: varchar("university", { length: 180 }).notNull(),
  challengeId: int("challengeId"),
  sponsorshipTarget: int("sponsorshipTarget").default(0).notNull(),
  sponsorRaised: int("sponsorRaised").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const sponsorships = mysqlTable("sponsorships", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  industryName: varchar("industryName", { length: 180 }).notNull(),
  amount: int("amount").default(0).notNull(),
  contributionNote: text("contributionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Challenge = typeof challenges.$inferSelect;
export type TechEvent = typeof techEvents.$inferSelect;
