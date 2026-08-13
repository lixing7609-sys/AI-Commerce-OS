import { describe, expect, it } from "vitest";
import { objectTypeLabel, relationLabel, statusLabel, WORKSPACE_LABELS } from "./founderTerminology.js";

describe("Founder terminology presenter", () => {
  it("keeps stable enums internal and presents Founder-readable labels", () => {
    expect(objectTypeLabel("skill")).toBe("Skill（技能）");
    expect(statusLabel("approved")).toBe("已批准");
    expect(statusLabel("draft", { execution: true })).toBe("待开发");
    expect(relationLabel("dependency")).toBe("依赖");
    expect(WORKSPACE_LABELS.execution).toEqual({ title: "执行流程", subtitle: "Execution View" });
  });
});
