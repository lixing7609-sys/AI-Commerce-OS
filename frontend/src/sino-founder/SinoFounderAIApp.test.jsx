// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SinoFounderAIApp from "./SinoFounderAIApp.jsx";
import { normalizeFounderView } from "./ConversationWorkspace.jsx";
import { continueFounderObjectDiscussion, createFounderConversation, createFounderExecution, createFounderProject, deleteFounderConversation, discussWithCouncil, discussWithSino, getAssetMemoryCenter, getCapabilityDomains, getCapabilityRepositoryAssets, getConversationWorkspace, getFounderBriefing, getFounderConversations, getFounderExecution, getFounderObject, getFounderObjects, getFounderProjects, getFounderStrategy, getLibraryArtifact, getLifecycleReuseSuggestions, getModelCenter, getProjectIntelligence, reasonConfirmedGoal, retryCouncil, retrySinoReply, submitExecutionDelta } from "../services/founderAiApi.js";
import { createTaskAsset } from "../services/taskAssetApi.js";

vi.mock("../services/founderAiApi.js", () => ({ approveCapabilityReady: vi.fn(), approveFounderExecution: vi.fn(), approveFounderObject: vi.fn(), archiveFounderObject: vi.fn(), bindFounderConversationProject: vi.fn(), buildSystemBlueprint: vi.fn(), clearFounderObjectDiscussion: vi.fn(), completeCapabilityDevelopment: vi.fn(), confirmCandidateGoal: vi.fn(), continueFounderObjectDiscussion: vi.fn(), createFounderConversation: vi.fn(), createFounderExecution: vi.fn(), createFounderProject: vi.fn(), decideExecutionDelta: vi.fn(), deleteFounderConversation: vi.fn(), discussWithAutoDeliberation: vi.fn(), discussWithCouncil: vi.fn(), discussWithSino: vi.fn(), getAssetMemoryCenter: vi.fn(), getCapabilityDomains: vi.fn(), getCapabilityRepositoryAssets: vi.fn(), getConversationWorkspace: vi.fn(), getFounderBriefing: vi.fn(), getFounderConversations: vi.fn(), getFounderExecution: vi.fn(), getFounderObject: vi.fn(), getFounderObjects: vi.fn(), getFounderProjects: vi.fn(), getFounderStrategy: vi.fn(), getLibraryArtifact: vi.fn(), getLibraryMemory: vi.fn(), getLifecycleReuseSuggestions: vi.fn(), getModelCenter: vi.fn(), getProjectIntelligence: vi.fn(), createArtifactVersion: vi.fn(), createIntelligenceReference: vi.fn(), createMemoryRevision: vi.fn(), mergeLibraryMemories: vi.fn(), performConversationCapabilityAction: vi.fn(), reuseLifecycleAsset: vi.fn(), runCapabilityTest: vi.fn(), startCapabilityDevelopment: vi.fn(), updateArtifactStatus: vi.fn(), updateMemoryStatus: vi.fn(), reasonConfirmedGoal: vi.fn(), resumeFounderExecution: vi.fn(), retryCouncil: vi.fn(), retrySinoReply: vi.fn(), submitExecutionDelta: vi.fn() }));
vi.mock("../services/taskAssetApi.js", () => ({ createTaskAsset: vi.fn() }));

const emptySnapshot = { conversation: { id: "conv-1", project_id: "project-ai-commerce-os", state: "exploring" }, messages: [], digest: { summary: "", topics: [], decisions: [], knowledge_items: [], candidate_goals: [], pending_questions: [] }, goals: [] };
const projects = [{ id: "project-ai-commerce-os", name: "AI Commerce OS", description: "Founder system", status: "active" }];
const intelligence = { project_id: "project-ai-commerce-os", project_name: "AI Commerce OS", project_summary: "Conversation First 已形成项目智能。", current_positioning: "Conversation Intelligence", master_prompt: "Keep Founder work outcome-focused", prompt_version: 3, prompt_delta: { added: ["Founder approval"], revised: [] }, decisions: [{ decision_id: "decision-1", title: "Project Context 属于 Composer", confirmed: true }], pending_questions: [{ question_id: "question-1", content: "下一阶段先推进什么？", conversation_id: "conv-1" }], candidate_goals: [], active_goals: [{ goal_id: "goal-active", title: "完善 Project Intelligence", status: "goal_confirmed", conversation_id: "conv-1" }], conversation_refs: [{ conversation_id: "conv-1", title: "Project Intelligence 讨论", summary: "形成 Living Prompt", updated_at: "2026-08-11T08:00:00Z" }], execution_refs: [{ execution_id: "execution-draft", status: "draft", goal: "完善 Project Intelligence" }], updated_at: "2026-08-11T08:00:00Z" };
const active = { id: "execution-1", task_asset_id: "task-1", status: "executing", execution_allowed: true, events: [], deltas: [] };

beforeEach(() => {
  vi.resetAllMocks(); window.localStorage.clear(); window.history.replaceState({}, "", "/");
  getFounderBriefing.mockResolvedValue({ recommendations: [], project_state: {} });
  getFounderStrategy.mockResolvedValue({ roadmap: { milestones: [] }, capability_status: { applications: [] }, recommendations: [] });
  getAssetMemoryCenter.mockResolvedValue({ artifacts: [], memories: [], executions: [] });
  getFounderProjects.mockResolvedValue(projects);
  getFounderConversations.mockRejectedValue(new Error("history unavailable"));
  deleteFounderConversation.mockResolvedValue({ deleted: true });
  getProjectIntelligence.mockResolvedValue(intelligence);
  getConversationWorkspace.mockResolvedValue(emptySnapshot);
  getFounderObjects.mockResolvedValue([]);
  getFounderObject.mockRejectedValue(new Error("Founder Object not found"));
  getCapabilityDomains.mockResolvedValue({ domains: [] });
  getCapabilityRepositoryAssets.mockResolvedValue({ assets: [] });
  getLifecycleReuseSuggestions.mockResolvedValue({ assets: [] });
  getModelCenter.mockResolvedValue({ provider_catalog: [], providers: [], roles: [], skills: [], health_cost: [], execution_engines: [], agents: [{ agent_id: "sino_founder_ai", application_system_id: "founder_ai", display_name: "Sino AI 秘书", description: "Founder AI 核心 Agent", status: "running" }] });
});
afterEach(() => cleanup());

describe("Sino Founder AI interaction responsibilities", () => {
  it("maps legacy work pages into the single Object Workspace", () => {
    expect(normalizeFounderView("blueprint")).toBe("objects");
    expect(normalizeFounderView("system-builder")).toBe("objects");
    expect(normalizeFounderView("capability")).toBe("objects");
    expect(normalizeFounderView("models")).toBe("objects");
    expect(normalizeFounderView("execution")).toBe("objects");
    expect(normalizeFounderView("assets")).toBe("objects");
  });
  it("opens on a Conversation First home without task or execution surfaces", async () => {
    render(<SinoFounderAIApp />);
    expect(screen.getByRole("heading", { name: "今天想讨论什么？" })).toBeTruthy();
    expect(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……")).toBeTruthy();
    expect(screen.getByRole("button", { name: "发送" })).toBeTruthy();
    const implementation = screen.getByRole("region", { name: "实现工作区" });
    expect(within(implementation).getByText("当前讨论尚未形成可实现对象")).toBeTruthy();
    for (const removed of ["项目摘要", "动态提示词", "正式决策", "项目知识", "项目约束", "待确认问题", "项目目标"]) expect(within(implementation).queryByText(removed)).toBeNull();
    expect(document.querySelector(".sino-founder-main .sino-project-intelligence")).toBeNull();
    expect(document.querySelector(".sino-home-recent")).toBeNull();
    expect(screen.queryByText("继续工作")).toBeNull();
    for (const removed of ["Sino 状态", "讨论优先 · AI 秘书持续整理", "最近活动", "暂无讨论活动"]) expect(screen.queryByText(removed)).toBeNull();
    const healthyDot = screen.getByLabelText("Sino 在线");
    expect(healthyDot.classList.contains("is-online")).toBe(true);
    expect(healthyDot.parentElement.classList.contains("sino-composer-status")).toBe(true);
    expect(healthyDot.parentElement.textContent).toBe("Sino 在线");
    expect(healthyDot.nextElementSibling.textContent).toBe("Sino 在线");
    expect(document.querySelector(".sino-brand .sino-workspace-status")).toBeNull();
    expect(screen.getByRole("button", { name: /新建讨论/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "项目⌄" })).toBeTruthy();
    expect(screen.getByText("会话").closest(".sino-sidebar__conversation-title")).toBeTruthy();
    const projectTitle = screen.getByText("项目").closest(".sino-sidebar-primary-title");
    const conversationTitle = screen.getByText("会话").closest(".sino-sidebar-primary-title");
    expect(projectTitle.querySelector("svg")).toBeTruthy();
    expect(conversationTitle.querySelector("svg")).toBeTruthy();
    const projectStyle = window.getComputedStyle(projectTitle);
    const conversationStyle = window.getComputedStyle(conversationTitle);
    expect(conversationStyle.fontSize).toBe(projectStyle.fontSize);
    expect(conversationStyle.fontWeight).toBe(projectStyle.fontWeight);
    expect(conversationStyle.lineHeight).toBe(projectStyle.lineHeight);
    expect(conversationStyle.color).toBe(projectStyle.color);
    const projectItem = await screen.findByRole("button", { name: /AI Commerce OS/ });
    expect(projectItem.querySelector("svg")).toBeNull();
    expect(projectItem.querySelector("i")?.textContent).toBe("•");
    expect((await screen.findAllByRole("button", { name: "AI Commerce OS" })).length).toBeGreaterThan(0);
    const composer = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……").closest("form");
    const projectSelector = document.querySelector(".sino-project-selector");
    expect(composer.classList.contains("sino-global-composer")).toBe(true);
    expect(composer.querySelector(".sino-composer__toolbar").contains(projectSelector)).toBe(true);
    expect(composer.querySelector(".sino-composer__toolbar").contains(screen.getByRole("button", { name: "发送" }))).toBe(true);
    expect(document.querySelector(".sino-home__center > .sino-project-selector")).toBeNull();
    expect(screen.queryByRole("heading", { name: "项目" })).toBeNull();
    for (const removed of ["新增知识", "候选目标"]) expect(screen.queryByText(removed)).toBeNull();
    expect(screen.queryByText("执行时间线")).toBeNull();
    expect(screen.queryByPlaceholderText("补充、修改或删除当前执行中的要求……")).toBeNull();
  });

  it("keeps the home composer discussion-only even when an execution is active", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-1");
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, goals: [{ goal_id: "goal-1", status: "planning" }], active_execution: active });
    discussWithSino.mockResolvedValue({ ...emptySnapshot, messages: [{ message_id: "m1", role: "founder", content: "讨论另一个设计想法" }] });
    render(<SinoFounderAIApp />);
    const input = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(input, { target: { value: "讨论另一个设计想法" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(discussWithSino).toHaveBeenCalledWith("conv-1", "讨论另一个设计想法"));
    expect(submitExecutionDelta).not.toHaveBeenCalled();
  });

  it("renders the Object-native Implementation Workspace for an unscoped Conversation", async () => {
    const initial = { ...emptySnapshot, conversation: { id: "conv-context", project_id: null, title: "广告数据讨论" }, digest: { ...emptySnapshot.digest, summary: "初始摘要", constraints: ["跨平台 API 差异"], knowledge_items: [{ knowledge_id: "k1", title: "统一数据模型" }], pending_questions: [{ question_id: "q1", content: "V1 覆盖哪些实体？", status: "open" }] } };
    const refreshed = { ...initial, conversation_intelligence: { summary: "讨论统一广告数据模型", judgments: ["采用 Canonical Data Model"], decisions: [], knowledge: [{ knowledge_id: "k1", title: "统一数据模型" }, { knowledge_id: "k2", title: "归因存在延迟" }], constraints: ["跨平台 API 差异"], terminology: ["Canonical Data Model"], pending_questions: [{ question_id: "q1", content: "V1 覆盖哪些实体？" }], candidate_goals: [], goals: [], updated_at: "2026-08-12T12:00:00Z" }, messages: [{ message_id: "f1", role: "founder", content: "继续", message_type: "discussion" }, { message_id: "a1", role: "assistant", content: "继续讨论", message_type: "discussion" }] };
    window.localStorage.setItem("sino-founder-active-conversation", "conv-context");
    getConversationWorkspace.mockResolvedValue(initial);
    discussWithSino.mockResolvedValue(refreshed);
    render(<SinoFounderAIApp />);
    const context = await screen.findByRole("region", { name: "实现工作区" });
    expect(within(context).getByText("当前讨论产生或正在修改的技术对象")).toBeTruthy();
    const input = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(input, { target: { value: "继续" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(within(context).getByText(/继续讨论后，Sino 会自动识别/)).toBeTruthy();
    expect(getProjectIntelligence).not.toHaveBeenCalled();
  });

  it("keeps Sino online when non-conversation briefing enrichment is unavailable", async () => {
    getFounderBriefing.mockRejectedValueOnce(new Error("Backend unavailable"));
    render(<SinoFounderAIApp />);
    expect(await screen.findByLabelText("Sino 在线")).toBeTruthy();
    expect(screen.getByText("Sino 在线")).toBeTruthy();
  });

  it("returns New Conversation to Founder Home and waits for the first message before creation", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-old");
    window.localStorage.setItem("sino-founder-conversation-history", JSON.stringify([{ id: "empty-1", title: "新讨论", updatedAt: Date.now() }, { id: "conv-old", title: "已有讨论", updatedAt: Date.now() }]));
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-old", state: "exploring" } });
    createFounderConversation.mockResolvedValue({ id: "conv-new" });
    discussWithSino.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-new", title: "产品战略", state: "exploring" }, messages: [{ message_id: "m-new", role: "founder", content: "讨论产品战略" }] });
    render(<SinoFounderAIApp />);
    for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole("button", { name: /新建讨论/ }));
    await waitFor(() => expect(document.querySelector(".sino-project-selector__trigger")?.textContent).toContain("选择项目"));
    expect(screen.getByRole("heading", { name: "今天想讨论什么？" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Founder 与 Sino 持续讨论" })).toBeNull();
    expect(createFounderConversation).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /新讨论/ })).toBeNull();
    fireEvent.click(document.querySelector(".sino-project-selector__trigger"));
    fireEvent.click(within(screen.getByRole("dialog", { name: "选择项目" })).getByRole("button", { name: "AI Commerce OS" }));
    await waitFor(() => expect(getProjectIntelligence).toHaveBeenCalledWith("project-ai-commerce-os"));
    const implementation = await screen.findByRole("region", { name: "实现工作区" });
    expect(within(implementation).getByText("当前讨论尚未形成可实现对象")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……"), { target: { value: "讨论产品战略" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    await waitFor(() => expect(createFounderConversation).toHaveBeenCalledWith("新讨论", "project-ai-commerce-os"));
    expect(await screen.findByRole("region", { name: "Conversation" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Founder 与 Sino 持续讨论" })).toBeNull();
    expect(screen.getByRole("button", { name: /产品战略/ })).toBeTruthy();
    fireEvent.click(screen.getByTitle("新建讨论"));
    expect(screen.getByRole("heading", { name: "今天想讨论什么？" })).toBeTruthy();
  });

  it("creates one unscoped Conversation, persists both messages, and continues the same id", async () => {
    const first = { ...emptySnapshot, conversation: { id: "conv-unscoped-new", project_id: null, title: "首页新讨论智能沉淀", state: "exploring", updated_at: "2026-08-11T12:00:00Z" }, messages: [{ message_id: "f1", role: "founder", content: "首页新讨论如何沉淀智能？" }, { message_id: "a1", role: "assistant", content: "先形成可复用摘要。" }], digest: { ...emptySnapshot.digest, summary: "讨论首页新会话的智能沉淀方式。" } };
    const continued = { ...first, messages: [...first.messages, { message_id: "f2", role: "founder", content: "继续明确标题规则" }, { message_id: "a2", role: "assistant", content: "标题应表达对象和核心问题。" }] };
    createFounderConversation.mockResolvedValue({ id: "conv-unscoped-new" });
    discussWithSino.mockResolvedValueOnce(first).mockResolvedValueOnce(continued);
    render(<SinoFounderAIApp />);

    const homeInput = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(homeInput, { target: { value: "首页新讨论如何沉淀智能？" } });
    const homeForm = homeInput.closest("form");
    fireEvent.submit(homeForm);
    fireEvent.submit(homeForm);

    await waitFor(() => expect(createFounderConversation).toHaveBeenCalledTimes(1));
    expect(createFounderConversation).toHaveBeenCalledWith("新讨论", null);
    expect(await screen.findByText("先形成可复用摘要。")).toBeTruthy();
    expect(screen.getByTitle("首页新讨论智能沉淀")).toBeTruthy();
    expect(within(screen.getByLabelText("当前上下文")).getByRole("region", { name: "实现工作区" })).toBeTruthy();

    const continuationInput = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(continuationInput, { target: { value: "继续明确标题规则" } });
    fireEvent.submit(continuationInput.closest("form"));
    await waitFor(() => expect(discussWithSino).toHaveBeenLastCalledWith("conv-unscoped-new", "继续明确标题规则"));
    expect(createFounderConversation).toHaveBeenCalledTimes(1);
  });

  it("keeps Sino as default and routes explicit multi-model mode through Council", async () => {
    const councilSnapshot = { ...emptySnapshot, conversation: { id: "conv-council", project_id: null, title: "Council 建设顺序", state: "exploring" }, messages: [{ message_id: "f1", role: "founder", content: "Council 还是 Builder？", message_type: "council" }, { message_id: "a1", role: "assistant", content: "模型共识：先验证闭环", message_type: "council" }], council_runs: [{ council_run_id: "council-1", question: "Council 还是 Builder？", status: "completed_partial", consensus: ["先验证闭环"], disagreements: ["建设顺序不同"], recommendation: "先建设 Council V1", model_runs: [{ provider: "deepseek", status: "completed", proposal: { core_judgment: "先 Council" } }, { provider: "claude", status: "unavailable", proposal: {} }] }] };
    createFounderConversation.mockResolvedValue({ id: "conv-council" });
    discussWithCouncil.mockResolvedValue(councilSnapshot);
    render(<SinoFounderAIApp />);
    expect(screen.getByRole("button", { name: "Sino" }).classList.contains("is-active")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "多模型讨论" }));
    const input = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(input, { target: { value: "Council 还是 Builder？" } });
    fireEvent.submit(input.closest("form"));
    await waitFor(() => expect(discussWithCouncil).toHaveBeenCalledWith("conv-council", "Council 还是 Builder？"));
    expect(discussWithSino).not.toHaveBeenCalled();
    expect(await screen.findByText("* DeepSeek")).toBeTruthy();
    expect(screen.getByText(/核心判断：先 Council/)).toBeTruthy();
    expect(screen.getByText("暂时不可用")).toBeTruthy();
    expect(screen.getByText(/综合判断：先建设 Council V1/)).toBeTruthy();
  });

  it("retries a failed home Council through Council without duplicating the Founder message", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-council-retry" });
    discussWithCouncil.mockRejectedValue(new Error("发起多模型讨论失败（状态码 503）"));
    const failed = { ...emptySnapshot, conversation: { id: "conv-council-retry", project_id: null, title: "新讨论", state: "exploring" }, messages: [{ message_id: "f1", role: "founder", content: "讨论公司电商系统", message_type: "council" }], council_runs: [{ council_run_id: "old", question: "讨论公司电商系统", status: "failed", model_runs: [] }] };
    const recovered = { ...failed, messages: [...failed.messages, { message_id: "a1", role: "assistant", content: "Sino 综合回复", message_type: "council" }], council_runs: [{ council_run_id: "new", question: "讨论公司电商系统", status: "completed_partial", recommendation: "Sino 综合回复", consensus: ["形成方案"], model_runs: [{ provider: "deepseek", status: "completed", proposal: { core_judgment: "可行" } }] }] };
    getConversationWorkspace.mockResolvedValue(failed);
    retryCouncil.mockResolvedValue(recovered);
    render(<SinoFounderAIApp />);
    fireEvent.click(screen.getByRole("button", { name: "多模型讨论" }));
    const input = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(input, { target: { value: "讨论公司电商系统" } });
    fireEvent.submit(input.closest("form"));
    expect(await screen.findByText("讨论公司电商系统")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试 Sino 回复" }));
    expect(await screen.findByText(/综合判断：Sino 综合回复/)).toBeTruthy();
    expect(retryCouncil).toHaveBeenCalledWith("conv-council-retry");
    expect(retrySinoReply).not.toHaveBeenCalled();
    expect(screen.getAllByText("讨论公司电商系统")).toHaveLength(1);
  });

  it("restores the persisted Founder message when the Sino provider fails", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-provider-failed" });
    discussWithSino.mockRejectedValue(new Error("Sino 回复失败"));
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-provider-failed", project_id: null, title: "新讨论", state: "exploring" }, messages: [{ message_id: "f1", role: "founder", content: "必须保留这条消息" }] });
    render(<SinoFounderAIApp />);
    const input = screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……");
    fireEvent.change(input, { target: { value: "必须保留这条消息" } });
    fireEvent.submit(input.closest("form"));
    expect(await screen.findByText("必须保留这条消息")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("可重试");
    expect(createFounderConversation).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("region", { name: "Conversation" })).toBeTruthy();

    retrySinoReply.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-provider-failed", project_id: null, title: "失败回复恢复机制", state: "exploring" }, messages: [{ message_id: "f1", role: "founder", content: "必须保留这条消息" }, { message_id: "a1", role: "assistant", content: "回复已在原会话恢复。" }] });
    fireEvent.click(screen.getByRole("button", { name: "重试 Sino 回复" }));
    expect(await screen.findByText("回复已在原会话恢复。")).toBeTruthy();
    expect(retrySinoReply).toHaveBeenCalledWith("conv-provider-failed");
    expect(createFounderConversation).toHaveBeenCalledTimes(1);
  });

  it("selects, searches and creates Project Context without creating a Conversation", async () => {
    const second = { id: "project-second", name: "Real Second Project", description: "Existing", status: "active" };
    getFounderProjects.mockResolvedValue([...projects, second]);
    createFounderProject.mockResolvedValue({ id: "project-created", name: "Founder Research", description: "New", status: "active" });
    render(<SinoFounderAIApp />);
    const trigger = await waitFor(() => {
      const element = document.querySelector(".sino-project-selector__trigger");
      if (!element) throw new Error("selector unavailable");
      return element;
    });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("搜索项目"), { target: { value: "Second" } });
    const projectDialog = screen.getByRole("dialog", { name: "选择项目" });
    expect(within(projectDialog).getByRole("button", { name: "Real Second Project" })).toBeTruthy();
    fireEvent.click(within(projectDialog).getByRole("button", { name: "Real Second Project" }));
    expect(trigger.textContent).toContain("Real Second Project");
    expect(createFounderConversation).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "＋ 创建新项目" }));
    fireEvent.change(screen.getByLabelText("项目名称"), { target: { value: "Founder Research" } });
    fireEvent.change(screen.getByLabelText("项目描述"), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => expect(createFounderProject).toHaveBeenCalledWith({ name: "Founder Research", description: "New" }));
    expect(trigger.textContent).toContain("Founder Research");
    expect(createFounderConversation).not.toHaveBeenCalled();
  });

  it("routes Home, Project and Conversation contexts without leaking state", async () => {
    const scoped = { ...emptySnapshot, conversation: { id: "conv-scoped", project_id: "project-ai-commerce-os", title: "项目上下文讨论", state: "exploring", updated_at: "2026-08-11T10:00:00Z" }, messages: [{ message_id: "m-scoped", role: "founder", content: "属于 AI Commerce OS" }], digest: { ...emptySnapshot.digest, summary: "项目会话摘要" } };
    const unscoped = { ...emptySnapshot, conversation: { id: "conv-unscoped", project_id: null, title: "未归类讨论", state: "exploring", updated_at: "2026-08-11T11:00:00Z" }, messages: [{ message_id: "m-unscoped", role: "founder", content: "不属于任何项目" }], digest: { ...emptySnapshot.digest, summary: "独立会话摘要" } };
    window.localStorage.setItem("sino-founder-conversation-history", JSON.stringify([{ id: "conv-scoped", title: "项目上下文讨论", updatedAt: Date.now() }, { id: "conv-unscoped", title: "未归类讨论", updatedAt: Date.now() - 1000 }]));
    getConversationWorkspace.mockImplementation((id) => Promise.resolve(id === "conv-scoped" ? scoped : unscoped));
    render(<SinoFounderAIApp />);

    fireEvent.click(await screen.findByRole("button", { name: "AI Commerce OS" }));
    const projectWorkspace = await screen.findByRole("region", { name: "项目工作区" });
    expect(screen.queryByRole("heading", { name: "今天想讨论什么？" })).toBeNull();
    expect(screen.queryByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……")).toBeNull();
    expect(within(projectWorkspace).getByRole("region", { name: "AI Commerce OS 项目会话" })).toBeTruthy();
    expect(within(projectWorkspace).getByRole("button", { name: /Project Intelligence 讨论/ })).toBeTruthy();
    expect(within(projectWorkspace).getByPlaceholderText("继续和 Sino 讨论 AI Commerce OS……")).toBeTruthy();
    expect(within(projectWorkspace).getByPlaceholderText("继续和 Sino 讨论 AI Commerce OS……").closest(".sino-conversation-composer-dock")).toBeTruthy();
    expect(screen.getByLabelText("Founder AI 工作区内容").classList.contains("sino-founder-main--fixed-workspace")).toBe(true);
    expect(within(projectWorkspace).queryByText("Living Project Prompt")).toBeNull();
    expect(within(projectWorkspace).queryByText("最新正式决策")).toBeNull();
    expect(await screen.findByRole("region", { name: "当前项目智能" })).toBeTruthy();

    fireEvent.click(screen.getByTitle("新建讨论"));
    expect(screen.getByRole("heading", { name: "今天想讨论什么？" })).toBeTruthy();
    expect(document.querySelector(".sino-project-selector__trigger")?.textContent).toContain("选择项目");
    const resetContext = screen.getByRole("region", { name: "实现工作区" });
    expect(within(resetContext).getByText("当前讨论尚未形成可实现对象")).toBeTruthy();

    fireEvent.click(screen.getByTitle("项目上下文讨论"));
    expect(await screen.findByText("属于 AI Commerce OS")).toBeTruthy();
    expect(screen.getByLabelText("Founder AI 工作区内容").classList.contains("sino-founder-main--fixed-workspace")).toBe(true);
    expect(document.querySelector(".sino-conversation-thread > .sino-conversation-composer-dock")).toBeTruthy();
    const scopedContext = screen.getByLabelText("当前上下文");
    expect(await within(scopedContext).findByRole("region", { name: "实现工作区" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "AI Commerce OS" }));
    expect(await screen.findByPlaceholderText("继续和 Sino 讨论 AI Commerce OS……")).toBeTruthy();
    expect(screen.getByRole("region", { name: "AI Commerce OS 项目会话" })).toBeTruthy();
    expect(await within(screen.getByLabelText("当前上下文")).findByRole("region", { name: "当前项目智能" })).toBeTruthy();
    expect(window.localStorage.getItem("sino-founder-active-conversation")).toBeNull();

    fireEvent.click(screen.getByTitle("项目上下文讨论"));
    expect(await screen.findByText("属于 AI Commerce OS")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "AI Commerce OS" }));
    expect(await screen.findByPlaceholderText("继续和 Sino 讨论 AI Commerce OS……")).toBeTruthy();
    expect(screen.getByRole("region", { name: "AI Commerce OS 项目会话" })).toBeTruthy();

    fireEvent.click(screen.getByTitle("未归类讨论"));
    expect(await screen.findByText("不属于任何项目")).toBeTruthy();
    await waitFor(() => expect(within(screen.getByLabelText("当前上下文")).getByRole("region", { name: "实现工作区" })).toBeTruthy());
  });

  it("creates a Project-scoped Conversation from the Project workspace composer", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-project-new" });
    discussWithSino.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-project-new", project_id: "project-ai-commerce-os", title: "Prompt 升级规则", state: "exploring" }, messages: [{ message_id: "m-project", role: "founder", content: "继续讨论 Project Intelligence 的 Prompt 升级规则" }] });
    render(<SinoFounderAIApp />);

    fireEvent.click(await screen.findByRole("button", { name: "AI Commerce OS" }));
    const input = await screen.findByPlaceholderText("继续和 Sino 讨论 AI Commerce OS……");
    expect(screen.getByLabelText("当前项目").textContent).toContain("AI Commerce OS");
    expect(createFounderConversation).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "继续讨论 Project Intelligence 的 Prompt 升级规则" } });
    fireEvent.click(within(input.closest("form")).getByRole("button", { name: "发送" }));

    await waitFor(() => expect(createFounderConversation).toHaveBeenCalledWith("新讨论", "project-ai-commerce-os"));
    expect(await screen.findByText("继续讨论 Project Intelligence 的 Prompt 升级规则")).toBeTruthy();
    expect(await within(screen.getByLabelText("当前上下文")).findByRole("region", { name: "实现工作区" })).toBeTruthy();
  });

  it("restores a selected historical Conversation without creating one", async () => {
    window.localStorage.setItem("sino-founder-conversation-history", JSON.stringify([{ id: "conv-old", title: "历史产品讨论", updatedAt: Date.now() }]));
    getFounderConversations.mockResolvedValue([{ id: "conv-old", title: "历史产品讨论", updated_at: new Date().toISOString() }]);
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-old", project_id: "project-ai-commerce-os", state: "exploring" }, messages: [{ message_id: "m-old", role: "founder", content: "旧会话内容" }] });
    render(<SinoFounderAIApp />);
    fireEvent.click(screen.getByRole("button", { name: /历史产品讨论/ }));
    await waitFor(() => expect(getConversationWorkspace).toHaveBeenCalledWith("conv-old"));
    expect((await screen.findAllByText("旧会话内容")).length).toBeGreaterThan(0);
    await waitFor(() => expect(document.querySelector(".sino-project-list .is-active")?.textContent || "").toContain("AI Commerce OS"));
    expect(createFounderConversation).not.toHaveBeenCalled();
  });

  it("removes stale history and preserves the active Conversation when restore returns 404", async () => {
    const validA = { ...emptySnapshot, conversation: { id: "conv-a", title: "正常会话 A" }, messages: [{ message_id: "a", role: "founder", content: "A 内容" }] };
    const validB = { ...emptySnapshot, conversation: { id: "conv-b", title: "正常会话 B" }, messages: [{ message_id: "b", role: "founder", content: "B 内容" }] };
    getFounderConversations.mockResolvedValue([{ id: "conv-a", title: "正常会话 A", updated_at: new Date().toISOString() }, { id: "missing", title: "Object Native Test", updated_at: new Date().toISOString() }, { id: "conv-b", title: "正常会话 B", updated_at: new Date().toISOString() }]);
    getConversationWorkspace.mockImplementation(async (id) => {
      if (id === "missing") { const error = new Error("恢复 Sino 讨论失败（状态码 404）"); error.status = 404; error.code = "conversation_not_found"; throw error; }
      return id === "conv-b" ? validB : validA;
    });
    render(<SinoFounderAIApp />);
    fireEvent.click(await screen.findByRole("button", { name: /正常会话 A/ }));
    expect(await screen.findByText("A 内容")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Object Native Test/ }));
    expect(await screen.findByText(/状态码 404/)).toBeTruthy();
    expect(screen.getByText("A 内容")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Object Native Test/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /正常会话 B/ }));
    expect(await screen.findByText("B 内容")).toBeTruthy();
    expect(window.localStorage.getItem("sino-founder-active-conversation")).toBe("conv-b");
  });

  it("rebuilds stale local history from the authoritative Conversation list", async () => {
    window.localStorage.setItem("sino-founder-conversation-history", JSON.stringify([{ id: "missing", title: "Object Native Test", updatedAt: Date.now() }]));
    getFounderConversations.mockResolvedValue([{ id: "conv-valid", title: "有效会话", updated_at: new Date().toISOString() }]);
    render(<SinoFounderAIApp />);
    expect(await screen.findByRole("button", { name: /有效会话/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Object Native Test/ })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("sino-founder-conversation-history"))).toHaveLength(1);
  });

  it("keeps project and Conversation title fixed while only history groups scroll", async () => {
    getFounderConversations.mockResolvedValue(Array.from({ length: 40 }, (_, index) => ({ id: `conv-${index}`, title: `历史会话 ${index}`, updated_at: new Date(Date.now() - index * 86400000).toISOString() })));
    render(<SinoFounderAIApp />);
    const region = await screen.findByLabelText("历史会话列表");
    expect(region.classList.contains("sino-sidebar__scroll-region")).toBe(true);
    expect(screen.getByText("项目").closest(".sino-sidebar__fixed-top")).toBeTruthy();
    expect(screen.getByText("会话").closest(".sino-sidebar__fixed-top")).toBeTruthy();
    expect(screen.getByTitle("新建讨论").closest(".sino-sidebar__fixed-top")).toBeTruthy();
    expect(screen.getByText("Founder AI Secretary").closest("footer").parentElement).toBe(document.querySelector(".sino-sidebar"));
    fireEvent.click(screen.getByRole("button", { name: /更早/ }));
    expect(await screen.findByRole("button", { name: /历史会话 39/ })).toBeTruthy();
  });

  it("persists history accordion expansion within the browser session", async () => {
    getFounderConversations.mockResolvedValue([{ id: "conv-old", title: "旧会话", updated_at: new Date(Date.now() - 40 * 86400000).toISOString() }]);
    const { unmount } = render(<SinoFounderAIApp />);
    expect(screen.queryByRole("button", { name: /旧会话/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /更早/ }));
    expect(screen.getByRole("button", { name: /旧会话/ })).toBeTruthy();
    unmount();
    render(<SinoFounderAIApp />);
    expect(await screen.findByRole("button", { name: /旧会话/ })).toBeTruthy();
  });

  it("places conversations older than seven days directly in 更早 without a 最近 30 天 group", async () => {
    getFounderConversations.mockResolvedValue([{ id: "conv-20-days", title: "二十天前会话", updated_at: new Date(Date.now() - 20 * 86400000).toISOString() }]);
    render(<SinoFounderAIApp />);
    expect(screen.queryByRole("button", { name: /最近 30 天/ })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /更早/ }));
    expect(screen.getByRole("button", { name: /二十天前会话/ })).toBeTruthy();
  });

  it("cancels and confirms deletion of a non-active Conversation without changing the current one", async () => {
    getFounderConversations.mockResolvedValue([{ id: "conv-a", title: "当前会话", updated_at: new Date().toISOString() }, { id: "conv-b", title: "待删除会话", updated_at: new Date().toISOString() }]);
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-a", title: "当前会话" }, messages: [{ message_id: "a", role: "founder", content: "当前内容" }] });
    render(<SinoFounderAIApp />);
    fireEvent.click(await screen.findByRole("button", { name: /当前会话/ }));
    expect(await screen.findByText("当前内容")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /待删除会话/ }).closest(".sino-conversation-item").querySelector(".sino-conversation-item__menu"));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("button", { name: /待删除会话/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /待删除会话/ }).closest(".sino-conversation-item").querySelector(".sino-conversation-item__menu"));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(deleteFounderConversation).toHaveBeenCalledWith("conv-b"));
    expect(screen.queryByRole("button", { name: /待删除会话/ })).toBeNull();
    expect(screen.getByText("当前内容")).toBeTruthy();
  });

  it("deletes the active Conversation and safely returns Home without a restore 404", async () => {
    getFounderConversations.mockResolvedValue([{ id: "conv-active", title: "当前待删除", updated_at: new Date().toISOString() }]);
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-active", title: "当前待删除" }, messages: [{ message_id: "a", role: "founder", content: "将被删除" }] });
    render(<SinoFounderAIApp />);
    fireEvent.click(await screen.findByRole("button", { name: /当前待删除/ }));
    expect(await screen.findByText("将被删除")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /当前待删除/ }).closest(".sino-conversation-item").querySelector(".sino-conversation-item__menu"));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("heading", { name: "今天想讨论什么？" })).toBeTruthy();
    expect(window.localStorage.getItem("sino-founder-active-conversation")).toBeNull();
    expect(screen.queryByText(/404/)).toBeNull();
  });

  it.skip("legacy page flow: moves an explicitly confirmed Goal and Task Asset into the Execution Center", async () => {
    createFounderConversation.mockResolvedValue({ id: "conv-1" });
    const formalGoal = { goal_id: "goal-1", conversation_id: "conv-1", title: "实施 Timeline", status: "goal_confirmed" };
    discussWithSino.mockResolvedValue({ ...emptySnapshot, goals: [formalGoal] });
    reasonConfirmedGoal.mockResolvedValue({ analysis: {}, evidence: [], solution: {}, task_plan: [], risk: {}, execution_requirement: {}, task_asset_draft: { title: "实施 Timeline", description: "plan", scope: {} }, execution_package: { goal: "实施 Timeline" } });
    createTaskAsset.mockResolvedValue({ id: "task-1" });
    createFounderExecution.mockResolvedValue({ id: "execution-1", task_asset_id: "task-1", status: "draft", execution_allowed: false });
    render(<SinoFounderAIApp />);
    fireEvent.change(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……"), { target: { value: "按这个执行" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));
    expect(await screen.findByRole("region", { name: "当前执行" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "目标推理" })).toBeNull();
    expect(screen.getAllByText("实施 Timeline").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("补充、修改或删除当前执行中的要求……")).toBeTruthy();
    expect(screen.getByLabelText("已确认执行方案")).toBeTruthy();
    expect(screen.queryByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……")).toBeNull();
    expect(createFounderExecution).toHaveBeenCalledWith("task-1", { goal: "实施 Timeline" }, "goal-1");
  });

  it.skip("legacy page flow: persists an Execution Supplement only to the active execution", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-1");
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, goals: [{ goal_id: "goal-1", status: "planning" }], active_execution: active });
    submitExecutionDelta.mockResolvedValue({ delta_id: "delta-1", content: "标题后加中文", status: "applied", package_version: 2 });
    getFounderExecution.mockResolvedValue({ ...active, deltas: [{ delta_id: "delta-1", content: "标题后加中文", status: "applied", package_version: 2 }] });
    render(<SinoFounderAIApp />);
    await waitFor(() => expect(getConversationWorkspace).toHaveBeenCalledWith("conv-1"));
    fireEvent.click(screen.getByRole("button", { name: "执行中心" }));
    expect(screen.getByRole("heading", { name: "执行中心" })).toBeTruthy();
    expect(screen.queryByText("执行控制")).toBeNull();
    expect(await screen.findByRole("region", { name: "执行时间线" })).toBeTruthy();
    const input = await screen.findByPlaceholderText("补充、修改或删除当前执行中的要求……");
    fireEvent.change(input, { target: { value: "标题后加中文" } });
    fireEvent.click(screen.getByRole("button", { name: "提交补充" }));
    await waitFor(() => expect(submitExecutionDelta).toHaveBeenCalledWith("execution-1", { conversation_id: "conv-1", goal_id: "goal-1", task_id: "task-1", content: "标题后加中文" }));
    expect(discussWithSino).not.toHaveBeenCalled();
    expect(createFounderConversation).not.toHaveBeenCalled();
    expect(screen.queryByText("成果 API")).toBeNull();
    expect(screen.queryByText("记忆 API")).toBeNull();
  });

  it.skip("legacy page flow: renders a clean empty state and routes completed returns to Asset & Memory", async () => {
    render(<SinoFounderAIApp />);
    fireEvent.click(screen.getByRole("button", { name: "执行中心" }));
    expect(screen.getByRole("heading", { name: "执行中心" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "当前没有正在执行的任务。" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "当前无需处理" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "暂无执行记录" })).toBeTruthy();
    const disabledSupplement = screen.getByPlaceholderText("当前没有正在执行的任务");
    expect(disabledSupplement.disabled).toBe(true);
    expect(screen.getByText("任务进入执行后，可在这里补充、修改或删除执行要求。")).toBeTruthy();
    expect(within(screen.getByLabelText("当前上下文")).getByText("暂无执行")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "执行时间线" })).toBeNull();
    cleanup();

    window.localStorage.setItem("sino-founder-active-conversation", "conv-result");
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-result" }, goals: [{ goal_id: "goal-result", title: "完成执行", status: "planning" }], active_execution: { ...active, id: "execution-result", status: "completed", artifact: { id: "artifact-result" }, memory: { decision: "已沉淀" }, result_summary: "实现与测试已完成", commit_sha: "abc123" } });
    render(<SinoFounderAIApp />);
    await waitFor(() => expect(getConversationWorkspace).toHaveBeenCalledWith("conv-result"));
    fireEvent.click(screen.getByRole("button", { name: "执行中心" }));
    expect(await screen.findByText("✓ 已回流到资产与记忆")).toBeTruthy();
    expect(screen.getByText("✓ 已沉淀到长期记忆")).toBeTruthy();
    expect(screen.getByText("✓ 已记录")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看记忆" }));
    expect((await screen.findByRole("tab", { name: /长期记忆/ })).getAttribute("aria-selected")).toBe("true");
  });

  it("restores the active Conversation workspace on refresh", async () => {
    window.localStorage.setItem("sino-founder-active-conversation", "conv-restored");
    getProjectIntelligence.mockResolvedValueOnce({ ...intelligence, project_summary: "已恢复的讨论", execution_refs: [{ execution_id: "execution-1", status: "paused", goal: "恢复中的任务" }] });
    getConversationWorkspace.mockResolvedValue({ ...emptySnapshot, conversation: { id: "conv-restored", state: "executing" }, messages: [{ message_id: "m1", role: "founder", content: "保持当前颜色" }], digest: { ...emptySnapshot.digest, summary: "已恢复的讨论" }, goals: [{ goal_id: "goal-1", status: "planning" }], active_execution: { ...active, status: "paused" } });
    render(<SinoFounderAIApp />);
    await waitFor(() => expect(getConversationWorkspace).toHaveBeenCalledWith("conv-restored"));
    expect(await screen.findByRole("region", { name: "Conversation" })).toBeTruthy();
    expect(screen.getAllByText("保持当前颜色").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "实现工作区" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("补充、修改或删除当前执行中的要求……")).toBeNull();
    expect(createFounderConversation).not.toHaveBeenCalled();
    expect(createFounderExecution).not.toHaveBeenCalled();
  });

  it.skip("legacy page flow: keeps one Global Shell while primary views change their context panel", async () => {
    render(<SinoFounderAIApp />);
    const shell = document.querySelector(".sino-founder-shell");
    expect(shell).toBeTruthy();
    expect(document.querySelectorAll(".sino-sidebar")).toHaveLength(1);
    expect(document.querySelectorAll(".sino-founder-topbar")).toHaveLength(1);
    expect(within(screen.getByLabelText("当前上下文")).getByText("未选择")).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "对象工作区筛选" })).queryByRole("button", { name: "战略与路线" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "系统构建器" }));
    expect(document.querySelector(".sino-founder-shell")).toBe(shell);
    expect(within(screen.getByLabelText("当前上下文")).getByText("选择一个构建对象查看上下文")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "应用系统架构" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "系统构建器模块" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "能力中心" }));
    expect(screen.getByRole("button", { name: "能力中心" }).classList.contains("is-active")).toBe(true);
    expect(await screen.findByText("Sino AI 秘书")).toBeTruthy();
    expect(screen.getByRole("button", { name: "＋ 添加 Agent" })).toBeTruthy();
    expect(within(screen.getByLabelText("当前上下文")).getByText("管理 Sino AI 秘书及其模型、技能与执行能力")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "目标推理" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "执行中心" }));
    expect(screen.getByRole("button", { name: "执行中心" }).classList.contains("is-active")).toBe(true);
    expect(within(screen.getByLabelText("当前上下文")).getByText("执行上下文")).toBeTruthy();
  });

  it("uses one Object Workspace with projection filters and one stable Object Inspector", async () => {
    getFounderObjects.mockResolvedValue([{ object_id: "object-chrome", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", status: "approved", version: 2, execution_refs: [{ execution_id: "exec-1", status: "draft" }] }]);
    window.history.replaceState({}, "", "/?workspace=objects");
    render(<SinoFounderAIApp />);
    const topNavigation = screen.getByRole("navigation", { name: "对象工作区筛选" });
    expect(within(topNavigation).getAllByRole("button").map((button) => button.textContent)).toEqual(["全部", "系统关系", "能力", "执行", "演化"]);
    expect(screen.queryByRole("button", { name: "Sino Founder AI" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Object Workspace" })).toBeNull();
    expect(await screen.findByRole("region", { name: "Object Workspace Infinite Workspace" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "对象详情" })).toBeTruthy();
    for (const label of ["全部", "系统关系", "能力", "执行", "演化"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("region", { name: "Object Workspace Infinite Workspace" })).toBeTruthy();
      expect(screen.getByRole("button", { name: label }).classList.contains("is-active")).toBe(true);
    }
    expect(screen.queryByText("项目上下文")).toBeNull();
    expect(screen.queryByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……")).toBeNull();
    expect(document.querySelector(".sino-founder-main--object-workspace")).toBeTruthy();
  });

  it("restores workspace view and selected real object from URL after refresh", async () => {
    const object = { object_id: "object-chrome", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", status: "approved", version: 2, execution_refs: [{ execution_id: "exec-1", status: "draft" }] };
    window.history.replaceState({}, "", "/?workspace=objects&filter=execution&object=object-chrome");
    getFounderObjects.mockResolvedValue([object]);
    getFounderObject.mockResolvedValue(object);
    render(<SinoFounderAIApp />);
    expect(await screen.findByRole("region", { name: "Object Workspace Infinite Workspace" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "执行" }).classList.contains("is-active")).toBe(true);
    expect(await screen.findByRole("heading", { name: "Chrome Extension Skill" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "对象详情" }).textContent).toContain("object-chrome");
  });

  it("continues from the backend-resolved source conversation and restores context after refresh", async () => {
    const object = { object_id: "object-chrome", object_type: "skill", name: "Chrome Extension Skill", status: "approved", version: 2, source_conversation_id: "conv-stale", execution_refs: [] };
    const restored = { ...emptySnapshot, conversation: { id: "conv-real", project_id: null, title: "Chrome Skill" }, context_object: object, active_context_object_id: object.object_id, founder_objects: [{ ...object, is_context_object: true }] };
    window.history.replaceState({}, "", "/?workspace=objects&filter=builder&object=object-chrome");
    getFounderObjects.mockResolvedValue([object]); getFounderObject.mockResolvedValue(object);
    continueFounderObjectDiscussion.mockResolvedValue({ ...object, context_conversation_id: "conv-real" });
    getConversationWorkspace.mockResolvedValue(restored);
    render(<SinoFounderAIApp />);
    fireEvent.click(await screen.findByRole("button", { name: /Chrome Extension Skill/ }));
    fireEvent.click(await screen.findByRole("button", { name: "继续讨论" }));
    await waitFor(() => expect(getConversationWorkspace).toHaveBeenCalledWith("conv-real"));
    expect(await screen.findByText("正在讨论")).toBeTruthy();
    expect(screen.getAllByText("Chrome Extension Skill").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("sino-founder-active-conversation")).toBe("conv-real");
  });

  it.skip("legacy page flow: renders selected Asset detail in the Global Context Panel", async () => {
    const artifact = { artifact_id: "artifact-shell", title: "Shell Artifact", artifact_type: "code", status: "active", version: 1, created_at: "2026-08-11T00:00:00Z", history: [], references: [] };
    getAssetMemoryCenter.mockResolvedValue({ artifacts: [artifact], memories: [], executions: [] });
    getLibraryArtifact.mockResolvedValue(artifact);
    render(<SinoFounderAIApp />);
    fireEvent.click(screen.getByRole("button", { name: "资产与记忆" }));
    fireEvent.click(await screen.findByText("Shell Artifact"));
    const contextPanel = screen.getByLabelText("当前上下文");
    expect(await within(contextPanel).findByText("成果详情")).toBeTruthy();
    expect(within(contextPanel).getByText("artifact-shell")).toBeTruthy();
    expect(document.querySelectorAll(".sino-founder-context")).toHaveLength(1);
  });

  it.skip("legacy page flow: renders Strategic Assets in the Asset Center Global Context Panel", async () => {
    getFounderStrategy.mockResolvedValue({ current_phase: "Memory Evolution", current_strategic_position: "Founder intelligence active", roadmap: { vision: "Build AI Commerce OS", status: "active", milestones: [] }, capability_status: { applications: [] }, recommendations: [] });
    render(<SinoFounderAIApp />);
    fireEvent.click(screen.getByRole("button", { name: "资产与记忆" }));
    fireEvent.click(await screen.findByRole("tab", { name: /战略资产 5/ }));
    fireEvent.click(screen.getByText("战略定位"));
    const contextPanel = screen.getByLabelText("当前上下文");
    expect(await within(contextPanel).findByText("战略资产详情")).toBeTruthy();
    expect(within(contextPanel).getByRole("region", { name: "战略总览卡片" })).toBeTruthy();
  });
});
