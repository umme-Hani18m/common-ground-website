import { describe, expect, it } from "vitest";
import pg from "pg";

const { Client } = pg;

describe("Supabase portal flow", () => {
  it("creates and retrieves a problem with related collaboration data", async () => {
    const client = new Client({
      connectionString: process.env.SUPABASE_DB_POOLER_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    });
    await client.connect();
    await client.query("begin");
    try {
      const problem = await client.query<{ id: string }>(
        `insert into problems (problem_name, description, phone, email, location, ai_urgency, category, difficulty)
         values ($1, $2, $3, $4, $5, 'medium', 'Community wellbeing', 'starter') returning id`,
        ["Integration test problem", "A temporary problem used to verify the Supabase portal flow end to end.", "9999999999", "test@example.com", "Test location"],
      );
      const id = problem.rows[0].id;

      await client.query("insert into solutions (challenge_id, problem_id, proposed_by, description, solution_text, status) values (gen_random_uuid(), $1, $2, $3, $3, 'proposed')", [id, "Integration test university", "A temporary solution for the integration test."]);
      await client.query("insert into comments (challenge_id, problem_id, user_id, body, comment) values (gen_random_uuid(), $1, $2, $3, $3)", [id, "integration-test-user", "A temporary comment for the integration test."]);
      await client.query("insert into votes (challenge_id, problem_id, user_id, value) values (gen_random_uuid(), $1, $2, 1)", [id, "integration-test-user"]);

      const retrieved = await client.query<{ problem_name: string; solution_text: string; body: string; vote_count: string }>(
        `select p.problem_name, s.solution_text, c.body,
                (select count(*) from votes v where v.problem_id = p.id and v.value = 1) as vote_count
         from problems p
         left join solutions s on s.problem_id = p.id
         left join comments c on c.problem_id = p.id
         where p.id = $1`,
        [id],
      );

      expect(retrieved.rows[0]).toMatchObject({
        problem_name: "Integration test problem",
        solution_text: "A temporary solution for the integration test.",
        body: "A temporary comment for the integration test.",
        vote_count: "1",
      });
    } finally {
      await client.query("rollback");
      await client.end();
    }
  }, 20_000);
});
