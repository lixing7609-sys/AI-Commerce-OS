import { describe, expect, it } from "vitest";
import { founderConversationTitle } from "./founderConversationTitle.js";

describe("Founder conversation title", () => {
  it("replaces Brain event labels with a business goal", () => {
    expect(founderConversationTitle("Goal Confirmation Auto 真实验收", "AI 短剧生产系统。" )).toBe("AI 短剧生产系统");
    expect(founderConversationTitle("Intent Runtime", "广告投放 Agent")).toBe("广告投放 Agent");
  });

  it("keeps an existing business title", () => {
    expect(founderConversationTitle("Studio AI", "其他目标")).toBe("Studio AI");
  });
});
