// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemBuilderPanel } from "./SystemBuilderPanel.jsx";
import { getLifecycleAssets } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getLifecycleAssets: vi.fn() }));
afterEach(cleanup);

describe("System Builder IA", () => {
  it("shows existing project assets and explicit missing structure", async () => {
    getLifecycleAssets.mockResolvedValue({ assets: [
      { asset_id: "project-1", asset_type: "project", name: "AI短剧生产系统", status: "committed", version: 1 },
      { asset_id: "workflow-1", asset_type: "workflow", name: "AI短剧生产主流程", status: "committed", version: 1 },
    ] });
    render(<SystemBuilderPanel />);
    expect((await screen.findAllByText("AI短剧生产系统")).length).toBe(2);
    expect(screen.getByText("AI短剧生产主流程")).toBeTruthy();
    expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
    expect(screen.queryByText("待生成")).toBeNull();
  });
});
