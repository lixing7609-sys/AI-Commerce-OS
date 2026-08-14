/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetLifecycleCenter, LifecycleExecutionCenter, LifecycleOverview } from "./AssetLifecycleCenter.jsx";
import { getLifecycleAsset, getLifecycleAssets, getLifecycleExecutions, getLifecycleLearnings, reuseLifecycleAsset, startLifecycleExecution } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({
  createExecutionLearning: vi.fn(), getLifecycleAsset: vi.fn(), getLifecycleAssets: vi.fn(), getLifecycleExecutions: vi.fn(), getLifecycleLearnings: vi.fn(), reuseLifecycleAsset: vi.fn(), startLifecycleExecution: vi.fn(),
}));

const asset = { asset_id: "asset-1", asset_type: "skill", native_id: "asset-1", name: "AI 短剧 Skill", purpose: "复用短剧能力", status: "committed", version: 1, source_conversation_id: "conv-1", source_package_id: "package-1", dependency_refs: [], execution_refs: [], learning_refs: [], reference_count: 0, updated_at: "2026-08-14T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks(); getLifecycleAssets.mockResolvedValue({ assets: [asset] }); getLifecycleAsset.mockResolvedValue(asset); startLifecycleExecution.mockResolvedValue({ execution_id: "execution-1" }); reuseLifecycleAsset.mockResolvedValue({ reference_id: "ref-1" }); getLifecycleExecutions.mockResolvedValue({ executions: [] }); getLifecycleLearnings.mockResolvedValue({ learnings: [] });
});
afterEach(cleanup);

describe("AssetLifecycleCenter", () => {
  it("renders only formal asset detail and starts a real execution", async () => {
    const open = vi.fn(); render(<AssetLifecycleCenter conversationId="conv-1" projectId="project-1" onOpenExecution={open} />);
    fireEvent.click(await screen.findByText("AI 短剧 Skill"));
    await screen.findByText("package-1");
    fireEvent.click(screen.getByText("进入执行"));
    await waitFor(() => expect(startLifecycleExecution).toHaveBeenCalledWith("asset-1"));
    expect(open).toHaveBeenCalledWith({ execution_id: "execution-1" });
  });

  it("creates a reuse reference instead of copying the asset", async () => {
    const { container } = render(<AssetLifecycleCenter conversationId="conv-1" projectId="project-1" />);
    fireEvent.click(await within(container).findByText("AI 短剧 Skill")); await within(container).findByText("package-1");
    fireEvent.click(screen.getByText("引用到当前目标"));
    await waitFor(() => expect(reuseLifecycleAsset).toHaveBeenCalledWith("asset-1", "conversation", "conv-1", expect.any(String)));
  });

  it("keeps execution results in Execution Center", async () => {
    getLifecycleExecutions.mockResolvedValue({ executions: [{ execution_id: "execution-1", asset_id: "asset-1", asset_name: "AI 短剧 Skill", status: "completed", result: { exit_code: 0 } }] });
    const { container } = render(<LifecycleExecutionCenter />);
    expect(await within(container).findByText("AI 短剧 Skill · 执行")).toBeTruthy();
    expect(within(container).getByText("成功")).toBeTruthy();
  });

  it("provides the complete clickable lifecycle", () => {
    const navigate = vi.fn(); const { container } = render(<LifecycleOverview onNavigate={navigate} />);
    fireEvent.click(within(container).getByText("Learning")); expect(navigate).toHaveBeenCalledWith("learning");
  });
});
