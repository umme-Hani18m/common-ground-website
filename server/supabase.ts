import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ENV } from "./_core/env";

let pool: Pool | null = null;

export function supabaseDbConfigured() {
  return Boolean(ENV.supabaseDbPoolerUrl);
}

export function getSupabasePool() {
  if (!ENV.supabaseDbPoolerUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: ENV.supabaseDbPoolerUrl,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function withSupabaseClient<T>(work: (client: PoolClient) => Promise<T>) {
  const currentPool = getSupabasePool();
  if (!currentPool) return null;
  const client = await currentPool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function supabaseQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  const currentPool = getSupabasePool();
  if (!currentPool) return null;
  return currentPool.query<T>(text, values);
}

export function toNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}
