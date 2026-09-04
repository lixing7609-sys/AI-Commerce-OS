// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilityLifecycleCard } from "./CapabilityLifecycleCard.jsx";

const base = { asset_id: "skill-1", asset_type: "skill", domain_id: "commerce", name: "商品分镜生成 Skill", version: 1, development_run_refs: [], test_run_refs: [] };

describe("Capability lifecycle presentation", () => {
  afterEach(cleanup);
  it("binds Candidate actions to the exact backend target", () => {
    const onAction = vi.fn();
    render(<CapabilityLifecycleCard asset={{ ...base, status: "candidate", available_actions: ["develop", "archive", "continue_discussion"] }} action={{ target_asset_id: "skill-1", description: "开发这个 Skill" }} onAction={onAction} />);
    expect(screen.getByText("候选")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "运行真实测试" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "开发" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action_id: "develop", target_asset_id: "skill-1" }));
  });

  it("shows real test evidence and Ready approval only when returned by backend", () => {
    render(<CapabilityLifecycleCard asset={{ ...base, status: "testing", available_actions: ["approve_ready", "retest"], test_run_refs: [{ test_run_id: "test-1", status: "passed", input: { platform: "抖音" }, expected: { shots: true }, actual: { shots: 6 }, evidence: ["结构化分镜包含 6 个镜头"] }] }} />);
    expect(screen.getByText("✓ 测试通过")).toBeTruthy();
    expect(screen.getByText(/结构化分镜包含 6 个镜头/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "批准为可引用能力" })).toBeTruthy();
  });

  it("renders a lifecycle conflict as a business explanation", () => {
    render(<CapabilityLifecycleCard asset={{ ...base, status: "developing", available_actions: ["view_development"] }} error="当前能力尚未完成开发，不能测试。" />);
    expect(screen.getByRole("alert").textContent).toContain("尚未完成开发");
    expect(screen.queryByText(/状态码 409/)).toBeNull();
  });
});
