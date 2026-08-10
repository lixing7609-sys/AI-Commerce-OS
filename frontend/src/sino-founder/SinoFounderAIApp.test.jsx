// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SinoFounderAIApp from "./SinoFounderAIApp.jsx";
import { analyzeWithSinoBrain, createFounderConversation, createFounderExecution, getFounderBriefing, getFounderStrategy } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";

vi.mock("../services/founderAiApi.js", () => ({
  createFounderConversation: vi.fn(), analyzeWithSinoBrain: vi.fn(),
  createFounderExecution: vi.fn(), approveFounderExecution: vi.fn(), executeFounderExecution: vi.fn(), getFounderBriefing: vi.fn(), getFounderStrategy: vi.fn(),
}));
vi.mock("../services/taskAssetApi.js", () => ({ createTaskAsset: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  getFounderBriefing.mockResolvedValue({ status: "ready", progress: { completed: 0, total: 0, percent: 0 }, risks: [], recommendations: [], project_state: { current_phase: "planning", completed_capabilities: [], active_tasks: [], blocked_items: [] } });
  getFounderStrategy.mockResolvedValue({ current_phase: "Founder Intelligence Foundation", roadmap: { milestones: [] }, capability_status: { applications: [] }, recommendations: [] });
});
afterEach(() => cleanup());

describe("SinoFounderAIApp", () => {
  it("renders the independent application workspace", () => {
    render(<SinoFounderAIApp />);
    expect(screen.getByText("Sino", { selector: ".sino-brand div" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "把目标变成可控的执行" })).toBeTruthy();
    expect(screen.getByTestId("goal-analysis-card")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sino Founder AI" })).toBeTruthy();
  });

  it("turns a Founder goal into Brain cards and a canonical execution session", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-1" });
    analyzeWithSinoBrain.mockResolvedValue({
      goal_analysis: { goal_type: "development", objective: "继续推进 AI Commerce OS", current_phase: "execution" },
      task_plan: [{ title: "完成 Intelligence Core" }],
      recommended_action: "执行下一项任务",
      task_asset_draft: { title: "继续推进 AI Commerce OS", description: "Founder plan", scope: { goal_type: "development" } },
      execution_package: { goal: "继续推进 AI Commerce OS" },
    });
    createTaskAsset.mockResolvedValue({ id: "task-asset-1" });
    createFounderExecution.mockResolvedValue({ id: "execution-1", status: "draft" });

    render(<SinoFounderAIApp />);
    fireEvent.change(screen.getByLabelText("告诉 Sino 你想完成什么"), { target: { value: "继续推进 AI Commerce OS" } });
    fireEvent.click(screen.getByRole("button", { name: "分析目标" }));

    await waitFor(() => expect(createFounderExecution).toHaveBeenCalledWith("task-asset-1", { goal: "继续推进 AI Commerce OS" }));
    expect(createTaskAsset).toHaveBeenCalledWith({
      title: "继续推进 AI Commerce OS",
      description: "Founder plan",
      scope: { goal_type: "development" },
      conversation_id: "conv-1",
    });
    expect(screen.getAllByText("继续推进 AI Commerce OS").length).toBeGreaterThan(0);
    expect(screen.getByText("完成 Intelligence Core")).toBeTruthy();
    expect(screen.getByText("下一步 · 执行下一项任务")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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
});
