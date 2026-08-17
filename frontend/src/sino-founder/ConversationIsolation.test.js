import { describe, expect, it } from "vitest";
import { conversationResponseMatches } from "./ConversationWorkspace.jsx";

describe("Conversation projection isolation", () => {
  it("accepts only the active conversation response", () => {
    expect(conversationResponseMatches("conv-new", "conv-new", { conversation: { id: "conv-new" } })).toBe(true);
    expect(conversationResponseMatches("conv-old", "conv-new", { conversation: { id: "conv-old" } })).toBe(false);
    expect(conversationResponseMatches("conv-new", "conv-new", { conversation: { id: "conv-old" } })).toBe(false);
  });
});
