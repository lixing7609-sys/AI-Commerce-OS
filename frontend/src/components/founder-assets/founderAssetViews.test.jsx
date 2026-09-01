// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ArtifactAssetList } from "./ArtifactAssetList.jsx";
import { MemoryAssetList } from "./MemoryAssetList.jsx";
import { TaskAssetList } from "./TaskAssetList.jsx";
import { MODULE_COMPONENTS } from "../../console/moduleRegistry.jsx";
import { getArtifacts } from "../../services/artifactApi.js";
import { getMemoryList } from "../../services/memoryReadService.js";
import { getTaskAssets } from "../../services/taskAssetApi.js";

vi.mock("../../services/taskAssetApi.js", () => ({ getTaskAssets: vi.fn() }));
vi.mock("../../services/artifactApi.js", () => ({ getArtifacts: vi.fn() }));
vi.mock("../../services/memoryReadService.js", () => ({ getMemoryList: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("Founder canonical asset views", () => {
  it("registers task, artifact, and memory routes", () => {
    expect(MODULE_COMPONENTS.founderTasks).toBeTypeOf("function");
    expect(MODULE_COMPONENTS.founderArtifacts).toBeTypeOf("function");
    expect(MODULE_COMPONENTS.founderMemory).toBeTypeOf("function");
  });

  it("calls TaskAsset API and renders empty state", async () => {
    getTaskAssets.mockResolvedValue([]);
    render(<TaskAssetList />);
    await waitFor(() => expect(getTaskAssets).toHaveBeenCalledTimes(1));
    expect(screen.getByText("暂无任务资产。")).toBeTruthy();
  });

  it("renders ArtifactAsset API data", async () => {
    getArtifacts.mockResolvedValue([{ id: "a1", title: "首页方案", artifact_type: "document", version: 2, status: "active", location: "/docs" }]);
    render(<ArtifactAssetList />);
    expect(await screen.findByText("首页方案")).toBeTruthy();
    expect(getArtifacts).toHaveBeenCalledTimes(1);
  });

  it("renders MemoryAsset error state", async () => {
    getMemoryList.mockRejectedValue(new Error("offline"));
    render(<MemoryAssetList />);
    expect(await screen.findByText("记忆资产加载失败，请稍后重试。")).toBeTruthy();
  });

  it("renders MemoryAsset data through the shared canonical frontend shape", async () => {
    getMemoryList.mockResolvedValue({
      source: "memory_asset",
      items: [{ id: "memory-1", memory_id: "memory-1", title: "Founder learning", memory_type: "learning", summary: "Stable shape", confidence: 0.8, status: "active" }],
    });
    render(<MemoryAssetList />);
    expect(await screen.findByText("Founder learning")).toBeTruthy();
    expect(screen.getByText("learning")).toBeTruthy();
    expect(screen.getByText("Stable shape")).toBeTruthy();
    expect(getMemoryList).toHaveBeenCalledTimes(1);
  });
});
