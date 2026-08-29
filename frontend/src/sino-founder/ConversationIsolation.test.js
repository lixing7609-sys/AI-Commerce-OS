import { describe, expect, it } from "vitest";
import { conversationFallbackAfterDelete, conversationResponseMatches, conversationRestoreDisposition } from "./ConversationWorkspace.jsx";

describe("Conversation projection isolation", () => {
  it("accepts only the active conversation response", () => {
    expect(conversationResponseMatches("conv-new", "conv-new", { conversation: { id: "conv-new" } })).toBe(true);
    expect(conversationResponseMatches("conv-old", "conv-new", { conversation: { id: "conv-old" } })).toBe(false);
    expect(conversationResponseMatches("conv-new", "conv-new", { conversation: { id: "conv-old" } })).toBe(false);
    expect(conversationResponseMatches("conv-new", "conv-new", {})).toBe(false);
  });

  it("distinguishes confirmed deletion from retryable transport failure", () => {
    expect(conversationRestoreDisposition({ status: 404 })).toBe("NOT_FOUND");
    expect(conversationRestoreDisposition({ code: "conversation_not_found" })).toBe("NOT_FOUND");
    expect(conversationRestoreDisposition({ status: 500 })).toBe("RESTORE_FAILED");
    expect(conversationRestoreDisposition(new TypeError("Failed to fetch"))).toBe("RESTORE_FAILED");
  });

  it("selects a deterministic id-bound neighbor after deleting the active row", () => {
    const same = "2026-08-18T10:27:00.000Z";
    const items = ["a", "c", "b"].map((id) => ({ id: `conv-${id}`, updatedAt: same, createdAt: same }));
    expect(conversationFallbackAfterDelete(items, "conv-b")?.id).toBe("conv-a");
    expect(conversationFallbackAfterDelete(items, "conv-c")?.id).toBe("conv-b");
    expect(conversationFallbackAfterDelete([{ id: "conv-a" }], "conv-a")).toBeNull();
  });
});
