// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageModelProbeDecisionCard } from "./ImageModelProbeDecisionCard.jsx";

afterEach(cleanup);
const loop = { status: "founder_gate_required", task_id: "task-1" };

describe("ImageModelProbeDecisionCard", () => {
  it("shows bounded Founder actions without a Continue action", () => {
    render(<ImageModelProbeDecisionCard loop={loop} busy={false} onDecision={vi.fn()} />);
    expect(screen.getByRole("button", { name: "批准有限 Probe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "修改授权边界" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "驳回" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
    expect(screen.getByText("Existing credential references only")).toBeTruthy();
    expect(screen.getAllByText("None")).toHaveLength(2);
  });

  it("submits approve and reject boundaries directly", () => {
    const decide = vi.fn();
    render(<ImageModelProbeDecisionCard loop={loop} busy={false} onDecision={decide} />);
    fireEvent.click(screen.getByRole("button", { name: "批准有限 Probe" }));
    expect(decide).toHaveBeenCalledWith("approve", expect.objectContaining({ max_probe_candidate_count: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    expect(decide).toHaveBeenCalledWith("reject", expect.any(Object));
  });

  it("allows a compact boundary revision", () => {
    const decide = vi.fn();
    render(<ImageModelProbeDecisionCard loop={loop} busy={false} onDecision={decide} />);
    fireEvent.click(screen.getByRole("button", { name: "修改授权边界" }));
    fireEvent.change(screen.getByLabelText("最大 Probe 候选数"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存授权边界" }));
    expect(decide).toHaveBeenCalledWith("modify", expect.objectContaining({ max_probe_candidate_count: 2 }));
  });

  it("renders the durable approved state without offering a second decision", () => {
    render(<ImageModelProbeDecisionCard loop={{ status: "model_probe_queued", founder_probe_decision: { approval_status: "approved" } }} busy={false} onDecision={vi.fn()} />);
    expect(screen.getByText("approved")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "批准有限 Probe" })).toBeNull();
  });
});
