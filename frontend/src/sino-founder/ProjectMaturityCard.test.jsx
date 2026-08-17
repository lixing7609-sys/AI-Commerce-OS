// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionPackageCard, ImplementationPlanCard, ProjectMaturityCard } from "./ProjectMaturityCard.jsx";

describe("ProjectMaturityCard", () => {
  afterEach(cleanup);
  it("does not duplicate non-review maturity states above the conversation", () => {
    const { container } = render(<ProjectMaturityCard maturity={{ maturity_status: "founder_input_required", reason: "方向会改变边界", blocking_question: "是否允许跨 Project 学习？" }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders proposed outcomes and records review through one gate", () => {
    const review = vi.fn();
    render(<ProjectMaturityCard maturity={{ maturity_status: "ready_for_review", reason: "定义已成熟", review_status: "awaiting_founder_review", outcomes: [{ outcome_id: "outcome-1", outcome_type: "project_definition", title: "Project Definition", content: { positioning: "Foundation" } }] }} onReview={review} />);
    expect(screen.getByText("审核本轮成果")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Outcome Review" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认成果" }));
    expect(review).toHaveBeenCalledWith("confirm");
  });

  it("does not enable confirmation until the canonical reviewable Draft exists", () => {
    render(<ProjectMaturityCard maturity={{ maturity_status: "ready_for_review", reason: "定义已成熟", outcomes: [{ outcome_id: "outcome-1", outcome_type: "project_definition", title: "Project Definition", content: "ready" }] }} reviewable={false} onReview={vi.fn()} />);
    expect(screen.getByRole("button", { name: "确认成果" }).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("正在准备可审核草案");
  });

  it("shows a clearly enabled execution approval gate without executing", () => {
    const review = vi.fn();
    render(<ImplementationPlanCard plan={{ status: "ready_for_execution_review", execution_approval: "pending", implementation_goal: "Implement confirmed definition", scope: ["core"], out_of_scope: ["rollout"], work_items: [{ work_item_id: "work-1", title: "Core module" }], dependencies: ["cloud"], execution_order: ["work-1"], risk: ["compatibility"], validation_criteria: ["tests"], acceptance_criteria: ["definition covered"], affected_system_objects: ["Foundation"], execution_requirements: ["Founder approval"] }} onReview={review} />);
    const approve = screen.getByRole("button", { name: "批准实施" });
    expect(approve.disabled).toBe(false);
    expect(approve.classList.contains("is-primary")).toBe(true);
    fireEvent.click(approve);
    expect(review).toHaveBeenCalledWith("approve");
  });

  it("projects a non-executable package and its preflight result", () => {
    render(<ExecutionPackageCard pkg={{ package_id: "package-canonical", preflight_status: "ready", execution_status: "not_started", scope: ["approved"], work_items: [{ work_item_id: "work-1", title: "Core", dependencies: [], validation: ["test"] }], dependencies: [], execution_order: ["work-1"], risk_summary: ["medium"], validation_plan: { integration: ["integration"] }, acceptance_criteria: ["accepted"], rollback_plan: [{ area: "repository", strategy: "restore package changes" }], executor_requirements: { executor_provider: "Codex" }, preflight: { checks: [{ check: "source_integrity", status: "passed", detail: "matched" }] } }} />);
    expect(screen.getByText("执行准备完成")).toBeTruthy();
    expect(screen.getByText(/package-canonical/)).toBeTruthy();
    expect(screen.getByText("Ready for Execution")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /批准/ })).toBeNull();
  });
});
