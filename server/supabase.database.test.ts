import { describe, expect, it } from "vitest";
import pg from "pg";

const { Client } = pg;

describe("Supabase PostgreSQL connection", () => {
  it("authenticates with the configured pooler connection string", async () => {
    const connectionString = process.env.SUPABASE_DB_POOLER_URL;
    expect(connectionString).toMatch(/^postgresql:\/\/postgres\.[^:]+:.+@aws-0-[^:]+\.pooler\.supabase\.com:\d+\/postgres$/);

    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    });

    await client.connect();
    try {
      const result = await client.query<{ ok: number }>("select 1 as ok");
      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await client.end();
    }
  }, 20_000);

  it("has the requested portal tables", async () => {
    const client = new Client({
      connectionString: process.env.SUPABASE_DB_POOLER_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    });
    await client.connect();
    try {
      const result = await client.query<{ table_name: string }>(
        `select table_name from information_schema.tables
         where table_schema = 'public'
           and table_name = any($1::text[])
         order by table_name`,
        [["users", "problems", "solutions", "collaborations", "comments", "votes", "organizations", "attachments"]],
      );
      expect(result.rows.map(row => row.table_name)).toEqual([
        "attachments",
        "collaborations",
        "comments",
        "organizations",
        "problems",
        "solutions",
        "users",
        "votes",
      ]);
    } finally {
      await client.end();
    }
  }, 20_000);
});
