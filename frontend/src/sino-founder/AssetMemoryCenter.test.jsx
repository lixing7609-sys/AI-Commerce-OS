// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createArtifactVersion, createIntelligenceReference, createMemoryRevision, getAssetMemoryCenter, getLibraryArtifact, getLibraryMemory, updateArtifactStatus, updateMemoryStatus } from "../services/founderAiApi.js";
import { AssetMemoryCenter } from "./AssetMemoryCenter.jsx";

vi.mock("../services/founderAiApi.js", () => ({ createArtifactVersion: vi.fn(), createIntelligenceReference: vi.fn(), createMemoryRevision: vi.fn(), getAssetMemoryCenter: vi.fn(), getLibraryArtifact: vi.fn(), getLibraryMemory: vi.fn(), mergeLibraryMemories: vi.fn(), updateArtifactStatus: vi.fn(), updateMemoryStatus: vi.fn() }));

const history = {
  artifacts: [
    { artifact_id: "artifact-1", execution_id: "execution-1", task: "Hide scrollbar", goal: "Hide scrollbar", artifact_type: "execution_result", summary: "Scrollbar hidden", created_at: "2026-08-10T11:24:40Z", related_files: ["sino-founder-ai.css"], commit_hash: "abc123", verification_status: "passed", verification: ["npm test"], status: "active", content: {} },
    { artifact_id: "artifact-legacy", title: "Legacy artifact", summary: "Historical result without new fields", created_at: "2025-01-01T00:00:00Z" },
  ],
  memories: [
    { memory_id: "memory-decision", execution_id: "execution-1", artifact_id: null, task: "Hide scrollbar", memory_type: "decision", title: "Execution decision", decision: "Founder approved", learning: null, execution_result: null, content: { decision: "Founder approved" }, created_at: "2026-08-10T11:24:41Z", status: "active" },
    { memory_id: "memory-learning", execution_id: "execution-1", artifact_id: null, task: "Hide scrollbar", memory_type: "learning", title: "Execution learning", decision: null, learning: "Keep scrolling", execution_result: null, content: { learning: "Keep scrolling" }, created_at: "2026-08-10T11:24:42Z", status: "active" },
    { memory_id: "memory-legacy", title: "Legacy memory", summary: "Historical memory without new fields", created_at: "2025-01-01T00:00:00Z" },
  ],
  executions: [{ execution_id: "execution-1", task: "Hide scrollbar", goal: "Hide scrollbar", status: "completed", commit_hash: "abc123", verification_status: "passed", artifacts: ["artifact-1"], memories: ["memory-decision", "memory-learning"] }],
};
const strategy = { current_phase: "Memory Evolution", current_strategic_position: "Founder intelligence active", recommended_next_phase: "Memory Evolution", roadmap: { vision: "Build AI Commerce OS", status: "active", milestones: [{ phase: "Memory Evolution", status: "current" }] }, capability_status: { applications: [{ key: "founder_ai", name: "Sino Founder AI", role: "Founder governance", status: "active" }] }, recommendations: [{ priority: 1, title: "Complete Memory Evolution", reason: "Long-term learning", requires_approval: true }] };
const briefing = { recommended_decision: "Complete Memory Evolution", recommendations: strategy.recommendations, project_state: { updated_at: "2026-08-11T00:00:00Z" } };

beforeEach(() => {
  vi.clearAllMocks(); getAssetMemoryCenter.mockResolvedValue(history);
  getLibraryArtifact.mockResolvedValue({ ...history.artifacts[0], title: "Hide scrollbar", version: 1, conversation_id: "conv-1", updated_at: "2026-08-10T11:24:40Z", history: [{ artifact_id: "artifact-1", version: 1, created_at: "2026-08-10T11:24:40Z", status: "active" }], references: [] });
  getLibraryMemory.mockResolvedValue({ ...history.memories[0], revision_number: 1, updated_at: "2026-08-10T11:24:41Z", history: [{ memory_id: "memory-decision", revision_number: 1, created_at: "2026-08-10T11:24:41Z", status: "active" }], references: [] });
});
afterEach(() => cleanup());

describe("AssetMemoryCenter", () => {
  it("renders a stable two-pane workspace with an empty detail state", async () => {
    const { container } = render(<AssetMemoryCenter />);
    await screen.findByText("Legacy artifact");
    expect(container.querySelector(".sino-library-workspace")).toBeTruthy();
    expect(container.querySelector(".sino-library-list-pane")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "智能资产详情" })).toBeTruthy();
    expect(screen.getByText("选择一条资产查看详情")).toBeTruthy();
  });

  it("keeps technical history outside the default Founder asset layer", async () => {
    render(<AssetMemoryCenter />);
    expect(await screen.findByText("Legacy artifact")).toBeTruthy();
    expect(screen.queryByText("Hide scrollbar")).toBeNull();
    expect(screen.getByRole("tab", { name: /运营资产 1/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /技术实现 1/ }));
    expect(screen.getByText("Hide scrollbar")).toBeTruthy();
  });

  it("shows all historical memories with default filters", async () => {
    render(<AssetMemoryCenter />);
    await screen.findByText("Legacy artifact");
    fireEvent.click(screen.getByRole("tab", { name: /长期记忆/ }));
    expect(screen.getByText("Execution decision")).toBeTruthy();
    expect(screen.getByText("Execution learning")).toBeTruthy();
    expect(screen.getByText("Legacy memory")).toBeTruthy();
  });

  it("consolidates real Strategy content into strategic assets and detail", async () => {
    render(<AssetMemoryCenter strategy={strategy} briefing={briefing} />);
    await screen.findByText("Legacy artifact");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent.replace(/\s*\d+$/, ""))).toEqual(["战略资产", "运营资产", "长期记忆", "技术实现"]);
    fireEvent.click(screen.getByRole("tab", { name: /战略资产 5/ }));
    for (const title of ["战略定位", "长期路线", "能力地图", "战略决策", "当前阶段"]) expect(screen.getByText(title)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("资产与记忆搜索"), { target: { value: "Memory Evolution" } });
    expect(screen.getByText("当前阶段")).toBeTruthy();
    fireEvent.click(screen.getByText("长期路线"));
    expect(await screen.findByRole("complementary", { name: "战略资产详情" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "长期路线面板" })).toBeTruthy();
  });

  it("keeps legacy records without new filter fields visible when filters are all", async () => {
    render(<AssetMemoryCenter />);
    expect(await screen.findByText("Legacy artifact")).toBeTruthy();
    expect(screen.getByLabelText("类型").value).toBe("");
    expect(screen.getByLabelText("状态").value).toBe("");
    expect(screen.getByLabelText("来源").value).toBe("");
    expect(screen.getByLabelText("时间").value).toBe("");
  });

  it("narrows a specific filter and restores all records when reset", async () => {
    render(<AssetMemoryCenter />);
    await screen.findByText("Legacy artifact");
    fireEvent.click(screen.getByRole("tab", { name: /技术实现/ }));
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "execution_result" } });
    expect(screen.getByText("Hide scrollbar")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "" } });
    expect(screen.getByText("Hide scrollbar")).toBeTruthy();
  });

  it("exits loading after fetch success", async () => {
    render(<AssetMemoryCenter />);
    await screen.findByText("Legacy artifact");
    expect(screen.queryByText("正在读取历史资产…")).toBeNull();
  });

  it("exits loading and shows the real error after fetch failure", async () => {
    getAssetMemoryCenter.mockRejectedValueOnce(new Error("Historical API unavailable"));
    render(<AssetMemoryCenter />);
    expect((await screen.findByRole("alert")).textContent).toContain("Historical API unavailable");
    expect(screen.queryByText("正在读取历史资产…")).toBeNull();
  });

  it("reports an API contract mismatch instead of silently showing zero", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getAssetMemoryCenter.mockResolvedValueOnce({ items: [] });
    render(<AssetMemoryCenter />);
    expect((await screen.findByRole("alert")).textContent).toContain("API 返回结构不正确");
    expect(screen.queryByText("正在读取历史资产…")).toBeNull();
  });

  it("loads durable history and opens artifact detail", async () => {
    const { container } = render(<AssetMemoryCenter refreshKey="history" />);
    await screen.findByText("Legacy artifact");
    fireEvent.click(screen.getByRole("tab", { name: /技术实现/ }));
    expect(await screen.findByText("Hide scrollbar")).toBeTruthy();
    fireEvent.click(screen.getByText("Hide scrollbar"));
    expect(await screen.findByRole("complementary", { name: "智能资产详情" })).toBeTruthy();
    expect(screen.getByText("版本历史")).toBeTruthy();
    expect(screen.getByText("原始记录")).toBeTruthy();
    expect(screen.queryByText("Legacy artifact")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    const summaryRegion = container.querySelector(".sino-asset-detail pre.sino-detail-scroll-region");
    expect(summaryRegion).toBeTruthy();
    expect(summaryRegion.tabIndex).toBe(0);
  });

  it("references and versions an artifact without copying its content", async () => {
    createIntelligenceReference.mockResolvedValue({ reference_id: "ref-1", source_id: "artifact-1", target_type: "execution", target_id: "execution-1" });
    createArtifactVersion.mockResolvedValue({ ...(await getLibraryArtifact()), artifact_id: "artifact-2", version: 2, history: [] });
    updateArtifactStatus.mockResolvedValue({ ...(await getLibraryArtifact()), status: "invalid" });
    render(<AssetMemoryCenter context={{ execution_id: "execution-1" }} />);
    await screen.findByText("Legacy artifact");
    fireEvent.click(screen.getByRole("tab", { name: /技术实现/ }));
    fireEvent.click(await screen.findByText("Hide scrollbar"));
    await screen.findByRole("complementary", { name: "智能资产详情" });
    fireEvent.change(screen.getByPlaceholderText("说明原因或引用备注"), { target: { value: "Reuse this result" } });
    fireEvent.click(screen.getByRole("button", { name: "引用到当前执行" }));
    await waitFor(() => expect(createIntelligenceReference).toHaveBeenCalledWith(expect.objectContaining({ source_type: "artifact", source_id: "artifact-1", target_type: "execution", target_id: "execution-1" })));
    fireEvent.click(screen.getByRole("button", { name: "创建新版本" }));
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalledWith("artifact-1", { revision_reason: "Reuse this result" }));
    fireEvent.click(screen.getByRole("button", { name: "标记失效" }));
    await waitFor(() => expect(updateArtifactStatus).toHaveBeenCalledWith("artifact-2", "invalid"));
  });

  it("switches artifact selection in the right pane while keeping the list mounted", async () => {
    getAssetMemoryCenter.mockResolvedValueOnce({ ...history, artifacts: history.artifacts.map((item) => ({ ...item, artifact_type: "document" })) });
    getLibraryArtifact.mockImplementation(async (id) => ({ artifact_id: id, title: id === "artifact-1" ? "First detail" : "Legacy detail", artifact_type: "document", status: "active", version: 1, history: [], references: [] }));
    const { container } = render(<AssetMemoryCenter />);
    fireEvent.click(await screen.findByText("Hide scrollbar"));
    expect(await screen.findByText("First detail")).toBeTruthy();
    fireEvent.click(screen.getByText("Legacy artifact"));
    expect(await screen.findByText("Legacy detail")).toBeTruthy();
    expect(screen.queryByText("First detail")).toBeNull();
    expect(container.querySelector(".sino-library-list-pane")).toBeTruthy();
  });

  it("renders memory detail and preserves revision and status actions", async () => {
    createIntelligenceReference.mockResolvedValue({ reference_id: "ref-memory", source_id: "memory-decision", target_type: "conversation", target_id: "conv-1" });
    createMemoryRevision.mockResolvedValue({ ...(await getLibraryMemory()), memory_id: "memory-revision", revision_number: 2 });
    updateMemoryStatus.mockResolvedValue({ ...(await getLibraryMemory()), status: "outdated" });
    const { container } = render(<AssetMemoryCenter context={{ conversation_id: "conv-1" }} />);
    await screen.findByText("Legacy artifact");
    fireEvent.click(screen.getByRole("tab", { name: /长期记忆/ }));
    expect(screen.getByText("选择一条资产查看详情")).toBeTruthy();
    fireEvent.click(screen.getByText("Execution decision"));
    expect(await screen.findByText("修订历史")).toBeTruthy();
    expect(container.querySelector(".sino-asset-detail pre.sino-detail-scroll-region")).toBeTruthy();
    expect(screen.getByRole("button", { name: "引用此记忆" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "引用此记忆" }));
    await waitFor(() => expect(createIntelligenceReference).toHaveBeenCalledWith(expect.objectContaining({ source_type: "memory", source_id: "memory-decision", target_type: "conversation" })));
    fireEvent.change(screen.getByPlaceholderText("说明原因或引用备注"), { target: { value: "Update memory" } });
    fireEvent.click(screen.getByRole("button", { name: "创建修订" }));
    await waitFor(() => expect(createMemoryRevision).toHaveBeenCalledWith("memory-decision", { revision_reason: "Update memory" }));
    fireEvent.click(screen.getByRole("button", { name: "标记过期" }));
    await waitFor(() => expect(updateMemoryStatus).toHaveBeenCalled());
  });

  it("filters memories by type, execution id and keyword", async () => {
    render(<AssetMemoryCenter refreshKey="history" />);
    await screen.findByText("Legacy artifact");
    fireEvent.click(screen.getByRole("tab", { name: /长期记忆/ }));
    fireEvent.change(screen.getByLabelText("类型"), { target: { value: "learning" } });
    expect(screen.getByText("Execution learning")).toBeTruthy();
    expect(screen.queryByText("Execution decision")).toBeNull();
    fireEvent.change(screen.getByLabelText("资产与记忆搜索"), { target: { value: "execution-1" } });
    expect(screen.getByText("Execution learning")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("资产与记忆搜索"), { target: { value: "missing" } });
    expect(screen.getByText("没有匹配的记录。")).toBeTruthy();
  });

  it("reloads history after a completed execution refresh key changes", async () => {
    const { rerender } = render(<AssetMemoryCenter refreshKey="history" />);
    await waitFor(() => expect(getAssetMemoryCenter).toHaveBeenCalledTimes(1));
    rerender(<AssetMemoryCenter refreshKey="execution-2" />);
    await waitFor(() => expect(getAssetMemoryCenter).toHaveBeenCalledTimes(2));
  });
});
