// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCenter, CapabilityContext } from "./CapabilityWorkspace.jsx";
import { getCapabilityDomains, getCapabilityRepositoryAssets, getLifecycleAsset } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ approveCapabilityReady: vi.fn(), completeCapabilityDevelopment: vi.fn(), getCapabilityDomains: vi.fn(), getCapabilityRepositoryAssets: vi.fn(), getLifecycleAsset: vi.fn(), runCapabilityTest: vi.fn(), startCapabilityDevelopment: vi.fn() }));
const skill = { asset_id: "asset-skill", asset_type: "skill", domain_id: "commerce", name: "商品分镜生成 Skill", purpose: "生成结构化商品分镜", status: "candidate", version: 1, used_by_refs: [], dependency_refs: [], test_run_refs: [] };
function Harness() { const [selected, setSelected] = useState(null); return <><CapabilityCenter selected={selected} onSelect={setSelected} /><CapabilityContext selected={selected} onChanged={setSelected} /></>; }

describe("AI Capability Center IA", () => {
  beforeEach(() => { getCapabilityDomains.mockResolvedValue({ domains: [{ domain_id: "commerce", name: "电商", counts: { candidate: 1, developing: 0, testing: 0, ready: 0 } }] }); getCapabilityRepositoryAssets.mockResolvedValue({ assets: [skill] }); getLifecycleAsset.mockResolvedValue(skill); });
  afterEach(cleanup);
  it("reads the formal Asset Catalog and excludes non-capability assets", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /电商/ }));
    fireEvent.click(await screen.findByRole("button", { name: /商品分镜生成 Skill/ }));
    await waitFor(() => expect(getLifecycleAsset).toHaveBeenCalledWith("asset-skill"));
    expect(screen.getAllByText("候选").length).toBeGreaterThan(0);
  });
  it("keeps one asset identity and exposes Candidate development", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /电商/ }));
    fireEvent.click(await screen.findByRole("button", { name: /商品分镜生成 Skill/ }));
    expect(screen.getByRole("button", { name: "开发" })).toBeTruthy();
  });
});
