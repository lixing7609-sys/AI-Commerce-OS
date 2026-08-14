// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SinoBrainContext } from "./SinoBrainContext.jsx";

describe("SinoBrainContext", () => {
  afterEach(cleanup);
  it("renders a reviewable Goal Brief and confirmation gate", () => {
    const confirm = vi.fn();
    render(<SinoBrainContext brain={{ stage: "goal_review", goal_readiness: "reviewable", goal_brief: { goal: "我要做AI短剧", summary: "建立生产能力" } }} onConfirmGoal={confirm} />);
    expect(screen.getByText("Goal Brief")).toBeTruthy();
    expect(screen.getByText("我要做AI短剧")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认目标并开始讨论" }));
    expect(confirm).toHaveBeenCalled();
  });

  it("renders Goal Understanding and lets Founder stop clarification", () => {
    const force = vi.fn();
    render(<SinoBrainContext brain={{ stage: "goal_discovery", goal_readiness: "discovering", discovery: { working_understanding: { interpreted_goal: "AI 短剧生产能力", known_context: ["Founder 先验证"], non_blocking_unknowns: ["技术路线"] } }, goal_brief: { summary: "建立 AI 短剧生产能力", goal: "AI 短剧生产能力" } }} onForceReview={force} />);
    expect(screen.getAllByText("Goal Understanding · 目标理解")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "目标已经够清楚，开始讨论" }));
    expect(force).toHaveBeenCalled();
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
