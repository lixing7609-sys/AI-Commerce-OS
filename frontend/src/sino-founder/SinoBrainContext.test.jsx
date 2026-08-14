// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SinoBrainContext } from "./SinoBrainContext.jsx";

describe("SinoBrainContext", () => {
  afterEach(cleanup);
  it("renders a reviewable Goal Brief and confirmation gate", () => {
    const confirm = vi.fn();
    render(<SinoBrainContext brain={{ stage: "goal_review", goal_readiness: "reviewable", goal_brief: { goal: "我要做AI短剧", problem: "验证生产链" } }} onConfirmGoal={confirm} />);
    expect(screen.getByText("Goal Brief")).toBeTruthy();
    expect(screen.getByText("我要做AI短剧")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认目标" }));
    expect(confirm).toHaveBeenCalled();
  });

  it("shows one package with traceable objects and explicit approval", () => {
    const review = vi.fn();
    render(<SinoBrainContext brain={{ stage: "package_ready", goal_readiness: "confirmed", goal_brief: { goal: "AI 短剧" }, decision: { final_recommendation: "建立 Project 和最小 Workflow", confidence: .91 }, discussion_package: { package_id: "package-1", title: "AI 短剧生产系统", status: "pending_review", counts: { decision: 1, project: 1, workflow: 1 }, objects: [{ discussion_object_id: "item-1", object_type: "project", name: "AI 短剧", action: "create", purpose: "承载生产系统", source: "Decision", confidence: .91 }] } }} onReviewPackage={review} />);
    expect(screen.getAllByText("Discussion Package")).toHaveLength(1);
    expect(screen.getByText(/待 Founder 审批/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准成果包" }));
    expect(review).toHaveBeenCalledWith("approve");
  });
});
