// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConstitutionUnderstandingCard } from "./ConstitutionUnderstandingCard.jsx";

afterEach(() => cleanup());

describe("ConstitutionUnderstandingCard", () => {
  it("shows seven extracted system objects and exposes only Founder review actions", () => {
    const review = vi.fn();
    const objects = [
      ["Intelligence Evolution Layer", "foundation"], ["AI Commerce OS Cloud", "foundation"],
      ["Sino Founder AI", "application"], ["Sino Operator AI", "application"], ["Sino Studio AI", "application"],
      ["Sino Industrial AI", "application"], ["Sino Quant AI", "application"],
    ].map(([name, layer]) => ({ name, layer, role: `${layer} role` }));
    render(<ConstitutionUnderstandingCard understanding={{
      status: "pending_founder_review", core_definition: "核心定义",
      foundation_layer: objects.filter((item) => item.layer === "foundation"),
      application_layer: objects.filter((item) => item.layer === "application"), system_objects: objects,
      capability_lifecycle: ["Candidate", "Testing", "Ready"], capability_rules: ["只有 Ready 可以 Reuse"],
      founder_boundary: "Founder 边界", sino_boundary: "Sino 边界", shared_vs_isolated_principle: "共享隔离",
      execution_principle: "真实执行", validation_principle: "真实验证",
    }} onReview={review} />);
    expect(screen.getByText("从 Constitution 中识别出的系统结构")).toBeTruthy();
    expect(screen.getByText("System Objects · 7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认结构" }));
    fireEvent.click(screen.getByRole("button", { name: "返回讨论" }));
    expect(review.mock.calls).toEqual([["confirm_structure"], ["return_to_discussion"]]);
  });

  it("turns approved proposed work items into a selection list without inline decisions", () => {
    const select = vi.fn();
    const object = { name: "Sino Founder AI", layer: "application", role: "Application / Capability Creation" };
    render(<ConstitutionUnderstandingCard understanding={{
      status: "founder_approved", core_definition: "核心定义", foundation_layer: [], application_layer: [object], system_objects: [object],
      capability_lifecycle: ["Candidate", "Ready"], capability_rules: [], founder_boundary: "边界", sino_boundary: "边界",
      shared_vs_isolated_principle: "隔离", execution_principle: "执行", validation_principle: "验证",
      proposed_work_items: [{ work_item_id: "work-1", title: "Sino Founder AI", existing_state: "existing", reason: "来源于系统对象", recommended_action: "检查并完善边界", source: "system_objects:Sino Founder AI", founder_decision: "pending" }],
    }} selectedWorkItemId="work-1" onSelectWorkItem={select} />);
    const row = screen.getByRole("button", { name: /Sino Founder AI/ });
    expect(row.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(row);
    expect(select).toHaveBeenCalledWith("work-1");
    expect(screen.queryByRole("button", { name: "同意推进" })).toBeNull();
    expect(screen.queryByRole("button", { name: "继续讨论" })).toBeNull();
    expect(screen.queryByRole("button", { name: "暂不处理" })).toBeNull();
    expect(screen.getByText("已存在")).toBeTruthy();
    expect(screen.getByText("待判断").classList.contains("is-decision-pending")).toBe(true);
    expect(screen.queryByText("来源于系统对象")).toBeNull();
    expect(screen.queryByText("检查并完善边界")).toBeNull();
    expect(screen.queryByText("system_objects:Sino Founder AI")).toBeNull();
    const confirmed = screen.getByText("✓ Founder 已确认结构").closest("details");
    expect(confirmed.open).toBe(false);
  });

  it("keeps selection separate from an explicit approved decision", () => {
    const object = { name: "Intelligence Evolution Layer", layer: "foundation", role: "Foundation" };
    const { container } = render(<ConstitutionUnderstandingCard understanding={{ status: "founder_approved", core_definition: "核心", foundation_layer: [object], application_layer: [], system_objects: [object], capability_lifecycle: [], capability_rules: [], proposed_work_items: [{ work_item_id: "approved", title: "Intelligence Evolution Layer", existing_state: "existing", founder_decision: "approved" }, { work_item_id: "pending", title: "AI Commerce OS Cloud", existing_state: "not_found", founder_decision: "pending" }] }} selectedWorkItemId="pending" />);
    expect(screen.getByText("✓ 已同意推进").classList.contains("is-decision-approved")).toBe(true);
    expect(screen.getByText("待判断").classList.contains("is-decision-pending")).toBe(true);
    const selected = container.querySelector("article.is-selected");
    expect(selected.textContent).toContain("AI Commerce OS Cloud");
    expect(selected.textContent).toContain("待判断");
  });

  it("keeps work item selection locked until Gate 1 is confirmed", () => {
    const select = vi.fn();
    const object = { name: "Sino Founder AI", layer: "application", role: "Application" };
    render(<ConstitutionUnderstandingCard understanding={{ status: "pending_founder_review", core_definition: "核心", foundation_layer: [], application_layer: [object], system_objects: [object], capability_lifecycle: [], capability_rules: [], proposed_work_items: [{ work_item_id: "work-1", title: "Sino Founder AI", existing_state: "existing", reason: "原因", recommended_action: "动作", source: "system_objects:Sino Founder AI", founder_decision: "pending" }] }} onSelectWorkItem={select} />);
    expect(screen.getByRole("button", { name: /Sino Founder AI/ }).disabled).toBe(true);
  });
});
