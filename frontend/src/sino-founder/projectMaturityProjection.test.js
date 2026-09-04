import { describe, expect, it } from "vitest";
import { projectCurrentAction } from "./projectMaturityProjection.js";

describe("projectCurrentAction lifecycle precedence", () => {
  it("uses Execution Result action above stale maturity evaluation", () => {
    const action = projectCurrentAction({ stage: "project_planning", current_action: { title: "正在判断讨论成熟度" }, discovery: { discussion_maturity: { maturity_status: "evaluating" } }, project_lifecycle: { rank: 700, current_action: { action_id: "resume_validation_after_dependency", title: "等待外部依赖解除后恢复真实环境验证" } } });
    expect(action.action_id).toBe("resume_validation_after_dependency");
    expect(action.title).not.toBe("正在判断讨论成熟度");
  });

  it("keeps planning behavior when no later lifecycle evidence exists", () => {
    const action = projectCurrentAction({ stage: "project_planning", discovery: { discussion_maturity: { maturity_status: "continue_analysis", autonomous_next_analysis: "complete boundaries" } } });
    expect(action.action_id).toBe("continue_project_planning");
  });
});
