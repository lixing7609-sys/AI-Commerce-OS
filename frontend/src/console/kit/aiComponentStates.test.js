import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AIRecommendation } from "./AIRecommendation.jsx";
import { AIRiskAlert } from "./AIRiskAlert.jsx";
import { AIConfidence } from "./AIConfidence.jsx";
import { AIActionApproval } from "./AIActionApproval.jsx";
import { AIExecutionStatus } from "./AIExecutionStatus.jsx";

/**
 * ai-interaction-language.md design rules, verified directly:
 * components are plain functions returning React elements, so calling
 * them outside a renderer still runs their body (including the DEV
 * console.warn guards) without needing jsdom — a recommendation must
 * not render without a reason, a risk alert must not render without
 * a concern, confidence must always carry a number.
 */
describe("AI component required states", () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("AIRecommendation warns in DEV when reason is missing (rule 1)", () => {
    AIRecommendation({ title: "补货", reason: "", priority: "P1" });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("AIRecommendation does not warn when reason is present", () => {
    AIRecommendation({ title: "补货", reason: "库存不足", priority: "P1" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("AIRiskAlert warns in DEV when concern is missing", () => {
    AIRiskAlert({ level: "high" });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("AIConfidence always renders the numeric value alongside the qualitative label (rule 5)", () => {
    const element = AIConfidence({ value: 92 });
    const rendered = JSON.stringify(element);
    expect(rendered).toContain("92");
  });

  it("AIActionApproval exposes inline approve/reject, not a link-out (rule 2)", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const element = AIActionApproval({ onApprove, onReject });
    const buttons = element.props.children;
    expect(Array.isArray(buttons)).toBe(true);
    expect(element.props.children.length).toBeGreaterThanOrEqual(2);
  });

  it("AIExecutionStatus requires explicit step detail, not a bare spinner", () => {
    const element = AIExecutionStatus({ steps: ["生成建议", "同步系统"], currentStep: 0, state: "running" });
    expect(element.props.children.length).toBe(2);
  });
});
