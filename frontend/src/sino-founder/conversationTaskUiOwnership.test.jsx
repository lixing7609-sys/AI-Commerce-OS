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
    const status = screen.getByRole("region", { name: "Task Status" });
    expect(within(status).getByText("讨论中")).toBeTruthy();
    expect(within(status).getByText("尚未形成执行任务")).toBeTruthy();
    expect(screen.getByText("暂无需要你处理的事项")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "停止任务" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Brain Dashboard" })).toBeNull();
    expect(screen.getByText("查看讨论详情 / 技术详情").closest("details").open).toBe(false);
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
