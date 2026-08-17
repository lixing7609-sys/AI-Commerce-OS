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

  it("projects the runtime environment Founder gate and Sino recommendation", () => {
    const open = vi.fn(); const proposal = { proposal_id: "proposal-1", status: "ready_for_review" };
    render(<ExecutionPackageCard onReviewFounderGate={open} pkg={{ package_id: "package-infra", preflight_status: "founder_gate_required", execution_status: "not_started", work_items: [{ work_item_id: "work-1", title: "Provision external runtime" }], founder_gate_proposal: proposal, preflight: { checks: [{ check: "runtime_environment_binding", status: "founder_gate_required", detail: "Runtime Environment Binding Required" }] }, runtime_binding: { requires_runtime_binding: true, binding_status: "founder_review_required", provider: null, target_environment: null, resource_bindings: [{ logical_dependency: "object_store", concrete_target: null, status: "unresolved" }], recommendation: { summary: "Use an isolated non-production environment", existing_infrastructure: "No approved binding", required_new_infrastructure: ["object_store"], new_credential: "Unknown", new_cost: "Unknown", production_impact: "Unknown", external_side_effect: "Creates external resources", reason: "Runtime authorization is separate from plan approval" } } }} />);
    expect(screen.getByText("Runtime Environment 尚未绑定")).toBeTruthy();
    expect(screen.getByText("Sino Runtime Binding Recommendation")).toBeTruthy();
    expect(screen.getByText("需要 Founder 审核运行环境方案")).toBeTruthy();
    expect(screen.queryByText("Ready for Execution")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "审核运行环境方案" }));
    expect(open).toHaveBeenCalledWith(proposal);
  });

  it("projects an autonomous working tree resolution without exposing files by default", () => {
    render(<ExecutionPackageCard pkg={{ package_id: "package-dirty", preflight_status: "blocked", execution_status: "not_started", work_items: [], preflight: { checks: [{ check: "repository_state", status: "failed", detail: "working tree dirty" }], working_tree_resolution: { status: "working_tree_resolution_ready", branch: "feature/test", dirty_count: 19, eligibility_counts: { SAFE_TO_CHECKPOINT: 19 }, inventory: [{ file: "backend/example.py", commit_eligibility: "SAFE_TO_CHECKPOINT" }], checkpoint_proposal: { checkpoint_name: "checkpoint: founder gate autonomous resolution lifecycle", risk: "low", included_files: ["backend/example.py"], excluded_files: [], verification_evidence: ["tests passed"] } } } }} />);
    expect(screen.getByLabelText("Working Tree Resolution")).toBeTruthy();
    expect(screen.getByText(/可形成安全 checkpoint/)).toBeTruthy();
    expect(screen.getByText("checkpoint: founder gate autonomous resolution lifecycle")).toBeTruthy();
    const details = screen.getByText("Technical Details / Evidence").closest("details");
    expect(details.open).toBe(false);
    expect(screen.getByText(/需先解决技术准备问题/)).toBeTruthy();
  });

  it("shows a concise execution readiness contract with technical details collapsed", () => {
    render(<ExecutionPackageCard pkg={{ package_id: "package-ready", preflight_status: "ready", execution_status: "not_started", work_items: [], preflight: { checks: [] }, execution_readiness_contract: { contract_id: "readiness-1", readiness_status: "execution_readiness_ready", validation_result: "PASS", execution_scope: { execution_goal: "Configure isolated runtime", included_capabilities: ["storage", "compute"], allowed_files_or_paths: { repository_paths: [], runtime_targets: ["runtime://storage"] }, allowed_operations: [], excluded_operations: [] }, executor: { executor_provider: "codex" }, rollback_contract: { rollback_anchor: "abc123" }, automatic_stop_conditions: [{ condition: "scope" }], verification_contract: {}, side_effect_contract: {}, readiness_checks: {} } }} />);
    expect(screen.getByLabelText("Execution Readiness Contract")).toBeTruthy();
    expect(screen.getByText("执行边界已验证")).toBeTruthy();
    expect(screen.getByText("Configure isolated runtime")).toBeTruthy();
    expect(screen.getByText("等待独立 Executor 启动动作")).toBeTruthy();
    expect(screen.getByText("Technical Details").closest("details").open).toBe(false);
    expect(screen.queryByRole("button", { name: /执行/ })).toBeNull();
  });
});
