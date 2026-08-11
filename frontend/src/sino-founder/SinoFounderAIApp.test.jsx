// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SinoFounderAIApp from "./SinoFounderAIApp.jsx";
import { analyzeWithSinoBrain, buildSystemBlueprint, createFounderConversation, createFounderExecution, getFounderBriefing, getFounderExecution, getFounderStrategy } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";

vi.mock("../services/founderAiApi.js", () => ({
  createFounderConversation: vi.fn(), analyzeWithSinoBrain: vi.fn(),
  createFounderExecution: vi.fn(), approveFounderExecution: vi.fn(), executeFounderExecution: vi.fn(), resumeFounderExecution: vi.fn(), getFounderExecution: vi.fn(), getFounderBriefing: vi.fn(), getFounderStrategy: vi.fn(), buildSystemBlueprint: vi.fn(),
}));
vi.mock("../services/taskAssetApi.js", () => ({ createTaskAsset: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  getFounderBriefing.mockResolvedValue({ status: "ready", progress: { completed: 0, total: 0, percent: 0 }, risks: [], recommendations: [], project_state: { current_phase: "planning", completed_capabilities: [], active_tasks: [], blocked_items: [] } });
  getFounderStrategy.mockResolvedValue({ current_phase: "Founder Intelligence Foundation", roadmap: { milestones: [] }, capability_status: { applications: [] }, recommendations: [] });
});
afterEach(() => cleanup());

describe("SinoFounderAIApp", () => {
  it("renders the independent application workspace", () => {
    render(<SinoFounderAIApp />);
    expect(screen.getByText("Sino", { selector: ".sino-brand div" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "早上好，Founder。今天推进什么？" })).toBeTruthy();
    expect(screen.getByLabelText("项目关键指标")).toBeTruthy();
    expect(screen.getByTestId("analysis-card")).toBeTruthy();
    expect(screen.getByTestId("evidence-card")).toBeTruthy();
    expect(screen.getByTestId("solution-card")).toBeTruthy();
    expect(screen.getByTestId("task-plan-card")).toBeTruthy();
    expect(screen.getByTestId("execution-card")).toBeTruthy();
    expect(screen.getByText("Approved")).toBeTruthy();
    expect(screen.getByText("Queued")).toBeTruthy();
    expect(screen.getByText("Testing")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sino Founder AI" })).toBeTruthy();
    const workspace = screen.getByRole("main", { name: "Founder AI workspace content" });
    expect(workspace.getAttribute("tabindex")).toBe("0");
  });

  it("turns a Founder goal into Brain cards and a canonical execution session", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-1" });
    analyzeWithSinoBrain.mockResolvedValue({
      analysis: { interpretation: "当前目标需要补齐推理能力缺口", current_state: "Founder Intelligence active", desired_outcome: "Evidence-led reasoning", gap: "Reasoning Engine 未验证" },
      evidence: [{ source: "Project State", fact: "当前处于 execution", relevance: "确定交付边界" }, { source: "Code Evidence", fact: "定位到 EvidenceCard", relevance: "确定具体修改位置", metadata: { relevant_files: [{ path: "frontend/src/sino-founder/EvidenceCard.jsx", reason: "Matches Evidence Card" }], impact: ["frontend/src/sino-founder/ConversationWorkspace.jsx"], risk: "medium" } }],
      solution: { summary: "建立结构化 Reasoning Engine", approach: ["收集上下文", "生成证据", "准备执行"], architecture_impact: "保留 TaskAsset 与 Execution Loop" },
      risk: { level: "medium", items: ["范围扩张"], mitigation: ["Founder 审批"] },
      execution_requirement: { executor: "codex", approval_required: true, recommendation: "审阅证据后准备执行" },
      goal_analysis: { goal_type: "development", objective: "继续推进 AI Commerce OS", current_phase: "execution" },
      task_plan: [{ title: "完成 Intelligence Core" }],
      recommended_action: "执行下一项任务",
      task_asset_draft: { title: "继续推进 AI Commerce OS", description: "Founder plan", scope: { goal_type: "development" } },
      execution_package: { goal: "继续推进 AI Commerce OS" },
    });
    createTaskAsset.mockResolvedValue({ id: "task-asset-1" });
    createFounderExecution.mockResolvedValue({ id: "execution-1", status: "draft" });

    render(<SinoFounderAIApp />);
    fireEvent.change(screen.getByLabelText(/你现在最想推进什么/), { target: { value: "继续推进 AI Commerce OS" } });
    fireEvent.click(screen.getByRole("button", { name: "开始推理 →" }));

    await waitFor(() => expect(createFounderExecution).toHaveBeenCalledWith("task-asset-1", { goal: "继续推进 AI Commerce OS" }));
    expect(createTaskAsset).toHaveBeenCalledWith({
      title: "继续推进 AI Commerce OS",
      description: "Founder plan",
      scope: { goal_type: "development" },
      conversation_id: "conv-1",
    });
    expect(screen.getAllByText("继续推进 AI Commerce OS").length).toBeGreaterThan(0);
    expect(screen.getByText("完成 Intelligence Core")).toBeTruthy();
    expect(screen.getByText("当前处于 execution")).toBeTruthy();
    expect(screen.getByText("Code Evidence")).toBeTruthy();
    expect(screen.getByText("frontend/src/sino-founder/EvidenceCard.jsx")).toBeTruthy();
    expect(screen.getByText("medium")).toBeTruthy();
    expect(screen.getByText("建立结构化 Reasoning Engine")).toBeTruthy();
    expect(screen.getByText("审阅证据后准备执行")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses a suggested goal as the next reasoning prompt", () => {
    render(<SinoFounderAIApp />);
    fireEvent.click(screen.getByRole("button", { name: "梳理当前最高优先级任务" }));
    expect(screen.getByLabelText(/你现在最想推进什么/).value).toBe("梳理当前最高优先级任务");
    expect(screen.getByRole("button", { name: "开始推理 →" }).disabled).toBe(false);
  });

  it("renders briefing, project state, and approval-gated recommended actions", async () => {
    getFounderBriefing.mockResolvedValue({
      status: "active",
      progress: { completed: 4, total: 5, percent: 80 },
      risks: ["阻塞：Provider setup"],
      recommendations: [{ title: "继续任务：Runtime", reason: "TaskAsset 正在推进", priority: "high", requires_approval: true }],
      project_state: { current_phase: "execution", completed_capabilities: ["Sino Brain"], active_tasks: [{ title: "Runtime" }], blocked_items: [{ title: "Provider setup" }] },
    });
    render(<SinoFounderAIApp />);
    expect(await screen.findByText("已完成 4 / 5 项 · 进度 80%")).toBeTruthy();
    expect(screen.getByText("execution")).toBeTruthy();
    expect(screen.getByText("继续任务：Runtime")).toBeTruthy();
    expect(screen.getByText("high · 需授权")).toBeTruthy();
    expect(screen.getByRole("button", { name: "批准执行" }).disabled).toBe(true);
  });

  it("restores the execution session and timeline after a page refresh", async () => {
    window.localStorage.setItem("sino-founder-active-execution", "execution-restored");
    getFounderExecution.mockResolvedValue({
      id: "execution-restored",
      status: "testing",
      execution_allowed: true,
      timeline: {
        approved: "2026-08-10T01:00:00Z",
        queued: "2026-08-10T01:00:01Z",
        executing: "2026-08-10T01:00:02Z",
        testing: "2026-08-10T01:00:03Z",
        completed: null,
      },
      events: [
        { event_id: "event-1", execution_id: "execution-restored", event_name: "approved", timestamp: "2026-08-10T01:00:00Z", status: "approved", message: "Approved", metadata: {} },
        { event_id: "event-2", execution_id: "execution-restored", event_name: "queued", timestamp: "2026-08-10T01:00:01Z", status: "queued", message: "Queued", metadata: {} },
        { event_id: "event-3", execution_id: "execution-restored", event_name: "worker_started", timestamp: "2026-08-10T01:00:02Z", status: "executing", message: "Worker started", metadata: {} },
        { event_id: "event-4", execution_id: "execution-restored", event_name: "codex_started", timestamp: "2026-08-10T01:00:03Z", status: "executing", message: "Codex started", metadata: {} },
        { event_id: "event-5", execution_id: "execution-restored", event_name: "codex_finished", timestamp: "2026-08-10T01:04:15Z", status: "executing", message: "Codex finished", metadata: {} },
        { event_id: "event-6", execution_id: "execution-restored", event_name: "testing_started", timestamp: "2026-08-10T01:04:16Z", status: "testing", message: "Testing started", metadata: {} },
      ],
    });

    render(<SinoFounderAIApp />);

    await waitFor(() => expect(getFounderExecution).toHaveBeenCalledWith("execution-restored"));
    expect(await screen.findByText("testing", { selector: '[data-status="testing"]' })).toBeTruthy();
    expect(screen.getByRole("button", { name: "已授权" })).toBeTruthy();
    expect(document.querySelector('time[datetime="2026-08-10T01:04:16Z"]')).toBeTruthy();
  });

  it("renders roadmap, capability blueprints, and strategic actions", async () => {
    getFounderStrategy.mockResolvedValue({
      current_phase: "AI System Builder",
      current_strategic_position: "Founder intelligence is active",
      recommended_next_phase: "AI System Builder",
      roadmap: { milestones: [{ phase: "Founder Intelligence Foundation", status: "completed" }, { phase: "AI System Builder", status: "current" }] },
      capability_status: { applications: [{ key: "founder_ai", name: "Sino Founder AI", status: "active", role: "Strategic intelligence" }, { key: "operator_ai", name: "Operator AI", status: "blueprint", role: "Commerce operations" }] },
      recommendations: [{ title: "Build AI System Builder", reason: "具备系统创建基础", priority: 1, requires_approval: true }],
    });
    render(<SinoFounderAIApp />);
    expect(await screen.findByText("AI System Builder", { selector: ".sino-strategy-card--overview > strong" })).toBeTruthy();
    expect(screen.getByText("Operator AI")).toBeTruthy();
    expect(screen.getByText("blueprint")).toBeTruthy();
    expect(screen.getByText("Build AI System Builder")).toBeTruthy();
    expect(screen.getByText("等待 Founder 授权")).toBeTruthy();
  });

  it("builds a system blueprint and hands its execution plan to Founder approval", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-builder" });
    buildSystemBlueprint.mockResolvedValue({
      system_blueprint: { system_key: "operator_ai", system_name: "Operator AI", purpose: "创建 Operator AI" },
      generated_capabilities: { capabilities: ["Operations Planning"], agents: ["Operator Lead Agent"], skills: ["Operations Planning Skill"], workflows: ["Approval Workflow"] },
      agent_architecture: { roles: [{ role: "Operator Lead Agent" }] },
      task_asset_draft: { title: "Build Operator AI", description: "Approved blueprint build", scope: { target_application: "operator_ai" } },
      execution_package: { goal: "Build Operator AI", commit_requirement: "Founder approval required before commit" },
    });
    createTaskAsset.mockResolvedValue({ id: "task-operator" });
    createFounderExecution.mockResolvedValue({ id: "execution-operator", status: "draft" });
    render(<SinoFounderAIApp />);
    fireEvent.change(screen.getByLabelText("AI System Goal"), { target: { value: "创建 Operator AI" } });
    fireEvent.click(screen.getByRole("button", { name: "生成 Blueprint" }));
    expect(await screen.findByText("Operator AI", { selector: ".sino-builder-flow strong" })).toBeTruthy();
    expect(buildSystemBlueprint).toHaveBeenCalledWith("创建 Operator AI", "conv-builder");
    expect(createFounderExecution).toHaveBeenCalledWith("task-operator", expect.objectContaining({ goal: "Build Operator AI" }));
    expect(screen.getByRole("button", { name: "批准执行" }).disabled).toBe(false);
    expect(screen.getByText("等待 Founder 授权", { selector: ".sino-builder-flow strong" })).toBeTruthy();
  });
});
