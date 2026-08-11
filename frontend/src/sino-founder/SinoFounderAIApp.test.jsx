// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SinoFounderAIApp from "./SinoFounderAIApp.jsx";
import { confirmCandidateGoal, createFounderConversation, createFounderExecution, discussWithSino, getAssetMemoryCenter, getConversationWorkspace, getFounderBriefing, getFounderExecution, getFounderStrategy, reasonConfirmedGoal, submitExecutionDelta } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";

vi.mock("../services/founderAiApi.js", () => ({ approveFounderExecution: vi.fn(), buildSystemBlueprint: vi.fn(), confirmCandidateGoal: vi.fn(), createFounderConversation: vi.fn(), createFounderExecution: vi.fn(), decideExecutionDelta: vi.fn(), discussWithSino: vi.fn(), getAssetMemoryCenter: vi.fn(), getConversationWorkspace: vi.fn(), getFounderBriefing: vi.fn(), getFounderExecution: vi.fn(), getFounderStrategy: vi.fn(), reasonConfirmedGoal: vi.fn(), resumeFounderExecution: vi.fn(), submitExecutionDelta: vi.fn() }));
vi.mock("../services/taskAssetApi.js", () => ({ createTaskAsset: vi.fn() }));

const emptySnapshot = { conversation: { id: "conv-1", state: "exploring" }, messages: [], digest: { summary: "", topics: [], decisions: [], knowledge_items: [], candidate_goals: [], pending_questions: [] }, goals: [] };

beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear();
  getFounderBriefing.mockResolvedValue({ recommendations: [], project_state: {} });
  getFounderStrategy.mockResolvedValue({ roadmap: { milestones: [] }, capability_status: { applications: [] }, recommendations: [] });
  getAssetMemoryCenter.mockResolvedValue({ artifacts: [], memories: [], executions: [] });
  getConversationWorkspace.mockResolvedValue(emptySnapshot);
});
afterEach(() => cleanup());

describe("Sino Founder AI Conversation First", () => {
  it("defaults to Discussion Mode with Secretary navigation and capability navigation", () => {
    render(<SinoFounderAIApp />);
    expect(screen.getByPlaceholderText("与 Sino 讨论……")).toBeTruthy();
    expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
    for (const label of ["今日讨论", "已形成决策", "新增知识", "候选目标", "待确认问题", "资产与记忆"]) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    const capabilities = screen.getByRole("navigation", { name: "Founder AI 能力入口" });
    for (const label of ["战略与路线", "系统构建器", "目标推理", "执行中心", "资产与记忆"]) expect(capabilities.textContent).toContain(label);
    expect(screen.queryByText("今天推进什么？")).toBeNull();
  });

  it("sends an ordinary message without creating Goal, Task Plan, or Execution", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-1" });
    discussWithSino.mockResolvedValue({ ...emptySnapshot, messages: [{ message_id: "m1", role: "founder", content: "聊聊产品方向" }], digest: { ...emptySnapshot.digest, summary: "聊聊产品方向" } });
    render(<SinoFounderAIApp />);
    fireEvent.change(screen.getByLabelText("与 Sino 讨论"), { target: { value: "聊聊产品方向" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(discussWithSino).toHaveBeenCalledWith("conv-1", "聊聊产品方向"));
    expect(reasonConfirmedGoal).not.toHaveBeenCalled(); expect(createTaskAsset).not.toHaveBeenCalled(); expect(createFounderExecution).not.toHaveBeenCalled();
    expect(screen.getByText("普通讨论不会自动生成 Task Plan。")).toBeTruthy();
  });

  it("turns explicit execution intent into one confirmed Goal and one approval-gated Execution", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-1" });
    const formalGoal = { goal_id: "goal-explicit", conversation_id: "conv-1", title: "实施 Timeline", description: "按这个执行，开始实施 Timeline", status: "goal_confirmed" };
    discussWithSino.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-1", state: "goal_confirmed" }, goals: [formalGoal] });
    reasonConfirmedGoal.mockResolvedValue({ analysis: {}, evidence: [], solution: {}, task_plan: [], risk: {}, execution_requirement: {}, task_asset_draft: { title: "实施 Timeline", description: "plan", scope: {} }, execution_package: { goal: "实施 Timeline" } });
    createTaskAsset.mockResolvedValue({ id: "task-explicit" });
    createFounderExecution.mockResolvedValue({ id: "execution-explicit", task_asset_id: "task-explicit", status: "draft", execution_allowed: false });
    render(<SinoFounderAIApp />);
    fireEvent.change(screen.getByLabelText("与 Sino 讨论"), { target: { value: "按这个执行，开始实施 Timeline" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(reasonConfirmedGoal).toHaveBeenCalledTimes(1));
    expect(confirmCandidateGoal).not.toHaveBeenCalled();
    expect(createTaskAsset).toHaveBeenCalledTimes(1);
    expect(createFounderExecution).toHaveBeenCalledWith("task-explicit", { goal: "实施 Timeline" }, "goal-explicit");
    expect(screen.getByRole("button", { name: "批准执行" }).disabled).toBe(false);
  });

  it("continues discussing a candidate or confirms it before reasoning", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-1");
    const candidate = { goal_id: "candidate-1", title: "修复 Timeline", description: "修复 Timeline", status: "candidate" };
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, digest: { ...emptySnapshot.digest, candidate_goals: [candidate] } });
    confirmCandidateGoal.mockResolvedValue({ goal_id: "goal-1", conversation_id: "conv-1", title: "修复 Timeline", description: "修复 Timeline", status: "goal_confirmed" });
    reasonConfirmedGoal.mockResolvedValue({ analysis: {}, evidence: [], solution: {}, task_plan: [], risk: {}, execution_requirement: {}, task_asset_draft: { title: "修复 Timeline", description: "plan", scope: {} }, execution_package: { goal: "修复 Timeline" } });
    createTaskAsset.mockResolvedValue({ id: "task-1" }); createFounderExecution.mockResolvedValue({ id: "execution-1", task_asset_id: "task-1", status: "draft" });
    render(<SinoFounderAIApp />);
    expect((await screen.findAllByText("修复 Timeline")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(screen.getByLabelText("与 Sino 讨论").value).toBe("修复 Timeline");
    fireEvent.click(screen.getByRole("button", { name: "确认为目标" }));
    await waitFor(() => expect(reasonConfirmedGoal).toHaveBeenCalledWith("goal-1"));
    expect(createFounderExecution).toHaveBeenCalledWith("task-1", { goal: "修复 Timeline" }, "goal-1");
  });

  it("switches the composer to Execution Conversation and shows received deltas", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-1");
    const active = { id: "execution-1", task_asset_id: "task-1", status: "executing", execution_allowed: true, events: [], deltas: [] };
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, goals: [{ goal_id: "goal-1", status: "planning", title: "Runtime" }], active_execution: active, execution_deltas: [] });
    submitExecutionDelta.mockResolvedValue({ delta_id: "delta-1", content: "标题后加中文", delta_type: "ui_adjustment", impact_level: "low", status: "applied", package_version: 2 });
    getFounderExecution.mockResolvedValue({ ...active, deltas: [{ delta_id: "delta-1", content: "标题后加中文", delta_type: "ui_adjustment", impact_level: "low", status: "applied", package_version: 2 }] });
    render(<SinoFounderAIApp />);
    expect(await screen.findByPlaceholderText("补充当前执行……")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("与 Sino 讨论"), { target: { value: "标题后加中文" } }); fireEvent.click(screen.getByRole("button", { name: "发送补充" }));
    expect(await screen.findByText("已加入执行包 V2")).toBeTruthy();
  });

  it("renders high-impact delta confirmation controls", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-1");
    const delta = { delta_id: "delta-high", content: "改为 Event Stream", delta_type: "correction", impact_level: "high", status: "pending_confirmation", decision: "pause_and_replan" };
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, goals: [{ goal_id: "goal-1", status: "planning" }], active_execution: { id: "execution-1", task_asset_id: "task-1", status: "paused", deltas: [delta] }, execution_deltas: [delta] });
    render(<SinoFounderAIApp />);
    expect(await screen.findByPlaceholderText("补充信息或调整执行方案……")).toBeTruthy();
    expect(screen.getByText("高影响")).toBeTruthy(); expect(screen.getByRole("button", { name: "确认调整" })).toBeTruthy();
  });

  it("restores Conversation, Digest and Execution Delta history after refresh", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-restored");
    const restoredDelta = { delta_id: "delta-restored", content: "保持当前颜色", delta_type: "constraint_update", impact_level: "low", status: "applied", package_version: 2 };
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-restored", state: "executing" }, messages: [{ message_id: "m-restored", role: "founder", content: "保持当前颜色" }], digest: { ...emptySnapshot.digest, summary: "已恢复的讨论" }, goals: [{ goal_id: "goal-restored", status: "planning", title: "恢复任务" }], task_asset: { id: "task-restored", status: "approved" }, active_execution: { id: "execution-restored", task_asset_id: "task-restored", status: "paused", execution_allowed: true, events: [], deltas: [restoredDelta], artifact: { id: "artifact-restored" }, memory: { decision: "memory-decision" } }, execution_deltas: [restoredDelta] });
    render(<SinoFounderAIApp />);
    await waitFor(() => expect(getConversationWorkspace).toHaveBeenCalledWith("conv-restored"));
    expect(await screen.findByText("已恢复的讨论")).toBeTruthy();
    expect(screen.getAllByText("保持当前颜色").length).toBeGreaterThan(0);
    expect(screen.getByText("已加入执行包 V2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "已授权" })).toBeTruthy();
    expect(createFounderConversation).not.toHaveBeenCalled();
    expect(createFounderExecution).not.toHaveBeenCalled();
  });
});
