// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationThread } from "./ConversationThread.jsx";
import { SinoBrainContext } from "./SinoBrainContext.jsx";

const message = (message_id, role, content) => ({ message_id, role, content });
const discussionBrain = { stage: "goal_discovery", goal_readiness: "discovering", current_action: { action_id: "continue_goal", title: "继续理解目标", primary_label: "继续" }, decision: { confidence: .81 }, discovery: { working_understanding: { interpreted_goal: "把新建讨论页面改成3列式" } } };
const taskBrain = (progress = {}, route = {}) => ({ stage: "standard_task", execution_progress: { task_id: "task-1", execution_id: "execution-1", current_action: "正在实施", next_action: "Founder 无需操作", progress_percent: 35, execution_status: "executing", founder_action_required: false, ...progress }, discovery: { task_complexity_route: { classification: "STANDARD_TASK", standard_task_contract: { task_id: "task-1", target_surface: "Founder UI" }, autonomous_execution: { execution_session_id: "execution-1" }, ...route } } });

afterEach(cleanup);

describe("Conversation / Task UI ownership", () => {
  it("keeps discussion center as messages plus composer without workflow controls", () => {
    render(<ConversationThread snapshot={{ conversation: { id: "conv-1", title: "把新建讨论页面改成3列式" }, messages: [message("m1", "founder", "把新建讨论页面改成3列式"), message("m2", "assistant", "我已经理解了你想改善的方向，但目标范围或完成标准还不够唯一。")], sino_brain: discussionBrain }} message="" onMessage={() => {}} onSend={() => {}} busy={false} />);
    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(within(conversation).getByText("把新建讨论页面改成3列式", { selector: "p" })).toBeTruthy();
    expect(within(conversation).getByText(/目标范围或完成标准还不够唯一/)).toBeTruthy();
    expect(within(conversation).queryByText("Current Action")).toBeNull();
    expect(within(conversation).queryByRole("button", { name: "继续" })).toBeNull();
    expect(within(conversation).queryByRole("navigation", { name: "Sino Brain stages" })).toBeNull();
    expect(within(conversation).queryByText("Confidence")).toBeNull();
    expect(within(conversation).getByRole("textbox", { name: "讨论内容" })).toBeTruthy();
  });

  it("shows a quiet task sidebar before a task exists", () => {
    render(<SinoBrainContext brain={discussionBrain} />);
    const status = screen.getByRole("region", { name: "Execution Center" });
    expect(within(status).getByRole("heading", { name: "执行中心" })).toBeTruthy();
    expect(within(status).getByText("暂无执行事项")).toBeTruthy();
    expect(within(status).getByText("Founder 暂无需要处理的事项")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "停止任务" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Brain Dashboard" })).toBeNull();
  });

  it("projects clarification as a Founder action instead of saying no action is required", () => {
    const brain = { ...discussionBrain, discovery: { ...discussionBrain.discovery,
      clarification_state: { status: "awaiting_founder_clarification", founder_action_required: true },
      founder_action_queue: [{ action_id: "clarification-1", type: "CLARIFICATION", status: "pending", title: "三栏职责需要确认", summary: "请确认三栏内容分配。", current_understanding: { confirmed_decisions: [{ type: "three_column_responsibilities", left: "Projects", center: "Conversation", right: "Task Queue" }] } }],
    } };
    render(<SinoBrainContext brain={brain} conversationId="conv-1" />);
    expect(screen.getByText("等待确认")).toBeTruthy();
    expect(screen.getByText("Founder：需要操作")).toBeTruthy();
    expect(screen.getByRole("article", { name: "Clarification Required" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认当前理解" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续讨论" })).toBeTruthy();
    expect(screen.queryByText("Founder：无需操作")).toBeNull();
  });

  it("projects a mature discussion as a pending task confirmation", () => {
    const candidate = { candidate_id: "candidate-1", title: "AI Commerce Mini Operator V1", goal: "搭建最小 AI 电商经营系统",
      scope: ["商品理解", "广告创意", "投放优化"], constraints: ["一个广告平台", "一个广告账户", "一个真实商品"],
      acceptance_criteria: ["完成一轮数据回流"], status: "pending_founder_confirmation" };
    const brain = { ...discussionBrain, discovery: { ...discussionBrain.discovery, task_candidate: candidate,
      founder_action_required: true, task_projection: { status: "pending_founder_confirmation", candidate_id: candidate.candidate_id },
      founder_action_queue: [{ action_id: "task-confirmation:candidate-1", candidate_id: candidate.candidate_id,
        type: "TASK_CONFIRMATION", status: "pending", title: candidate.title, summary: candidate.goal, task_candidate: candidate }] } };
    render(<SinoBrainContext brain={brain} conversationId="conv-1" />);
    const status = screen.getByRole("region", { name: "Task Status" });
    expect(within(status).getByText("待确认")).toBeTruthy();
    expect(within(status).getByText("Founder：需要操作")).toBeTruthy();
    const action = screen.getByRole("article", { name: "Task Confirmation" });
    expect(within(action).getByText("AI Commerce Mini Operator V1")).toBeTruthy();
    expect(within(action).getByRole("button", { name: "确认执行" })).toBeTruthy();
    expect(within(action).getByRole("button", { name: "修改任务" })).toBeTruthy();
    expect(within(action).getByRole("button", { name: "继续讨论" })).toBeTruthy();
    expect(screen.queryByText("Founder：无需操作")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("owns the only task progress and stop control in the right sidebar", () => {
    render(<SinoBrainContext brain={taskBrain()} />);
    expect(screen.getByLabelText("任务进度 35%")).toBeTruthy();
    expect(screen.getAllByLabelText(/任务进度/)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "停止任务" })).toBeTruthy();
  });

  it("does not queue ordinary Codex permission or self healing", () => {
    const { rerender } = render(<SinoBrainContext brain={taskBrain()} />);
    expect(screen.getByText("暂无需要你处理的事项")).toBeTruthy();
    rerender(<SinoBrainContext brain={taskBrain({ current_action: "正在自愈", execution_status: "self_healing" }, { technical_resolution_contract: { resolution_status: "diagnosing" } })} />);
    expect(screen.getByText("暂无需要你处理的事项")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Codex Founder Boundary" })).toBeNull();
  });

  it("queues Codex Founder boundaries and Architecture decisions", () => {
    const boundary = { request_id: "external", operation_type: "external_paid_api", decision_reason: "需要外部调用", resource_scope: "provider", risk_level: "high", external_effect: "provider request" };
    const { rerender } = render(<SinoBrainContext brain={taskBrain({ founder_action_required: true, execution_status: "waiting_for_founder_authorization", codex_authorization_boundary: boundary })} />);
    expect(screen.getByRole("article", { name: "Codex Founder Boundary" })).toBeTruthy();
    rerender(<SinoBrainContext brain={{ stage: "decision_ready", execution_progress: { task_id: "task-a", current_phase: "decision_readiness", founder_action_required: true }, discovery: { task_complexity_route: { classification: "STRATEGIC_TASK", architecture_proposal: { proposal_id: "p1", status: "ready_for_founder_decision" } } } }} />);
    expect(screen.getByRole("article", { name: "Architecture Proposal" })).toBeTruthy();
  });

  it("queues Founder Acceptance and keeps accepted history collapsed", () => {
    const route = { execution_status: "completed", visible_result: { title: "Founder UI Cleanup", target_surface: "Founder UI", verification_status: "PASS" }, founder_acceptance: { status: "pending" } };
    const { rerender } = render(<SinoBrainContext brain={taskBrain({ current_action: "已完成", execution_status: "completed", progress_percent: 100 }, route)} />);
    expect(screen.getByRole("article", { name: "Founder Acceptance" })).toBeTruthy();
    rerender(<SinoBrainContext brain={taskBrain({ current_action: "已完成", execution_status: "completed", progress_percent: 100 }, { ...route, founder_acceptance: { status: "accepted" } })} />);
    expect(screen.queryByRole("article", { name: "Founder Acceptance" })).toBeNull();
    expect(screen.getByText("已处理").closest("details").open).toBe(false);
    expect(screen.getByText("Founder Acceptance · Accepted")).toBeTruthy();
  });
});
