import { describe, expect, it } from "vitest";

describe("Supabase credentials", () => {
  it("authenticates against the Supabase REST endpoint", async () => {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url).toMatch(/^https:\/\/[^/]+\.supabase\.co$/);
    expect(serviceRoleKey).toBeTruthy();

    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: serviceRoleKey as string,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  }, 20_000);
});
