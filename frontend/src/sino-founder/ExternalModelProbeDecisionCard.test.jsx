// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalModelProbeDecisionCard } from "./ExternalModelProbeDecisionCard.jsx";

const gate = { gate_type: "EXTERNAL_MODEL_PROBE", decision: "pending", requested_scope: { provider_scope: ["gpt"], model_scope: ["gpt:model-a"], max_candidates: 1, max_probe_count: 1 } };
afterEach(cleanup);

describe("ExternalModelProbeDecisionCard", () => {
  it("shows the bounded reason, scope and three Founder decisions", () => {
    render(<ExternalModelProbeDecisionCard gate={gate} busy={false} onDecision={vi.fn()} />);
    expect(screen.getByText(/本地配置检查已经完成/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "批准有限 Probe" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "修改授权边界" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "驳回" })).toBeTruthy();
  });

  it("submits an edited boundary without approving it", () => {
    const decide = vi.fn();
    render(<ExternalModelProbeDecisionCard gate={gate} busy={false} onDecision={decide} />);
    fireEvent.click(screen.getByRole("button", { name: "修改授权边界" }));
    fireEvent.change(screen.getByLabelText("最大候选数"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存授权边界" }));
    expect(decide).toHaveBeenCalledWith("modify", expect.objectContaining({ max_candidates: 2 }));
  });

  it("does not render decisions after rejection", () => {
    render(<ExternalModelProbeDecisionCard gate={{ ...gate, decision: "rejected" }} busy={false} onDecision={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "批准有限 Probe" })).toBeNull();
  });
});
