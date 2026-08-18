// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCenter, CapabilityContext, DraftContext } from "./CapabilityWorkspace.jsx";
import { getCapabilityDomains, getCapabilityRepositoryAssets, getFounderDraft, getFounderDrafts, getLifecycleAsset, performConversationCapabilityAction } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getCapabilityDomains: vi.fn(), getCapabilityRepositoryAssets: vi.fn(), getFounderDraft: vi.fn(), getFounderDrafts: vi.fn(), getLifecycleAsset: vi.fn(), performConversationCapabilityAction: vi.fn() }));
const skill = { asset_id: "asset-skill", asset_type: "skill", domain_id: "commerce", name: "商品分镜生成 Skill", purpose: "生成结构化商品分镜", status: "candidate", version: 1, used_by_refs: [], dependency_refs: [], test_run_refs: [], available_actions: ["develop", "archive", "continue_discussion"] };
function Harness() { const [selected, setSelected] = useState(null); return <><CapabilityCenter section="lifecycle" selected={selected} onSelect={setSelected} /><CapabilityContext selected={selected} onChanged={setSelected} /></>; }

describe("AI Capability Center IA", () => {
  beforeEach(() => { getCapabilityDomains.mockResolvedValue({ domains: [{ domain_id: "commerce", name: "电商", counts: { candidate: 1, developing: 0, testing: 0, ready: 0 } }] }); getCapabilityRepositoryAssets.mockResolvedValue({ assets: [skill] }); getLifecycleAsset.mockResolvedValue(skill); getFounderDrafts.mockResolvedValue({ drafts: [] }); });
  afterEach(cleanup);
  it("uses the shortened capability-cycle label and Draft Center row cards for domains", async () => {
    const { container } = render(<Harness />);
    expect(screen.getByRole("button", { name: "能力周期" })).toBeTruthy();
    const domain = await screen.findByRole("button", { name: /电商/ });
    expect(domain.classList.contains("sino-workspace-row")).toBe(true);
    expect(container.querySelector(".sino-domain-list.sino-draft-list")).toBeTruthy();
  });
  it("reads the formal Asset Catalog and excludes non-capability assets", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /电商/ }));
    fireEvent.click(await screen.findByRole("button", { name: /商品分镜生成 Skill/ }));
    await waitFor(() => expect(getLifecycleAsset).toHaveBeenCalledWith("asset-skill"));
    expect(screen.getAllByText("候选").length).toBeGreaterThan(0);
  });
  it("keeps one asset identity and exposes Candidate development", async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /电商/ }));
    fireEvent.click(await screen.findByRole("button", { name: /商品分镜生成 Skill/ }));
    expect(screen.getByRole("button", { name: "开发" })).toBeTruthy();
  });
  it("uses the repository Ready action for the current Conversation", async () => {
    const ready = { ...skill, status: "ready", available_actions: ["reuse", "upgrade", "deprecate"], reference_count: 2 };
    performConversationCapabilityAction.mockResolvedValue({ asset: { ...ready, reference_count: 3 } });
    render(<CapabilityContext selected={ready} conversationId="conv-current" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "引用" }));
    await waitFor(() => expect(performConversationCapabilityAction).toHaveBeenCalledWith("conv-current", expect.objectContaining({ action: "reuse", target_asset_id: "asset-skill", target_id: "conv-current" })));
  });
});

describe("Draft Center", () => {
  afterEach(cleanup);
  it("defaults to Draft Center and opens the persisted Draft", async () => {
    const draft = { draft_id: "draft-1", title: "Foundation System Definition Draft", draft_type: "system_definition", status: "confirmed", project_name: "Foundation System", version: 2, structured_content: { sections: { core_responsibilities: ["evolve"] }, refinements: [{ source_cognitive_outcome_ref: "cognitive-refine", title: "Evaluation refinement", content: { weights: "dynamic" } }] }, source_conversation_id: "conv-canonical", source_cognitive_outcome_ref: "cognitive-real", source_cognitive_outcome_refs: ["cognitive-real", "cognitive-refine"], implementation: { plan_id: "plan-existing", status: "ready_for_execution_review", work_item_count: 7, execution_approval: "pending", next_step: "founder_execution_approval" } };
    getFounderDrafts.mockResolvedValue({ drafts: [draft] }); getFounderDraft.mockResolvedValue(draft);
    const approve = vi.fn(); const viewPlan = vi.fn();
    function DraftHarness() { const [selected, setSelected] = useState(null); return <><CapabilityCenter selectedDraft={selected} onSelectDraft={setSelected} /><DraftContext selected={selected} onApproveImplementation={approve} onViewImplementationPlan={viewPlan} onReturnConversation={vi.fn()} /></>; }
    render(<DraftHarness />);
    expect(await screen.findByRole("heading", { name: "草案中心" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Foundation System Definition Draft/ }));
    expect((await screen.findAllByRole("heading", { name: "Foundation System Definition Draft" })).length).toBe(2);
    expect(screen.getByRole("heading", { name: "Evaluation refinement" })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("实施方案已生成 · 待批准")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "批准实施" }));
    expect(approve).toHaveBeenCalledWith(draft);
    fireEvent.click(screen.getByRole("button", { name: "查看实施方案" }));
    expect(viewPlan).toHaveBeenCalledWith(draft);
    expect(screen.queryByRole("button", { name: "开发" })).toBeNull();
    expect(screen.getByRole("button", { name: "返回原讨论" })).toBeTruthy();
    expect(document.querySelector(".sino-draft-detail")).toBeTruthy();
  });

  it("opens the same Founder Gate Proposal from the Draft Inspector", () => {
    const open = vi.fn(); const proposal = { proposal_id: "proposal-runtime", status: "ready_for_review" };
    const draft = { draft_id: "draft-1", title: "Definition", status: "confirmed", version: 1, project_name: "Cloud", source_conversation_id: "conv-cloud", implementation: { execution_approval: "approved", execution_package: { package_id: "package-cloud", preflight_status: "founder_gate_required", founder_gate_proposal: proposal } } };
    render(<DraftContext selected={draft} onReviewFounderGate={open} />);
    fireEvent.click(screen.getByRole("button", { name: "审核运行环境方案" }));
    expect(open).toHaveBeenCalledWith(proposal);
  });
});
