// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryWorkspace, normalizeLibraryItems } from "./LibraryWorkspace.jsx";
import { getAssetMemoryCenter, getLifecycleAssets } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getAssetMemoryCenter: vi.fn(), getLifecycleAssets: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const assets = [
  { asset_id: "agent-1", asset_type: "agent", name: "Sino AI Secretary", purpose: "Founder 日常助手", version: 2, updated_at: "2026-08-21T10:00:00Z" },
  { asset_id: "skill-1", asset_type: "skill", name: "Capability Search", purpose: "检索能力", version: 1, updated_at: "2026-08-20T10:00:00Z" },
  { asset_id: "workflow-1", asset_type: "workflow", name: "Release Workflow", purpose: "发布流程", version: 1 },
  { asset_id: "prompt-1", asset_type: "prompt", name: "Founder Discussion Prompt", purpose: "自然讨论", version: 3 },
  { asset_id: "capability-1", asset_type: "capability", name: "Commerce Reasoning", purpose: "电商推理", version: 1 },
];
const artifacts = [
  { artifact_id: "image-1", title: "Workspace Screenshot", artifact_type: "image/png", version: 1 },
  { artifact_id: "doc-1", title: "Runtime Environment Proposal", artifact_type: "document", version: 3 },
];

describe("Sino Library Workspace", () => {
  it("normalizes existing lifecycle assets and persisted artifacts without copying records", () => {
    expect(normalizeLibraryItems(assets, artifacts).map((item) => item.type)).toEqual(expect.arrayContaining(["agent", "skill", "workflow", "prompt", "capability", "image", "document"]));
  });

  it("renders the complete filter set as a card grid and filters locally", async () => {
    getLifecycleAssets.mockResolvedValue({ assets });
    getAssetMemoryCenter.mockResolvedValue({ artifacts, memories: [], executions: [] });
    render(<LibraryWorkspace />);
    for (const label of ["全部", "Agent", "Skill", "Workflow", "Prompt", "Capability", "图片", "文档"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(document.querySelectorAll(".sino-library-card")).toHaveLength(7));
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    expect(screen.getByText("Sino AI Secretary")).toBeTruthy();
    expect(screen.queryByText("Capability Search")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Skill" }));
    expect(screen.getByText("Capability Search")).toBeTruthy();
    expect(screen.queryByText("Sino AI Secretary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Capability" }));
    expect(screen.getByText("Commerce Reasoning")).toBeTruthy();
  });
});
