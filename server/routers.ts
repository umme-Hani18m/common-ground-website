import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addProjectUpdate,
  claimChallenge,
  deleteChallenge,
  getChallenge,
  insertChallenge,
  insertChallengeMedia,
  insertEvent,
  listChallenges,
  listEvents,
  proposeSolution,
  sponsorEvent,
} from "./db";
import {
  addSupabaseComment,
  addSupabaseProjectUpdate,
  getSupabaseAttachmentPreview,
  claimSupabaseProblem,
  deleteSupabaseProblem,
  getSupabaseProblem,
  getSupabaseRole,
  insertSupabaseEvent,
  insertSupabaseProblem,
  listSupabaseEvents,
  listSupabaseProblems,
  proposeSupabaseSolution,
  setSupabaseRole,
  sponsorSupabaseEvent,
  supabaseEnabled,
  voteSupabaseProblem,
} from "./supabase-portal";
import type { PortalRole } from "./supabase-portal";

const imageInput = z.object({
  name: z.string(),
  mimeType: z.string(),
  dataUrl: z.string().max(5_000_000),
});

const attachmentInput = z.object({
  name: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(120),
  dataUrl: z.string().max(10_000_000),
});

const portalRoleInput = z.enum(["citizen", "university", "industry", "administrator", "municipality"]);

export function isChallengeOwner(challengeOwnerOpenId: string | null | undefined, currentOpenId: string) {
  return Boolean(challengeOwnerOpenId && challengeOwnerOpenId === currentOpenId);
}

export function triageChallengeFallback(name: string, description: string, requested: boolean) {
  return {
    urgency: requested ? "high" : "medium",
    category: /water|drain|road|bridge|street|waste/i.test(`${name} ${description}`) ? "Civic infrastructure" : "Community wellbeing",
    difficulty: /bridge|flood|treatment|network/i.test(`${name} ${description}`) ? "advanced" : "intermediate",
  } as const;
}

async function triageChallenge(name: string, description: string, requested: boolean) {
  const fallback = triageChallengeFallback(name, description, requested);
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a careful civic innovation triage assistant. Return only the requested JSON. Treat a citizen's urgency checkbox as a signal, not proof. Never infer sensitive personal data." },
        { role: "user", content: `Classify this civic challenge. Name: ${name}. Description: ${description}. Citizen marked urgent: ${requested ? "yes" : "no"}.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "challenge_triage",
          strict: true,
          schema: {
            type: "object",
            properties: {
              urgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
              category: { type: "string" },
              difficulty: { type: "string", enum: ["starter", "intermediate", "advanced"] },
            },
            required: ["urgency", "category", "difficulty"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : null;
    if (parsed?.urgency && parsed?.category && parsed?.difficulty) return parsed;
  } catch (error) {
    console.warn("[AI triage] fallback used", error);
  }
  return fallback;
}

async function requirePortalRole(user: NonNullable<Parameters<typeof getSupabaseRole>[0]>, allowed: PortalRole[]) {
  if (!supabaseEnabled()) return;
  const role = await getSupabaseRole(user);
  if (!role || !allowed.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `This action requires one of these roles: ${allowed.join(", ")}.` });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    portalRole: publicProcedure.query(async ({ ctx }) => ctx.user && supabaseEnabled() ? getSupabaseRole(ctx.user) : null),
    setPortalRole: protectedProcedure.input(z.object({ role: portalRoleInput })).mutation(({ input, ctx }) => setSupabaseRole(ctx.user, input.role)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  challenges: router({
    list: publicProcedure.query(async () => supabaseEnabled() ? listSupabaseProblems() : listChallenges()),
    detail: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => supabaseEnabled() ? getSupabaseProblem(input.id) : getChallenge(input.id)),
    create: publicProcedure.input(z.object({
      citizenName: z.string().min(2),
      name: z.string().min(3),
      description: z.string().min(20),
      phone: z.string().min(8),
      aadhar: z.string().min(12).max(16),
      email: z.string().email().optional().or(z.literal("")),
      location: z.string().min(2),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      urgencyRequested: z.boolean(),
      otpVerified: z.boolean(),
      images: z.array(imageInput).max(5),
      aadharFile: attachmentInput.optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!input.otpVerified) throw new TRPCError({ code: "BAD_REQUEST", message: "Phone verification is required." });
      const triage = await triageChallenge(input.name, input.description, input.urgencyRequested);
      if (supabaseEnabled()) {
        const toBuffer = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1] ?? dataUrl, "base64");
        const images = input.images.map(image => ({ name: image.name, mimeType: image.mimeType, bytes: toBuffer(image.dataUrl) }));
        const aadharFile = input.aadharFile ? { name: input.aadharFile.name, mimeType: input.aadharFile.mimeType, bytes: toBuffer(input.aadharFile.dataUrl) } : undefined;
        const id = await insertSupabaseProblem({ ...input, email: input.email || null, latitude: input.latitude || null, longitude: input.longitude || null, aiUrgency: triage.urgency, category: triage.category, difficulty: triage.difficulty, user: ctx.user, images, aadharFile });
        return { id, ...triage, reference: id ? `CG-${String(id).padStart(4, "0")}` : "CG-DEMO" };
      }
      const challengeId = await insertChallenge({
        citizenName: input.citizenName,
        name: input.name,
        description: input.description,
        phone: input.phone,
        aadharLast4: input.aadhar.slice(-4),
        email: input.email || null,
        location: input.location,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        urgencyRequested: input.urgencyRequested,
        aiUrgency: triage.urgency,
        category: triage.category,
        difficulty: triage.difficulty,
        status: "new",
        creatorOpenId: ctx.user?.openId ?? null,
      });
      if (challengeId && input.images.length) {
        const media = [];
        for (const image of input.images) {
          const [meta, base64] = image.dataUrl.split(",");
          const buffer = Buffer.from(base64 || meta, "base64");
          const stored = await storagePut(`challenges/${challengeId}/${Date.now()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`, buffer, image.mimeType);
          media.push({ challengeId, url: stored.url, fileKey: stored.key, fileName: image.name, mimeType: image.mimeType });
        }
        await insertChallengeMedia(media);
      }
      return { id: challengeId, ...triage, reference: challengeId ? `CG-${String(challengeId).padStart(4, "0")}` : "CG-DEMO" };
    }),
    claim: protectedProcedure.input(z.object({ id: z.number(), university: z.string().min(2) })).mutation(async ({ input, ctx }) => {
      await requirePortalRole(ctx.user, ["university", "administrator"]);
      if (supabaseEnabled()) await claimSupabaseProblem(input.id, input.university, ctx.user);
      else await claimChallenge(input.id, input.university);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      challengeId: z.number(),
      authorRole: z.string(),
      authorName: z.string(),
      body: z.string().min(5),
      status: z.string(),
    })).mutation(async ({ input, ctx }) => {
      await requirePortalRole(ctx.user, ["university", "industry", "administrator", "municipality"]);
      const id = supabaseEnabled() ? await addSupabaseProjectUpdate(input, ctx.user) : await addProjectUpdate(input);
      return { success: true, id };
    }),
    solution: protectedProcedure.input(z.object({ id: z.number(), solution: z.string().min(20) })).mutation(async ({ input, ctx }) => {
      await requirePortalRole(ctx.user, ["university", "administrator"]);
      if (supabaseEnabled()) await proposeSupabaseSolution(input.id, input.solution, ctx.user);
      else await proposeSolution(input.id, input.solution);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      if (supabaseEnabled()) {
        const deleted = await deleteSupabaseProblem(input.id, ctx.user);
        if (!deleted) throw new TRPCError({ code: "FORBIDDEN", message: "Only the original submitter can delete this challenge." });
      } else {
        const challenge = await getChallenge(input.id);
        if (!challenge || !isChallengeOwner(challenge.creatorOpenId, ctx.user.openId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the original submitter can delete this challenge." });
        }
        await deleteChallenge(input.id);
      }
      return { success: true } as const;
    }),
  }),
  comments: router({
    list: publicProcedure.input(z.object({ problemId: z.number() })).query(async ({ input }) => {
      if (!supabaseEnabled()) return [];
      const problem = await getSupabaseProblem(input.problemId);
      return problem?.comments ?? [];
    }),
    create: protectedProcedure.input(z.object({ problemId: z.number(), body: z.string().min(2) })).mutation(async ({ input, ctx }) => ({ success: true, id: await addSupabaseComment(input.problemId, input.body, ctx.user) })),
  }),
  attachments: router({
    preview: protectedProcedure.input(z.object({ id: z.number() })).query(({ input, ctx }) => getSupabaseAttachmentPreview(input.id, ctx.user)),
  }),
  votes: router({
    cast: protectedProcedure.input(z.object({ problemId: z.number(), value: z.union([z.literal(-1), z.literal(1)]) })).mutation(async ({ input, ctx }) => ({ success: true, id: await voteSupabaseProblem(input.problemId, input.value, ctx.user) })),
  }),
  events: router({
    list: publicProcedure.query(async () => supabaseEnabled() ? listSupabaseEvents() : listEvents()),
    create: protectedProcedure.input(z.object({
      title: z.string().min(4),
      description: z.string().min(10),
      date: z.string().min(4),
      location: z.string().min(2),
      university: z.string().min(2),
      challengeId: z.number().optional(),
      sponsorshipTarget: z.number().min(0),
    })).mutation(async ({ input, ctx }) => {
      await requirePortalRole(ctx.user, ["university", "administrator"]);
      const id = supabaseEnabled() ? await insertSupabaseEvent({ ...input, challengeId: input.challengeId ?? null }, ctx.user) : await insertEvent({ ...input, challengeId: input.challengeId ?? null, sponsorRaised: 0 });
      return { success: true, id };
    }),
    sponsor: protectedProcedure.input(z.object({
      eventId: z.number(),
      industryName: z.string().min(2),
      amount: z.number().min(0),
      contributionNote: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      await requirePortalRole(ctx.user, ["industry", "administrator"]);
      const id = supabaseEnabled() ? await sponsorSupabaseEvent(input, ctx.user) : await sponsorEvent(input);
      return { success: true, id };
    }),
  }),
});

export type AppRouter = typeof appRouter;
