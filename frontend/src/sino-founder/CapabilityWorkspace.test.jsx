// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityCenter, CapabilityContext, DraftContext, ExternalModelHealthCheck } from "./CapabilityWorkspace.jsx";
import { checkModelProvider, getCapabilityDomains, getCapabilityRepositoryAssets, getFounderDraft, getFounderDrafts, getLifecycleAsset, getModelCenter, performConversationCapabilityAction } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ checkModelProvider: vi.fn(), getCapabilityDomains: vi.fn(), getCapabilityRepositoryAssets: vi.fn(), getFounderDraft: vi.fn(), getFounderDrafts: vi.fn(), getLifecycleAsset: vi.fn(), getModelCenter: vi.fn(), performConversationCapabilityAction: vi.fn() }));
const skill = { asset_id: "asset-skill", asset_type: "skill", domain_id: "commerce", name: "商品分镜生成 Skill", purpose: "生成结构化商品分镜", status: "candidate", version: 1, used_by_refs: [], dependency_refs: [], test_run_refs: [], available_actions: ["develop", "archive", "continue_discussion"] };
const workflow = { ...skill, asset_id: "asset-workflow", asset_type: "workflow", name: "营销发布 Workflow" };
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
  it("searches Domain names before entering a Domain", async () => {
    getCapabilityDomains.mockResolvedValue({ domains: [{ domain_id: "commerce", name: "电商", counts: {} }, { domain_id: "marketing", name: "营销", counts: {} }] });
    render(<Harness />);
    const search = await screen.findByRole("searchbox", { name: "搜索能力名称或 Domain" });
    fireEvent.change(search, { target: { value: "营销" } });
    expect(screen.queryByRole("button", { name: /电商/ })).toBeNull();
    expect(screen.getByRole("button", { name: /营销/ })).toBeTruthy();
  });
  it("normalizes case and whitespace and shows a bounded no-results state", async () => {
    getCapabilityDomains.mockResolvedValue({ domains: [{ domain_id: "growth-ops", name: "Growth Ops", counts: {} }] });
    render(<Harness />);
    const search = await screen.findByRole("searchbox", { name: "搜索能力名称或 Domain" });
    fireEvent.change(search, { target: { value: "  GROWTH   OPS  " } });
    expect(screen.getByRole("button", { name: /Growth Ops/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: "不存在" } });
    const empty = await screen.findByText("没有匹配的 Domain 或能力");
    expect(empty.closest(".sino-business-empty")?.classList.contains("sino-business-empty--repository")).toBe(true);
  });
  it("shows Clear only for a search term and restores the full Domain list", async () => {
    getCapabilityDomains.mockResolvedValue({ domains: [{ domain_id: "commerce", name: "电商", counts: {} }, { domain_id: "marketing", name: "营销", counts: {} }] });
    render(<Harness />);
    const search = await screen.findByRole("searchbox", { name: "搜索能力名称或 Domain" });
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
    fireEvent.change(search, { target: { value: "营销" } });
    expect(screen.queryByRole("button", { name: /电商/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    expect(search.value).toBe("");
    expect(screen.getByRole("button", { name: /电商/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /营销/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "清除" })).toBeNull();
  });
  it("searches capability names globally before entering a Domain and opens the match", async () => {
    render(<Harness />);
    const search = await screen.findByRole("searchbox", { name: "搜索能力名称或 Domain" });
    fireEvent.change(search, { target: { value: "商品分镜生成" } });
    const match = await screen.findByRole("button", { name: /商品分镜生成 Skill/ });
    expect(screen.queryByText("没有匹配的 Domain 或能力")).toBeNull();
    expect(screen.getByRole("region", { name: "匹配的能力" })).toBeTruthy();
    fireEvent.click(match);
    await waitFor(() => expect(getLifecycleAsset).toHaveBeenCalledWith("asset-skill"));
    expect(await screen.findByRole("heading", { name: "电商" })).toBeTruthy();
  });
  it("searches capability names and the selected Domain without another API request", async () => {
    getCapabilityRepositoryAssets.mockResolvedValue({ assets: [skill, workflow] });
    render(<Harness />);
    fireEvent.click(await screen.findByRole("button", { name: /电商/ }));
    await screen.findByRole("button", { name: /商品分镜生成 Skill/ });
    const requestCount = getCapabilityRepositoryAssets.mock.calls.length;
    const search = screen.getByRole("searchbox", { name: "搜索能力名称或 Domain" });
    fireEvent.change(search, { target: { value: "workflow" } });
    expect(screen.queryByRole("button", { name: /商品分镜生成 Skill/ })).toBeNull();
    expect(screen.getByRole("button", { name: /营销发布 Workflow/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: "电商" } });
    expect(screen.getByRole("button", { name: /商品分镜生成 Skill/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /营销发布 Workflow/ })).toBeTruthy();
    expect(getCapabilityRepositoryAssets).toHaveBeenCalledTimes(requestCount);
  });
  it("uses the repository Ready action for the current Conversation", async () => {
    const ready = { ...skill, status: "ready", available_actions: ["reuse", "upgrade", "deprecate"], reference_count: 2 };
    performConversationCapabilityAction.mockResolvedValue({ asset: { ...ready, reference_count: 3 } });
    render(<CapabilityContext selected={ready} conversationId="conv-current" onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "引用" }));
    await waitFor(() => expect(performConversationCapabilityAction).toHaveBeenCalledWith("conv-current", expect.objectContaining({ action: "reuse", target_asset_id: "asset-skill", target_id: "conv-current" })));
  });
});

describe("External model connection health", () => {
  const provider = { provider_key: "deepseek", display_name: "DeepSeek", configured: true, health_status: "healthy", last_health_check_at: "2026-08-18T02:00:00Z" };
  beforeEach(() => { vi.clearAllMocks(); getModelCenter.mockResolvedValue({ providers: [provider] }); });
  afterEach(cleanup);
  it("shows the configured status without calling the external health probe", async () => {
    render(<ExternalModelHealthCheck providerKey="deepseek" />);
    expect(await screen.findByText("连接正常")).toBeTruthy();
    expect(screen.getByText("已配置")).toBeTruthy();
    expect(checkModelProvider).not.toHaveBeenCalled();
  });
  it("requires explicit Founder authorization before a potentially paid probe", async () => {
    checkModelProvider.mockResolvedValue({ status: "healthy", configuration: provider });
    render(<ExternalModelHealthCheck providerKey="deepseek" />);
    fireEvent.click(await screen.findByRole("button", { name: "检查连接状态" }));
    expect(screen.getByRole("alertdialog", { name: "Founder 健康检查授权" })).toBeTruthy();
    expect(checkModelProvider).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "授权并检查" }));
    await waitFor(() => expect(checkModelProvider).toHaveBeenCalledWith("deepseek"));
  });
  it("can cancel authorization without an external call", async () => {
    render(<ExternalModelHealthCheck providerKey="deepseek" />);
    fireEvent.click(await screen.findByRole("button", { name: "检查连接状态" }));
    fireEvent.click(screen.getByRole("button", { name: "暂不授权" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(checkModelProvider).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "在原讨论中查看完整实施方案" }));
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

  it("keeps task content available for repeated review while execution is in progress", () => {
    const draft = { draft_id: "draft-running", title: "Runtime rollout", status: "confirmed", version: 1, project_name: "Cloud", source_conversation_id: "conv-cloud", implementation: { plan_id: "plan-running", work_item_count: 2, execution_approval: "approved", implementation_goal: "完成运行环境上线", execution_package: { package_id: "package-running", preflight_status: "ready", execution_status: "executing", scope: ["runtime binding"], acceptance_criteria: ["targeted tests pass"], work_items: [{ work_item_id: "work-1", title: "绑定运行环境", purpose: "连接执行器", validation: "健康检查通过" }, { work_item_id: "work-2", scope: "运行前端验证" }] } } };
    render(<DraftContext selected={draft} />);
    expect(screen.getByRole("region", { name: "任务内容" })).toBeTruthy();
    expect(screen.getByText("绑定运行环境")).toBeTruthy();
    expect(screen.getByText("targeted tests pass")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "收起任务内容" }));
    expect(screen.queryByText("绑定运行环境")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看任务内容" }));
    expect(screen.getByText("绑定运行环境")).toBeTruthy();
  });
});
