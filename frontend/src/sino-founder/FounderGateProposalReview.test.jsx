// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FounderGateProposalReview } from "./FounderGateProposalReview.jsx";

const proposal = {
  proposal_id: "founder-gate-proposal-1", gate_type: "runtime_environment_binding", title: "Runtime Environment Recommendation", status: "ready_for_review", version: 2, execution_package_id: "execution-package-1", decision_ready: false,
  decision_readiness: { discovery_status: "completed", recommendation_status: "requires_discovery_resolution", resolution_status: "blocked", last_resolution_reason: "A required external fact is unavailable.", blocking_unknowns: [{ field: "provider", label: "Runtime Provider / Type", reason: "No approved provider." }], founder_decisions_required: [] },
  content: {
    known: [{ label: "Founder Approval", value: "approved" }],
    recommended: { name: "Isolated runtime candidate", why: "Keep production isolated.", provider: "Unknown", target_environment: "Unknown", resource_recommendations: [{ logical_dependency: "storage", recommended_target: "Current development database", classification: "ACTIVE", approved_for_package: false }], new_credential: "Unknown", new_cost: "Unknown", production_impact: "Unknown", external_side_effect: "Unknown", rollback_isolation: "Isolated and reversible", confidence: "low" },
    environment_discovery: { mode: "read_only", candidate_options: [{ option_id: "reuse", name: "Evaluate isolated reuse", constraint: "Not approved yet." }], external_side_effects_performed: false },
  },
};

describe("FounderGateProposalReview", () => {
  afterEach(cleanup);
  it("renders a Founder business view with technical evidence collapsed", () => {
    render(<FounderGateProposalReview proposal={proposal} />);
    expect(screen.getByText("推荐方案")).toBeTruthy();
    expect(screen.getByText("运行位置")).toBeTruthy();
    expect(screen.getAllByText("Evaluate isolated reuse").length).toBeGreaterThan(0);
    const details = screen.getByText("Technical Details / Evidence").closest("details");
    expect(details.open).toBe(false);
    expect(screen.queryByText("label")).toBeNull();
    expect(screen.queryByText("value")).toBeNull();
  });
  it("disables approval while blocking unknowns remain", () => {
    const review = vi.fn(); render(<FounderGateProposalReview proposal={proposal} onReview={review} />);
    const approve = screen.getByRole("button", { name: "运行环境方案尚不可批准" });
    expect(approve.disabled).toBe(true); fireEvent.click(approve); expect(review).not.toHaveBeenCalled();
    expect(screen.getByText("Runtime Provider / Type")).toBeTruthy();
  });
  it("enables approval when only the Founder decision remains", () => {
    const ready = { ...proposal, decision_ready: true, decision_readiness: { ...proposal.decision_readiness, resolution_status: "decision_ready", blocking_unknowns: [], founder_decisions_required: [{ decision: "approve", label: "批准推荐方案", reason: "Authorizes boundary." }] }, content: { ...proposal.content, architecture_candidate: { name: "Minimum Non-Production Runtime V1", runtime_type: "provider-independent", target_environment_type: "isolated non-production", storage_strategy: "project-scoped storage", compute_strategy: "isolated process", iam_strategy: "project identity", network_strategy: "private boundary", credential_strategy: "project service identity", cost_model: "no unapproved spend", external_side_effects: "isolated resources after approval", production_impact: "none", isolation_strategy: "project scoped", rollback_strategy: "remove isolated bindings", confidence: .8, risks: ["validate isolation"] } } };
    const review = vi.fn(); render(<FounderGateProposalReview proposal={ready} onReview={review} />);
    expect(screen.getByLabelText("Architecture Candidate")).toBeTruthy();
    expect(screen.getByText("Minimum Non-Production Runtime V1")).toBeTruthy();
    expect(screen.getByText("需要 Founder 决策")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准推荐方案" })); expect(review).toHaveBeenCalledWith(ready, "approve");
  });
  it("renders four-layer reusable decision contracts for runtime authorizations", () => {
    const decisions = [
      { decision: "credential_source", label: "Credential Authorization" },
      { decision: "cost_boundary", label: "Cost Authorization" },
      { decision: "external_side_effect_boundary", label: "External Side Effect Authorization" },
      { decision: "production_impact", label: "Production Impact Authorization" },
    ];
    const ready = { ...proposal, decision_ready: true, decision_readiness: { ...proposal.decision_readiness, resolution_status: "decision_ready", blocking_unknowns: [], founder_decisions_required: decisions } };
    render(<FounderGateProposalReview proposal={ready} />);
    expect(screen.getAllByText("Recommendation")).toHaveLength(4);
    expect(screen.getAllByText("Approval Scope")).toHaveLength(4);
    expect(screen.getAllByText("Boundary")).toHaveLength(4);
    expect(screen.getAllByText("Escalation Rule")).toHaveLength(4);
    expect(screen.getByText(/不读取、不展示、不复制 Credential 内容/)).toBeTruthy();
    expect(screen.getByText(/incremental external cost = 0/)).toBeTruthy();
    expect(screen.getByText(/actual side effects = 0/)).toBeTruthy();
    expect(screen.getByText(/production configuration/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "批准推荐方案" }).disabled).toBe(false);
  });
  it("uses an explicit generic decision contract when supplied by another gate", () => {
    const ready = { ...proposal, gate_type: "deployment_authorization", decision_ready: true, decision_readiness: { ...proposal.decision_readiness, blocking_unknowns: [], founder_decisions_required: [{ decision: "deployment", label: "Deployment Authorization", decision_contract: { recommendation: "Deploy the reviewed release.", approval_scope: "Staging only.", boundary: "No production access.", escalation_rule: "Return to Founder Gate for production." } }] } };
    render(<FounderGateProposalReview proposal={ready} />);
    expect(screen.getByText("Deploy the reviewed release.")).toBeTruthy();
    expect(screen.getByText("Staging only.")).toBeTruthy();
    expect(screen.getByText("No production access.")).toBeTruthy();
    expect(screen.getByText("Return to Founder Gate for production.")).toBeTruthy();
  });
  it("returns the same proposal to discussion", () => { const review = vi.fn(); render(<FounderGateProposalReview proposal={proposal} onReview={review} />); fireEvent.click(screen.getByRole("button", { name: "返回讨论 / 修改方案" })); expect(review).toHaveBeenCalledWith(proposal, "revise"); });
  it("shows proposal loading state", () => { render(<FounderGateProposalReview />); expect(screen.getByRole("status").textContent).toContain("正在准备可审核方案"); });
  it("keeps a long review scrollable and the dashboard independent", () => {
    const longProposal = { ...proposal, decision_readiness: { ...proposal.decision_readiness, blocking_unknowns: Array.from({ length: 30 }, (_, index) => ({ field: `field-${index}`, label: `Unknown ${index}`, reason: "Still being discovered" })) } };
    render(<div className="sino-founder-shell"><main className="sino-founder-main sino-founder-main--fixed-workspace"><FounderGateProposalReview proposal={longProposal} /></main><aside className="sino-founder-context"><div aria-label="Brain Dashboard">Brain Dashboard</div></aside></div>);
    const scrollContainer = screen.getByRole("region", { name: "Founder Gate Proposal" });
    expect(scrollContainer.dataset.scrollContainer).toBe("founder-gate-proposal"); expect(scrollContainer.tabIndex).toBe(0);
    expect(scrollContainer.contains(screen.getByRole("button", { name: "运行环境方案尚不可批准" }))).toBe(true);
    expect(scrollContainer.contains(screen.getByRole("button", { name: "返回讨论 / 修改方案" }))).toBe(true);
    expect(screen.getByLabelText("Brain Dashboard")).toBeTruthy();
  });
});
