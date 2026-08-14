// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCenter, CapabilityContext } from "./CapabilityWorkspace.jsx";
import { SystemBuilderPanel, SystemContext } from "./SystemBuilderPanel.jsx";
import { AssetContext, AssetLifecycleCenter, ExecutionContext, LifecycleExecutionCenter } from "./AssetLifecycleCenter.jsx";
import { getLifecycleAssets, getLifecycleExecutions } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ createExecutionLearning: vi.fn(), getLifecycleAsset: vi.fn(), getLifecycleAssets: vi.fn(), getLifecycleExecutions: vi.fn(), getLifecycleLearnings: vi.fn(), reuseLifecycleAsset: vi.fn(), startLifecycleExecution: vi.fn() }));

beforeEach(() => { getLifecycleAssets.mockResolvedValue({ assets: [] }); getLifecycleExecutions.mockResolvedValue({ executions: [] }); });
afterEach(cleanup);

describe("Founder shared three-column page layout", () => {
  it.each([
    ["能力详情", <CapabilityCenter />, <CapabilityContext />],
    ["系统上下文", <SystemBuilderPanel />, <SystemContext />],
    ["执行详情", <LifecycleExecutionCenter />, <ExecutionContext />],
    ["资产详情", <AssetLifecycleCenter />, <AssetContext />],
  ])("keeps %s outside the Primary Workspace", async (title, primary, inspector) => {
    const { container } = render(<><div data-primary>{primary}</div><aside data-context>{inspector}</aside></>);
    expect(container.querySelector("[data-primary] .sino-asset-detail")).toBeNull();
    expect(container.querySelector("[data-primary] .sino-primary-list")).toBeTruthy();
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(container.querySelector("[data-context] .sino-workspace-inspector")).toBeTruthy();
  });
});
