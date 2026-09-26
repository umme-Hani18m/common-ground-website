import type { PoolClient } from "pg";
import type { TrpcContext } from "./_core/context";
import { supabaseQuery, supabaseDbConfigured, withSupabaseClient, toIso, toNumber } from "./supabase";
import { createSupabaseSignedUrl, uploadSupabaseAttachment } from "./supabase-storage";
import { extractAndVerifyGeotag } from "./photo-geotag";

export type PortalRole = "citizen" | "university" | "industry" | "administrator" | "municipality";

type EventRow = {
  id: string | number;
  title: string;
  description: string;
  date: string;
  location: string;
  university: string;
  challenge_id: string | number | null;
  sponsorship_target: string | number;
  sponsor_raised: string | number;
};

type AuthUser = NonNullable<TrpcContext["user"]>;

type ProblemRow = {
  id: string | number;
  citizen_name: string | null;
  problem_name: string;
  description: string;
  phone: string;
  aadhar_last4: string | null;
  email: string | null;
  location: string;
  latitude: string | number | null;
  longitude: string | number | null;
  urgency_requested: boolean;
  ai_urgency: "critical" | "high" | "medium" | "low";
  category: string;
  difficulty: "starter" | "intermediate" | "advanced";
  status: string;
  assigned_university: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  solution?: string | null;
  creator_open_id?: string | null;
  vote_count?: number;
  update_count?: number;
  geotag_verification_status?: "verified" | "unverified";
};

async function ensurePortalUser(client: PoolClient, user: AuthUser | null | undefined, role: PortalRole = "citizen") {
  if (!user) return null;
  const existing = await client.query<{ id: string; role: PortalRole }>("select id, role from users where auth_user_id = $1 limit 1", [user.openId]);
  if (existing.rows[0]) {
    await client.query("update users set name = $2, email = $3, updated_at = now() where id = $1", [existing.rows[0].id, user.name ?? null, user.email ?? null]);
    return { id: Number(existing.rows[0].id), role: existing.rows[0].role };
  }
  const inserted = await client.query<{ id: string }>(
    "insert into users (auth_user_id, name, email, role) values ($1, $2, $3, $4) returning id",
    [user.openId, user.name ?? null, user.email ?? null, role],
  );
  return { id: Number(inserted.rows[0].id), role };
}

function mapProblem(row: ProblemRow) {
  return {
    id: Number(row.id),
    name: row.problem_name,
    description: row.description,
    phone: row.phone,
    aadharLast4: row.aadhar_last4,
    email: row.email,
    location: row.location,
    latitude: row.latitude === null ? null : String(row.latitude),
    longitude: row.longitude === null ? null : String(row.longitude),
    urgencyRequested: row.urgency_requested,
    aiUrgency: row.ai_urgency,
    category: row.category,
    difficulty: row.difficulty,
    status: row.status,
    assignedUniversity: row.assigned_university,
    solution: row.solution ?? null,
    creatorOpenId: row.creator_open_id ?? null,
    voteCount: row.vote_count ?? 0,
    updateCount: row.update_count ?? 0,
    geotagVerificationStatus: row.geotag_verification_status ?? "unverified",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

const problemProjection = `
  p.*,
  u.auth_user_id as creator_open_id,
  latest.description as solution,
  coalesce(v.vote_count, 0)::int as vote_count,
  coalesce(upt.update_count, 0)::int as update_count,
  case when exists (select 1 from attachments ga where ga.problem_id = p.id and ga.attachment_kind = 'geotag_photo' and ga.geotag_verification_status = 'verified') then 'verified' else 'unverified' end as geotag_verification_status
`;

const problemJoins = `
  from problems p
  left join users u on u.id = p.submitter_user_id
  left join lateral (
    select s.description
    from solutions s
    where s.problem_id = p.id
    order by s.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*) as vote_count
    from votes v
    where v.problem_id = p.id and v.value = 1
  ) v on true
  left join lateral (
    select count(*) as update_count
    from project_updates pu
    where pu.problem_id = p.id
  ) upt on true
`;

export function supabaseEnabled() {
  return supabaseDbConfigured();
}

export async function listSupabaseProblems() {
  const result = await supabaseQuery<ProblemRow>(`select ${problemProjection} ${problemJoins} order by p.created_at desc`);
  return result?.rows.map(mapProblem) ?? [];
}

export async function getSupabaseProblem(id: number) {
  const result = await supabaseQuery<ProblemRow>(`select ${problemProjection} ${problemJoins} where p.id = $1 limit 1`, [id]);
  if (!result?.rows[0]) return undefined;
  const [attachments, updates, comments] = await Promise.all([
    supabaseQuery("select id, url, storage_key, attachment_kind, file_name, mime_type, latitude, longitude, created_at from attachments where problem_id = $1 and attachment_kind = 'geotag_photo' order by created_at desc", [id]),
    supabaseQuery("select id, author_role, author_name, body, status, created_at from project_updates where problem_id = $1 order by created_at desc", [id]),
    supabaseQuery("select id, body, created_at from comments where problem_id = $1 order by created_at desc", [id]),
  ]);
  return {
    ...mapProblem(result.rows[0]),
    media: (await Promise.all((attachments?.rows ?? []).map(async row => {
      try {
        const url = row.storage_key ? await createSupabaseSignedUrl(String(row.storage_key), 300) : String(row.url);
        return { url, fileName: row.file_name, mimeType: row.mime_type };
      } catch {
        return null;
      }
    }))).filter(Boolean),
    updates: updates?.rows.map(row => ({ body: row.body, authorName: row.author_name, status: row.status, createdAt: toIso(row.created_at) })) ?? [],
    comments: comments?.rows.map(row => ({ id: Number(row.id), body: row.body, createdAt: toIso(row.created_at) })) ?? [],
  };
}

export async function insertSupabaseProblem(input: {
  citizenName: string;
  name: string;
  description: string;
  phone: string;
  aadhar: string;
  email: string | null;
  location: string;
  latitude: string | null;
  longitude: string | null;
  urgencyRequested: boolean;
  aiUrgency: string;
  category: string;
  difficulty: string;
  user: AuthUser | null | undefined;
  images: Array<{ name: string; mimeType: string; bytes: Buffer }>;
  aadharFile?: { name: string; mimeType: string; bytes: Buffer };
}) {
  return withSupabaseClient(async client => {
    await client.query("begin");
    try {
      const portalUser = await ensurePortalUser(client, input.user, "citizen");
      const problem = await client.query<{ id: string }>(
        `insert into problems (submitter_user_id, citizen_name, problem_name, description, phone, aadhar_last4, email, location, latitude, longitude, urgency_requested, ai_urgency, category, difficulty)
         values ($1, $2, $3, $4, $5, $6, $7, $8, nullif($9, '')::numeric, nullif($10, '')::numeric, $11, $12, $13, $14) returning id`,
        [portalUser?.id ?? null, input.citizenName, input.name, input.description, input.phone, input.aadhar.slice(-4), input.email, input.location, input.latitude, input.longitude, input.urgencyRequested, input.aiUrgency, input.category, input.difficulty],
      );
      const id = Number(problem.rows[0].id);
      for (const image of input.images) {
        const geotag = await extractAndVerifyGeotag(image.bytes, input.latitude, input.longitude);
        const stored = await uploadSupabaseAttachment({ problemId: id, kind: "geotag_photo", fileName: image.name, mimeType: image.mimeType, bytes: image.bytes });
        await client.query(
          `insert into attachments (problem_id, uploaded_by_user_id, url, storage_key, attachment_kind, file_name, mime_type, latitude, longitude, exif_latitude, exif_longitude, exif_captured_at, geotag_distance_meters, geotag_verification_status)
           values ($1, $2, $3, $4, 'geotag_photo', $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [id, portalUser?.id ?? null, stored.path, stored.path, image.name, image.mimeType, input.latitude, input.longitude, geotag.latitude, geotag.longitude, geotag.capturedAt, geotag.distanceMeters, geotag.status],
        );
      }
      if (input.aadharFile) {
        const stored = await uploadSupabaseAttachment({ problemId: id, kind: "aadhar_card", fileName: input.aadharFile.name, mimeType: input.aadharFile.mimeType, bytes: input.aadharFile.bytes });
        await client.query(
          `insert into attachments (problem_id, uploaded_by_user_id, url, storage_key, attachment_kind, file_name, mime_type)
           values ($1, $2, $3, $4, 'aadhar_card', $5, $6)`,
          [id, portalUser?.id ?? null, stored.path, stored.path, input.aadharFile.name, input.aadharFile.mimeType],
        );
      }
      await client.query("commit");
      return id;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

export async function claimSupabaseProblem(id: number, university: string, user: AuthUser | null | undefined) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user, "university");
    const result = await client.query("update problems set status = 'in_progress', assigned_university = $2, updated_at = now() where id = $1", [id, university]);
    return { id: portalUser?.id ?? null, affected: result.rowCount ?? 0 };
  });
}

export async function addSupabaseProjectUpdate(input: { challengeId: number; authorRole: string; authorName: string; body: string; status: string }, user: AuthUser | null | undefined) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user, input.authorRole === "industry" ? "industry" : "university");
    const result = await client.query<{ id: string }>(
      `insert into project_updates (problem_id, author_user_id, author_role, author_name, body, status) values ($1, $2, $3, $4, $5, $6) returning id`,
      [input.challengeId, portalUser?.id ?? null, input.authorRole, input.authorName, input.body, input.status],
    );
    await client.query("update problems set status = $2, updated_at = now() where id = $1", [input.challengeId, input.status === "Solution proposed" ? "solution_proposed" : "in_progress"]);
    return Number(result.rows[0].id);
  });
}

export async function proposeSupabaseSolution(id: number, solution: string, user: AuthUser | null | undefined) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user, "university");
    const result = await client.query<{ id: string }>(
      `insert into solutions (challenge_id, problem_id, author_user_id, proposed_by, description, solution_text, status) values (gen_random_uuid(), $1, $2, $3, $4, $4, 'proposed') returning id`,
      [id, portalUser?.id ?? null, user?.name ?? "University team", solution],
    );
    await client.query("update problems set status = 'solution_proposed', updated_at = now() where id = $1", [id]);
    return result.rows[0]?.id ?? null;
  });
}

export async function deleteSupabaseProblem(id: number, user: AuthUser) {
  return withSupabaseClient(async client => {
    const owner = await client.query<{ auth_user_id: string }>(
      `select u.auth_user_id from problems p join users u on u.id = p.submitter_user_id where p.id = $1 limit 1`,
      [id],
    );
    if (owner.rows[0]?.auth_user_id !== user.openId) return false;
    await client.query("delete from problems where id = $1", [id]);
    return true;
  });
}

export async function listSupabaseEvents() {
  const result = await supabaseQuery<EventRow>(`select id, title, description, event_date as date, location, university, challenge_id, sponsorship_target, sponsor_raised from tech_events order by created_at desc`);
  return result?.rows.map(row => ({ ...row, id: Number(row.id), challengeId: row.challenge_id ? Number(row.challenge_id) : null, sponsorshipTarget: Number(row.sponsorship_target), sponsorRaised: Number(row.sponsor_raised) })) ?? [];
}

export async function insertSupabaseEvent(input: { title: string; description: string; date: string; location: string; university: string; challengeId: number | null; sponsorshipTarget: number }, user: AuthUser | null | undefined) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user, "university");
    const result = await client.query<{ id: string }>(
      `insert into tech_events (title, description, event_date, location, university, challenge_id, sponsorship_target, created_by_user_id) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [input.title, input.description, input.date, input.location, input.university, input.challengeId, input.sponsorshipTarget, portalUser?.id ?? null],
    );
    return Number(result.rows[0].id);
  });
}

export async function sponsorSupabaseEvent(input: { eventId: number; industryName: string; amount: number; contributionNote?: string }, user: AuthUser | null | undefined) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user, "industry");
    await client.query("insert into event_sponsorships (event_id, industry_name, industry_user_id, amount, contribution_note) values ($1, $2, $3, $4, $5)", [input.eventId, input.industryName, portalUser?.id ?? null, input.amount, input.contributionNote ?? null]);
    await client.query("update tech_events set sponsor_raised = sponsor_raised + $2 where id = $1", [input.eventId, input.amount]);
    return true;
  });
}

export async function addSupabaseComment(problemId: number, body: string, user: AuthUser) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user);
    const result = await client.query<{ id: string }>("insert into comments (challenge_id, problem_id, author_user_ref, body, comment, user_id) values (gen_random_uuid(), $1, $2, $3, $3, $4) returning id", [problemId, portalUser?.id ?? null, body, user.openId]);
    return Number(result.rows[0].id);
  });
}

export async function voteSupabaseProblem(problemId: number, value: 1 | -1, user: AuthUser) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user);
    await client.query("delete from votes where problem_id = $1 and (user_ref = $2 or user_id = $3)", [problemId, portalUser?.id ?? null, user.openId]);
    await client.query("insert into votes (challenge_id, problem_id, user_ref, user_id, value) values (gen_random_uuid(), $1, $2, $3, $4)", [problemId, portalUser?.id ?? null, user.openId, value]);
    return true;
  });
}

export async function setSupabaseRole(user: AuthUser, role: PortalRole) {
  return withSupabaseClient(async client => {
    const portalUser = await ensurePortalUser(client, user, role);
    await client.query("update users set role = $2, updated_at = now() where id = $1", [portalUser?.id, role]);
    return { success: true, role };
  });
}

export async function getSupabaseRole(user: AuthUser) {
  const result = await supabaseQuery<{ role: PortalRole }>("select role from users where auth_user_id = $1 limit 1", [user.openId]);
  return result?.rows[0]?.role ?? null;
}

export async function getSupabaseAttachmentPreview(id: number, user: AuthUser) {
  const result = await supabaseQuery<{ storage_key: string | null; attachment_kind: "geotag_photo" | "aadhar_card"; file_name: string; mime_type: string; auth_user_id: string | null }>(
    `select a.storage_key, a.attachment_kind, a.file_name, a.mime_type, owner.auth_user_id
     from attachments a
     left join problems p on p.id = a.problem_id
     left join users owner on owner.id = p.submitter_user_id
     where a.id = $1 limit 1`,
    [id],
  );
  const attachment = result?.rows[0];
  if (!attachment?.storage_key) return null;
  if (attachment.attachment_kind === "aadhar_card") {
    const role = await getSupabaseRole(user);
    const allowed = attachment.auth_user_id === user.openId || role === "administrator" || role === "municipality";
    if (!allowed) return null;
  }
  return {
    url: await createSupabaseSignedUrl(attachment.storage_key, 300),
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    expiresIn: 300,
  };
}
