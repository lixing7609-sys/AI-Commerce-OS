// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ArtifactAssetList } from "./ArtifactAssetList.jsx";
import { MemoryAssetList } from "./MemoryAssetList.jsx";
import { TaskAssetList } from "./TaskAssetList.jsx";
import { MODULE_COMPONENTS } from "../../console/moduleRegistry.jsx";
import { getArtifacts } from "../../services/artifactApi.js";
import { getMemories } from "../../services/memoryApi.js";
import { getTaskAssets } from "../../services/taskAssetApi.js";

vi.mock("../../services/taskAssetApi.js", () => ({ getTaskAssets: vi.fn() }));
vi.mock("../../services/artifactApi.js", () => ({ getArtifacts: vi.fn() }));
vi.mock("../../services/memoryApi.js", () => ({ getMemories: vi.fn() }));

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
    getMemories.mockRejectedValue(new Error("offline"));
    render(<MemoryAssetList />);
    expect(await screen.findByText("记忆资产加载失败，请稍后重试。")).toBeTruthy();
  });
});
