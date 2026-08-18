// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SinoBrainContext } from "./SinoBrainContext.jsx";

describe("SinoBrainContext", () => {
  it("projects Architecture Tasks at Decision Readiness without execution", () => {
    render(<SinoBrainContext brain={{ stage: "decision_ready", execution_progress: { current_phase: "decision_readiness", founder_action_required: true }, discovery: { task_complexity_route: { classification: "STRATEGIC_TASK", task_type: "ARCHITECTURE_TASK", current_step: "decision_readiness", architecture_analysis: { status: "completed" }, architecture_proposal: { status: "ready_for_founder_decision" } } } }} />);
    expect(screen.getAllByText("Architecture Task")).toHaveLength(2);
    expect(screen.getByText("Not Allowed Before Approval")).toBeTruthy();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.queryByText("Standard Task")).toBeNull();
  });
  it("projects an auto-started capability build without Continue or Strategy", () => {
    render(<SinoBrainContext brain={{ stage: "autonomous_execution", current_action: { action_id: "image_model_probe_gate", title: "Image Model Probe 需要授权边界", description: "已自动推进到 Probe。", primary_label: null }, discovery: { task_complexity_route: { classification: "STANDARD_TASK", task_type: "CAPABILITY_BUILD_TASK" }, autonomous_main_loop: { task_type: "CAPABILITY_BUILD_TASK", status: "founder_gate_required", manual_continue_count: 0, manual_codex_instruction_count: 0, founder_gate_required: true, capability_compatibility: { status: "CAPABILITY_MISSING" }, model_candidates: [{ model_id: "image-model" }] } } }} />);
    expect(screen.getByText("Autonomous Capability Build")).toBeTruthy();
    expect(screen.getByText("CAPABILITY_MISSING")).toBeTruthy();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it("projects Quick Fix without Goal confirmation or Strategy actions", () => {
    render(<SinoBrainContext brain={{ stage: "goal_review", discovery: { task_complexity_route: { classification: "QUICK_FIX", founder_gate_required: false, quick_fix_contract: { target_area: "Left Sidebar / AI Commerce OS Project Tree" } } } }} />);
    expect(screen.getAllByText("Quick Fix")).toHaveLength(2);
    expect(screen.getByText("Left Sidebar / AI Commerce OS Project Tree")).toBeTruthy();
    expect(screen.getByText("Not Required")).toBeTruthy();
    expect(screen.getByText("Sino 自动执行")).toBeTruthy();
    expect(screen.queryByText("确认后开始 Strategy Meeting。")).toBeNull();
    expect(screen.queryByRole("button", { name: "开始讨论" })).toBeNull();
    expect(screen.queryByRole("button", { name: "修改目标" })).toBeNull();
  });
  it("projects a Standard Task without Goal confirmation or Strategy actions", () => {
    render(<SinoBrainContext brain={{ stage: "standard_task", discovery: { task_complexity_route: { classification: "STANDARD_TASK", current_step: "execution", execution_status: "execution", standard_task_contract: { target_surface: "Capability Repository" } } } }} />);
    expect(screen.getAllByText("Standard Task")).toHaveLength(2);
    expect(screen.getByText("Capability Repository")).toBeTruthy();
    expect(screen.getByText("Not Required")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "开始讨论" })).toBeNull();
    expect(screen.queryByText("确认后开始 Strategy Meeting。" )).toBeNull();
  });
  it("projects a screenshot-grounded removal target and action", () => {
    render(<SinoBrainContext brain={{ discovery: { task_complexity_route: { classification: "QUICK_FIX", clarification_required: false, founder_gate_required: false, quick_fix_contract: { target_area: "Left Sidebar / Projects Header", visual_target: 'chevron immediately left of the "+" control', operation: "REMOVE_UI_ELEMENT" } } } }} />);
    expect(screen.getByText('chevron immediately left of the "+" control')).toBeTruthy();
    expect(screen.getByText("Remove UI Element")).toBeTruthy();
    expect(screen.getByText("Sino 自动执行")).toBeTruthy();
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it("projects a short system-project instruction as Project Planning without a Goal", () => {
    const { container } = render(<SinoBrainContext brain={{ project_id: "project-child", stage: "project_planning", goal_brief: {}, current_action: { action_id: "continue_project_planning", title: "Project Planning", description: "Sino 正在基于继承的 Project Context 判断关键缺口与下一步。", primary_label: "继续讨论" }, discovery: { project_aware: true, current_project: { project_id: "project-child", project_name: "Intelligence Evolution Layer" }, discussion_maturity: { maturity_status: "continue_analysis", reason: "现有 Context 足够继续分析。", autonomous_next_analysis: "Sino 将继续基于已有 Context 完成下一轮实质分析", outcomes: [{ outcome_id: "draft" }] } } }} />);
    expect(screen.getAllByText("Project Planning · 项目规划").length).toBeGreaterThan(0);
    expect(screen.getByText("Intelligence Evolution Layer")).toBeTruthy();
    expect(screen.queryByText("Project-aware Discussion")).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
    expect(screen.queryByText("目标待理解")).toBeNull();
    expect(screen.getByText("现有 Context 足够继续分析。")).toBeTruthy();
    expect(screen.queryByText("Outcome Summary")).toBeNull();
    expect(container.querySelector(".sino-founder-action-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /继续/ })).toBeNull();
  });
  it("counts only currently used Context Sources and keeps unused context behind a nested fold", () => {
    render(<SinoBrainContext brain={{ project_id: "project-child", stage: "project_planning", discovery: { project_aware: true, current_project: { project_name: "Intelligence Evolution Layer" }, discussion_maturity: { maturity_status: "continue_analysis", reason: "继续分析", autonomous_next_analysis: "继续" } } }} contextGroundings={[{ message_id: "message-1", sources: [{ key: "parent_constitution", label: "Parent Constitution", used: true, references: [{ source_id: "conv-1", title: "AI Commerce OS Constitution V1" }] }, { key: "goals", label: "项目目标", used: false }] }]} />);
    const details = screen.getByText("Context Sources · 1").closest("details");
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Parent Constitution");
    expect(details.textContent).toContain("AI Commerce OS Constitution V1");
    expect(screen.getByText("Unused Context · 1").closest("details").open).toBe(false);
  });
  it("uses the latest resolved maturity projection and removes stale blocker detail", () => {
    render(<SinoBrainContext brain={{ project_id: "project-child", stage: "project_planning", discovery: { project_aware: true, current_project: { project_name: "Intelligence Evolution Layer" }, blocking_question_resolution: { status: "resolved" }, discussion_maturity: { maturity_status: "continue_analysis", reason: "Founder 回答已吸收。", autonomous_next_analysis: "继续起草系统定义。", blocking_question: "旧问题", why_founder_needed: "旧理由", sino_recommendation: "旧建议" } } }} />);
    expect(screen.getByText("继续自主分析")).toBeTruthy();
    expect(screen.getByText("继续起草系统定义。")).toBeTruthy();
    expect(screen.queryByText("Pending Question")).toBeNull();
    expect(screen.queryByText("Sino Recommendation")).toBeNull();
    expect(screen.queryByText("旧问题")).toBeNull();
    expect(screen.queryByText("旧建议")).toBeNull();
  });
  it("shows Constitution semantics instead of Goal fields for a context update", () => {
    render(<SinoBrainContext brain={{ message_intent: "project_context_update", stage: "context_updated", goal_readiness: "unclear", goal_brief: {}, constitution_understanding: { status: "pending_founder_review", system_objects: Array.from({ length: 7 }, (_, index) => ({ name: `Object ${index}` })), proposed_work_items: Array.from({ length: 10 }, (_, index) => ({ work_item_id: `work-${index}`, founder_decision: index < 2 ? "approved" : "pending" })) } }} />);
    expect(screen.getByText("Constitution Review Status")).toBeTruthy();
    expect(screen.getByText("2 / 10")).toBeTruthy();
    expect(screen.queryByText("Goal Status")).toBeNull();
    expect(screen.queryByText("Goal", { selector: "dt" })).toBeNull();
  });
  it("shows the selected Work Item and records Founder decisions only from the right context", () => {
    const review = vi.fn();
    const item = { work_item_id: "work-1", title: "Intelligence Evolution Layer", existing_state: "not_found", source: "system_objects:Intelligence Evolution Layer", reason: "Constitution 定义了基础层对象。", recommended_action: "完善系统定义。", founder_decision: "pending" };
    const brain = { message_intent: "project_context_update", stage: "context_updated", constitution_understanding: { status: "founder_approved", system_objects: Array.from({ length: 7 }), proposed_work_items: [item] } };
    const { rerender } = render(<SinoBrainContext brain={brain} selectedConstitutionWorkItemId="work-1" onReviewConstitutionWorkItem={review} />);
    expect(screen.getByRole("region", { name: "当前建议工作项" })).toBeTruthy();
    expect(screen.getByText("Intelligence Evolution Layer")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "同意推进" }));
    expect(review).toHaveBeenCalledWith("work-1", "approved");
    rerender(<SinoBrainContext brain={{ ...brain, constitution_understanding: { ...brain.constitution_understanding, proposed_work_items: [{ ...item, founder_decision: "approved" }] } }} selectedConstitutionWorkItemId="work-1" onReviewConstitutionWorkItem={review} />);
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByText("Recorded")).toBeTruthy();
    expect(screen.getByText("✓ 已同意推进")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "同意推进" })).toBeNull();
    expect(screen.getByText("等待 Sino 判断该 Work Item 应进入哪一种正式工作流程")).toBeTruthy();
  });
  it("projects traceable dependency evidence while keeping Founder decision pending", () => {
    const item = { work_item_id: "work-1", title: "Runtime Platform", existing_state: "not_found", source: "system_objects:runtime", reason: "system role", recommended_action: "review", founder_decision: "pending", real_dependency_evidence: [{ dependency_id: "dependency-1", source_project_name: "Downstream System", source_execution_session_id: "session-1", source_execution_package_id: "package-1", required_capabilities: ["runtime"], reason: "runtime unavailable" }] };
    render(<SinoBrainContext brain={{ message_intent: "project_context_update", stage: "context_updated", constitution_understanding: { status: "founder_approved", system_objects: [{}], proposed_work_items: [item] } }} selectedConstitutionWorkItemId="work-1" />);
    expect(screen.getByText("Real Dependency Evidence")).toBeTruthy();
    expect(screen.getByText("Downstream System")).toBeTruthy();
    expect(screen.getByText("session-1")).toBeTruthy();
    expect(screen.getByText("待判断")).toBeTruthy();
  });
  it("projects discuss and deferred Founder decisions as static right-context states", () => {
    const item = { work_item_id: "work-1", title: "AI Commerce OS Cloud", existing_state: "not_found", source: "system_objects:cloud", reason: "基础层对象", recommended_action: "继续核对", founder_decision: "discuss" };
    const brain = { message_intent: "project_context_update", stage: "context_updated", constitution_understanding: { status: "founder_approved", system_objects: [{}], proposed_work_items: [item] } };
    const { rerender } = render(<SinoBrainContext brain={brain} selectedConstitutionWorkItemId="work-1" />);
    expect(screen.queryByRole("button", { name: "同意推进" })).toBeNull();
    expect(screen.getByText("继续讨论", { selector: "strong" })).toBeTruthy();
    rerender(<SinoBrainContext brain={{ ...brain, constitution_understanding: { ...brain.constitution_understanding, proposed_work_items: [{ ...item, founder_decision: "deferred" }] } }} selectedConstitutionWorkItemId="work-1" />);
    expect(screen.getByText("暂不处理", { selector: "strong" })).toBeTruthy();
  });
  it("shows Sino routing judgment separately and reviews it without creating an object", () => {
    const reviewRouting = vi.fn();
    const routing = { recommended_route: "system_project", reason: "这是长期基础系统，不是一次性 Goal。", proposed_object: "Intelligence Evolution Layer", existing_state: "not_found", next_action: "建议进入正式对象创建前的 Founder Review。", confidence: .93, routing_status: "pending_founder_review" };
    const item = { work_item_id: "work-1", title: "Intelligence Evolution Layer", existing_state: "not_found", source: "system_objects:Intelligence Evolution Layer", reason: "基础层对象", recommended_action: "建立系统定义", founder_decision: "approved", routing_recommendation: routing };
    render(<SinoBrainContext brain={{ message_intent: "project_context_update", stage: "context_updated", constitution_understanding: { status: "founder_approved", system_objects: Array.from({ length: 7 }), proposed_work_items: [item] } }} selectedConstitutionWorkItemId="work-1" onReviewConstitutionRouting={reviewRouting} />);
    expect(screen.getByRole("region", { name: "Sino Routing Recommendation" })).toBeTruthy();
    expect(screen.getByText("System Project")).toBeTruthy();
    expect(screen.getByText("93%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准建议" }));
    fireEvent.click(screen.getByRole("button", { name: "返回讨论" }));
    expect(reviewRouting.mock.calls).toEqual([["work-1", "approved"], ["work-1", "discuss"]]);
  });
  it("replaces repeated routing approval with one confirmable Formal Object Proposal", () => {
    const reviewRouting = vi.fn();
    const confirmFormalObject = vi.fn();
    const proposal = { proposal_id: "formal-1", proposed_object: "Intelligence Evolution Layer", object_type: "system_project", parent_project: "AI Commerce OS", architecture_role: "Foundation Layer", source_constitution: "AI Commerce OS Constitution V1", source_work_item: "Intelligence Evolution Layer", initial_positioning: "Foundation Layer 的正式系统对象。", reason: "需要长期建设。", initial_scope: ["定义职责与边界"], status: "awaiting_founder_confirmation", creation_enabled: false };
    const routing = { recommended_route: "system_project", reason: "长期基础系统", proposed_object: "Intelligence Evolution Layer", existing_state: "not_found", next_action: "形成正式对象提案", confidence: .95, routing_status: "approved", routing_decision: "approved", formal_object_proposal: proposal };
    const item = { work_item_id: "work-1", title: "Intelligence Evolution Layer", existing_state: "not_found", source: "system_objects:Intelligence Evolution Layer", reason: "基础层对象", recommended_action: "建立系统定义", founder_decision: "approved", routing_recommendation: routing };
    render(<SinoBrainContext brain={{ message_intent: "project_context_update", stage: "context_updated", constitution_understanding: { status: "founder_approved", system_objects: Array.from({ length: 7 }), proposed_work_items: [item] } }} selectedConstitutionWorkItemId="work-1" onReviewConstitutionRouting={reviewRouting} onConfirmFormalObject={confirmFormalObject} />);
    expect(screen.queryByRole("button", { name: "批准建议" })).toBeNull();
    expect(screen.getByText("✓ 已批准")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Formal Object Proposal" })).toBeTruthy();
    expect(screen.getByText("AI Commerce OS")).toBeTruthy();
    expect(screen.getByText("Awaiting Founder Confirmation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认创建" }));
    expect(confirmFormalObject).toHaveBeenCalledWith("work-1");
  });
  it("shows a created Formal Object result and navigates to the persisted Project", () => {
    const openProject = vi.fn();
    const proposal = { proposal_id: "formal-1", proposed_object: "Intelligence Evolution Layer", object_type: "system_project", parent_project: "AI Commerce OS", architecture_role: "Foundation Layer", source_constitution: "AI Commerce OS Constitution V1", source_work_item: "Intelligence Evolution Layer", initial_positioning: "Foundation Layer 的正式系统对象。", reason: "需要长期建设。", initial_scope: ["定义职责与边界"], status: "created", created_project_id: "project-intelligence" };
    const routing = { recommended_route: "system_project", reason: "长期基础系统", proposed_object: "Intelligence Evolution Layer", existing_state: "not_found", next_action: "形成正式对象提案", confidence: .95, routing_status: "approved", formal_object_proposal: proposal };
    const item = { work_item_id: "work-1", title: "Intelligence Evolution Layer", existing_state: "not_found", source: "system_objects:Intelligence Evolution Layer", reason: "基础层对象", recommended_action: "建立系统定义", founder_decision: "approved", routing_recommendation: routing };
    render(<SinoBrainContext brain={{ message_intent: "project_context_update", stage: "context_updated", constitution_understanding: { status: "founder_approved", system_objects: Array.from({ length: 7 }), proposed_work_items: [item] } }} selectedConstitutionWorkItemId="work-1" onOpenProject={openProject} />);
    expect(screen.getByRole("region", { name: "Creation Result" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "进入 Project" }));
    expect(openProject).toHaveBeenCalledWith("project-intelligence");
  });
  afterEach(cleanup);
  it("renders a reviewable Goal Brief and confirmation gate", () => {
    const confirm = vi.fn();
    render(<SinoBrainContext brain={{ stage: "goal_review", goal_readiness: "reviewable", goal_brief: { goal: "我要做AI短剧", summary: "建立生产能力" } }} onConfirmGoal={confirm} />);
    expect(screen.getByText("目标已经明确")).toBeTruthy();
    expect(screen.getByText("我要做AI短剧")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "开始讨论" }));
    expect(confirm).toHaveBeenCalled();
  });

  it("renders Goal Understanding and lets Founder stop clarification", () => {
    const force = vi.fn();
    render(<SinoBrainContext brain={{ stage: "goal_discovery", goal_readiness: "discovering", discovery: { working_understanding: { interpreted_goal: "AI 短剧生产能力", known_context: ["Founder 先验证"], non_blocking_unknowns: ["技术路线"] } }, goal_brief: { summary: "建立 AI 短剧生产能力", goal: "AI 短剧生产能力" } }} onForceReview={force} />);
    expect(screen.getAllByText("Goal Understanding · 目标理解")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "目标已经够清楚，开始讨论" }));
    expect(force).toHaveBeenCalled();
  });

  it("shows one package with traceable objects and explicit approval", () => {
    const review = vi.fn();
    render(<SinoBrainContext brain={{ stage: "package_ready", goal_readiness: "confirmed", goal_brief: { goal: "AI 短剧" }, decision: { final_recommendation: "建立 Project 和最小 Workflow", confidence: .91 }, discussion_package: { package_id: "package-1", title: "AI 短剧生产系统", status: "pending_review", counts: { decision: 1, project: 1, workflow: 1 }, objects: [{ discussion_object_id: "item-1", object_type: "project", name: "AI 短剧", action: "create", purpose: "承载生产系统", source: "Decision", confidence: .91 }] } }} onReviewPackage={review} />);
    expect(screen.getAllByText("Discussion Package")).toHaveLength(1);
    expect(screen.getByText(/待 Founder 审批/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准候选能力" }));
    expect(review).toHaveBeenCalledWith("approve");
  });

  it("exposes one real next action for Strategy, Validation and Decision", () => {
    const advance = vi.fn();
    const { rerender } = render(<SinoBrainContext brain={{ stage: "strategy_meeting", goal_readiness: "confirmed", current_action: { action_id: "start_validation", title: "Strategy Finished", description: "已形成方案", primary_label: "开始 Validation", secondary_label: "继续讨论" } }} onAdvanceStage={advance} />);
    fireEvent.click(screen.getByRole("button", { name: "开始 Validation" }));
    expect(advance).toHaveBeenLastCalledWith("validation");
    rerender(<SinoBrainContext brain={{ stage: "conflict_validation", goal_readiness: "confirmed", current_action: { action_id: "generate_decision", title: "Validation Finished", description: "验证完成", primary_label: "生成 Decision", secondary_label: "继续验证" } }} onAdvanceStage={advance} />);
    fireEvent.click(screen.getByRole("button", { name: "生成 Decision" }));
    expect(advance).toHaveBeenLastCalledWith("decision");
    rerender(<SinoBrainContext brain={{ stage: "decision_ready", goal_readiness: "confirmed", current_action: { action_id: "generate_package", title: "Decision Finished", description: "决策完成", primary_label: "生成 Discussion Package", secondary_label: "重新讨论" } }} onAdvanceStage={advance} />);
    fireEvent.click(screen.getByRole("button", { name: "生成 Discussion Package" }));
    expect(advance).toHaveBeenLastCalledWith("package");
  });

  it("shows committed assets and routes the completed action", () => {
    const viewAssets = vi.fn(); const newGoal = vi.fn();
    const item = { discussion_object_id: "item-1", asset_id: "object-1", object_type: "workflow", name: "短剧生产 Workflow", action: "create", purpose: "稳定生产", confidence: .9, commit_status: "committed", destination: "AI 能力中心" };
    render(<SinoBrainContext brain={{ stage: "conversation_completed", goal_readiness: "confirmed", current_action: { action_id: "assets_committed", title: "资产提交完成", description: "已进入系统", primary_label: "查看资产", secondary_label: "开始新目标" }, discussion_package: { package_id: "package-1", title: "AI 短剧", status: "archived", counts: { workflow: 1 }, objects: [item], asset_commit: { commit_id: "commit-1", status: "committed", items: [item] } } }} onViewAssets={viewAssets} onNewGoal={newGoal} />);
    expect(screen.getByText("Candidate Commit Status")).toBeTruthy();
    expect(screen.getByText("Candidate")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看资产" }));
    fireEvent.click(screen.getByRole("button", { name: "开始新目标" }));
    expect(viewAssets).toHaveBeenCalled(); expect(newGoal).toHaveBeenCalled();
  });

  it("projects runtime binding as the current Founder gate instead of ready for execution", () => {
    render(<SinoBrainContext brain={{ project_id: "project-infra", stage: "execution_package", discovery: { current_project: { project_name: "Infrastructure Project" }, execution_package: { package_id: "package-runtime", source_draft_id: "draft-1", source_draft_version: 1, implementation_plan_id: "plan-1", approval_ref: { status: "approved" }, work_items: [{ work_item_id: "work-1" }], preflight_status: "founder_gate_required", execution_status: "not_started", runtime_binding: { requires_runtime_binding: true, binding_status: "founder_review_required" }, preflight: { founder_gate_reasons: ["Runtime Environment Binding Required"] } } } }} />);
    expect(screen.getByText("Founder Gate Required")).toBeTruthy();
    expect(screen.getByText("Founder 审核 Runtime Environment Recommendation")).toBeTruthy();
    expect(screen.queryByText("Ready for Execution")).toBeNull();
  });

  it("projects an external-dependency Execution Result above stale Project Planning state", () => {
    render(<SinoBrainContext brain={{ project_id: "project-evolution", stage: "project_planning", discovery: { project_aware: true, current_project: { project_name: "Evolution System" }, discussion_maturity: { maturity_status: "evaluating", reason: "old planning" } }, project_lifecycle: { rank: 700, lifecycle_stage: "validation_result", stage_label: "Validation / Execution Result", implementation_status: "completed", validation_status: "blocked_by_external_dependency", current_dependency: { dependency_target: "Runtime Foundation" }, blocking_reason: "runtime unavailable", resume_point: "work-7", current_action: { title: "等待外部依赖解除后恢复真实环境验证" } } }} />);
    expect(screen.getAllByText("Validation / Execution Result").length).toBeGreaterThan(0);
    expect(screen.getByText("✓ Completed")).toBeTruthy();
    expect(screen.getByText("Blocked by External Dependency")).toBeTruthy();
    expect(screen.getByText("Runtime Foundation")).toBeTruthy();
    expect(screen.getByText("WORK-7 Real Environment Validation")).toBeTruthy();
    expect(screen.queryByText("正在判断讨论成熟度")).toBeNull();
  });
});
