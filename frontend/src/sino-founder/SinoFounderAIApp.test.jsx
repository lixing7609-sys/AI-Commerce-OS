// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SinoFounderAIApp from "./SinoFounderAIApp.jsx";
import { analyzeWithSinoBrain, createFounderConversation, createFounderExecution } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";

vi.mock("../services/founderAiApi.js", () => ({
  createFounderConversation: vi.fn(), analyzeWithSinoBrain: vi.fn(),
  createFounderExecution: vi.fn(), approveFounderExecution: vi.fn(), executeFounderExecution: vi.fn(),
}));
vi.mock("../services/taskAssetApi.js", () => ({ createTaskAsset: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
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
});
