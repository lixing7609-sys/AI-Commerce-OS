// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCenter } from "./CapabilityWorkspace.jsx";
import { getLifecycleAsset, getLifecycleAssets } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getLifecycleAsset: vi.fn(), getLifecycleAssets: vi.fn() }));
const skill = { asset_id: "asset-skill", asset_type: "skill", name: "Character Consistency", purpose: "保持角色跨镜头一致性", status: "committed", version: 2, used_by_refs: ["Studio AI"], dependency_refs: [] };

describe("AI Capability Center IA", () => {
  beforeEach(() => { getLifecycleAssets.mockResolvedValue({ assets: [skill, { asset_id: "decision-1", asset_type: "decision", name: "不应显示" }] }); getLifecycleAsset.mockResolvedValue(skill); });
  afterEach(cleanup);
  it("reads the formal Asset Catalog and excludes non-capability assets", async () => {
    render(<CapabilityCenter />);
    fireEvent.click(await screen.findByRole("button", { name: /Character Consistency/ }));
    await waitFor(() => expect(getLifecycleAsset).toHaveBeenCalledWith("asset-skill"));
    expect(screen.queryByText("不应显示")).toBeNull();
    expect(screen.getByText("Studio AI")).toBeTruthy();
  });
  it("keeps one asset identity across cross-page actions", async () => {
    const openAsset = vi.fn(); render(<CapabilityCenter onNavigateAsset={openAsset} />);
    fireEvent.click(await screen.findByRole("button", { name: /Character Consistency/ }));
    fireEvent.click(await screen.findByRole("button", { name: "查看资产记录" }));
    expect(openAsset).toHaveBeenCalledWith(expect.objectContaining({ asset_id: "asset-skill" }));
  });
});
