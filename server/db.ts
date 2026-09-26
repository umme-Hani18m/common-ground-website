import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  challenges,
  challengeMedia,
  InsertUser,
  projectUpdates,
  sponsorships,
  techEvents,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listChallenges() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(challenges).orderBy(desc(challenges.createdAt));
}

export async function getChallenge(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const challenge = await db.select().from(challenges).where(eq(challenges.id, id)).limit(1);
  const media = await db.select().from(challengeMedia).where(eq(challengeMedia.challengeId, id));
  const updates = await db.select().from(projectUpdates).where(eq(projectUpdates.challengeId, id)).orderBy(desc(projectUpdates.createdAt));
  return challenge[0] ? { ...challenge[0], media, updates } : undefined;
}

export async function insertChallenge(values: typeof challenges.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(challenges).values(values);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function insertChallengeMedia(values: Array<typeof challengeMedia.$inferInsert>) {
  const db = await getDb();
  if (!db || values.length === 0) return;
  await db.insert(challengeMedia).values(values);
}

export async function claimChallenge(id: number, assignedUniversity: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(challenges).set({ status: "in_progress", assignedUniversity, updatedAt: new Date() }).where(eq(challenges.id, id));
}

export async function addProjectUpdate(values: typeof projectUpdates.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(projectUpdates).values(values);
  await db.update(challenges).set({ status: values.status === "Solution proposed" ? "solution_proposed" : "in_progress", updatedAt: new Date() }).where(eq(challenges.id, values.challengeId));
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function proposeSolution(id: number, solution: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(challenges).set({ solution, status: "solution_proposed", updatedAt: new Date() }).where(eq(challenges.id, id));
}

export async function deleteChallenge(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(challengeMedia).where(eq(challengeMedia.challengeId, id));
  await db.delete(projectUpdates).where(eq(projectUpdates.challengeId, id));
  await db.delete(challenges).where(eq(challenges.id, id));
}

export async function listEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(techEvents).orderBy(desc(techEvents.createdAt));
}

export async function insertEvent(values: typeof techEvents.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(techEvents).values(values);
  return Number((result as any)[0]?.insertId ?? 0);
}

export async function sponsorEvent(values: typeof sponsorships.$inferInsert) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(sponsorships).values(values);
  const event = await db.select().from(techEvents).where(eq(techEvents.id, values.eventId)).limit(1);
  if (event[0]) {
    await db.update(techEvents).set({ sponsorRaised: event[0].sponsorRaised + (values.amount ?? 0) }).where(eq(techEvents.id, values.eventId));
  }
  return Number((result as any)[0]?.insertId ?? 0);
}
