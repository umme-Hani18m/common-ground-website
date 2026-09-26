import { describe, expect, it } from "vitest";
import { isChallengeOwner } from "./routers";

describe("challenge deletion authorization", () => {
  it("allows only the original submitter", () => {
    expect(isChallengeOwner("citizen-123", "citizen-123")).toBe(true);
    expect(isChallengeOwner("citizen-123", "citizen-456")).toBe(false);
  });

  it("does not allow deletion when a challenge has no creator", () => {
    expect(isChallengeOwner(null, "citizen-123")).toBe(false);
    expect(isChallengeOwner(undefined, "citizen-123")).toBe(false);
  });
});
