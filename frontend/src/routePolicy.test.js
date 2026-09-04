import { describe, expect, it } from "vitest";
import { isFounderAIRoute } from "./routePolicy.js";

describe("Founder AI V2 route ownership", () => {
  it("makes the product root and Founder paths Conversation-first", () => {
    expect(isFounderAIRoute("/")).toBe(true);
    expect(isFounderAIRoute("/founder/sino")).toBe(true);
    expect(isFounderAIRoute("/founder/sino/conversation")).toBe(true);
  });
  it("keeps the old dashboard behind an explicit legacy route", () => {
    expect(isFounderAIRoute("/legacy")).toBe(false);
    expect(isFounderAIRoute("/legacy/dashboard")).toBe(false);
  });
  it("keeps standalone product editions outside the Founder shell", () => {
    expect(isFounderAIRoute("/studio")).toBe(false);
    expect(isFounderAIRoute("/studio/")).toBe(false);
    expect(isFounderAIRoute("/operator")).toBe(false);
    expect(isFounderAIRoute("/cloud")).toBe(false);
  });
});
