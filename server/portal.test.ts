import { describe, expect, it } from "vitest";
import { triageChallengeFallback } from "./routers";

describe("challenge triage fallback", () => {
  it("treats a citizen urgency signal as a high-priority review input", () => {
    expect(triageChallengeFallback("Overflowing drain", "Water and waste block the school road", true)).toEqual({
      urgency: "high",
      category: "Civic infrastructure",
      difficulty: "intermediate",
    });
  });

  it("recognises complex infrastructure work as advanced", () => {
    expect(triageChallengeFallback("Bridge flood network", "A treatment network is needed after repeated flooding", false).difficulty).toBe("advanced");
  });

  it("keeps a general wellbeing challenge at medium urgency by default", () => {
    expect(triageChallengeFallback("After-school reading circle", "Children need a safe place to read together", false)).toEqual({
      urgency: "medium",
      category: "Community wellbeing",
      difficulty: "intermediate",
    });
  });
});
