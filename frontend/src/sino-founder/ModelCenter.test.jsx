// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkModelProvider, discoverProviderModels, getModelCenter, installModelProvider, saveCapabilityAssignment, saveExecutionEngine, saveMultiModelAssignment, selectProviderModels } from "../services/founderAiApi.js";
import { ModelCenter } from "./ModelCenter.jsx";

vi.mock("../services/founderAiApi.js", () => ({ checkModelProvider: vi.fn(), deleteModelProvider: vi.fn(), discoverProviderModels: vi.fn(), getModelCenter: vi.fn(), installModelProvider: vi.fn(), saveCapabilityAssignment: vi.fn(), saveExecutionEngine: vi.fn(), saveMultiModelAssignment: vi.fn(), selectProviderModels: vi.fn(), setModelProviderEnabled: vi.fn(), updateModelProviderCredentials: vi.fn() }));

const deepseek = { provider_key: "deepseek", provider_type: "deepseek", display_name: "DeepSeek", installed: true, configured: true, api_key_mask: "****1234", enabled: true, health_status: "healthy", model: "deepseek-chat", available_models: [{ model_id: "deepseek-chat", display_name: "DeepSeek Chat", recommendation_score: 90 }, { model_id: "deepseek-reasoner", display_name: "DeepSeek Reasoner", recommendation_score: 90 }], selected_models: ["deepseek-chat"] };
const claude = { provider_key: "claude", provider_type: "anthropic", display_name: "Claude", installed: true, configured: true, enabled: true, health_status: "unhealthy", health_error: "insufficient_quota", model: "claude-sonnet-5", available_models: [{ model_id: "claude-sonnet-5", display_name: "Claude Sonnet 5", recommendation_score: 90 }], selected_models: ["claude-sonnet-5"] };
const gpt = { provider_key: "gpt", provider_type: "openai", display_name: "GPT", installed: true, configured: false, enabled: true, health_status: "unhealthy", health_error: "invalid_credentials", model: "", available_models: [], selected_models: [] };
const capabilities = [
  { role_key: "sino_conversation", label: "Sino 对话", provider_key: "deepseek", model: "deepseek-chat", fixed: false },
  { role_key: "system_builder", label: "系统构建器", provider_key: null, fixed: false },
  { role_key: "goal_reasoning", label: "目标推理", provider_key: null, fixed: false },
  { role_key: "project_analysis", label: "项目分析", provider_key: null, fixed: false },
  { role_key: "multi_model_discussion", label: "多模型讨论", provider_key: null, model: null, multiple: true, models: [{ provider_key: "deepseek", model: "deepseek-chat" }] },
  { role_key: "code_execution", label: "代码执行", provider_key: "deepseek", model: "deepseek-chat", fixed: false, execution_engine_id: "codex" },
];
const appAssignments = capabilities.map((item) => ({ capability_key: item.role_key, label: item.label, provider_key: item.fixed ? "codex" : null, model: item.fixed ? "Codex" : null, fixed: item.fixed }));
const agents = [{ agent_id: "sino_founder_ai", application_system_id: "founder_ai", display_name: "Sino AI 秘书", description: "Founder AI 当前唯一的核心 AI Agent，负责讨论、项目理解、决策沉淀、知识整理、系统构建与执行协同。", status: "running", agent_type: "ai_secretary" }];
const skills = [{ skill_id: "conversation", agent_id: "sino_founder_ai", display_name: "对话", description: "与 Founder 持续讨论并维护上下文。", status: "running", model_assignment: { provider_key: "deepseek", model: "deepseek-chat" }, prompt_refs: [], workflow_refs: [], tool_refs: [] }, { skill_id: "reasoning", agent_id: "sino_founder_ai", display_name: "推理", description: "用于目标理解、约束分析、方案判断和执行中的局部重新推理。", status: "unconfigured", model_assignment: null, prompt_refs: [], workflow_refs: [], tool_refs: [] }, { skill_id: "project_intelligence", agent_id: "sino_founder_ai", display_name: "项目智能", description: "恢复项目上下文、定位、知识、决策和待确认问题。", status: "unconfigured", model_assignment: null, prompt_refs: [], workflow_refs: [], tool_refs: [] }, { skill_id: "multi_model_discussion", agent_id: "sino_founder_ai", display_name: "多模型讨论", description: "组织多个模型独立分析、比较分歧并由 Sino 综合。", status: "running", model_assignments: [{ provider_key: "deepseek", model: "deepseek-chat" }], prompt_refs: [], workflow_refs: [], tool_refs: [] }];
const center = { provider_catalog: [{ provider_type: "openai", display_name: "OpenAI", default_base_url: "https://api.openai.com/v1", requires_base_url: false }, { provider_type: "anthropic", display_name: "Anthropic", default_base_url: "https://api.anthropic.com/v1", requires_base_url: false }, { provider_type: "ofoxai", display_name: "OfoxAI", default_base_url: "", requires_base_url: true }], providers: [deepseek], roles: capabilities, agents, skills, applications: [{ application_key: "founder_ai", label: "Founder AI", assignments: appAssignments }, { application_key: "operator_ai", label: "Operator AI", assignments: appAssignments }], health_cost: [{ ...deepseek, usage: { calls: 3, tokens: null, cost: null, average_latency_ms: 120.5, quota: null } }], execution_engines: [{ engine_id: "codex", display_name: "Codex", status: "available", engine_type: "codex" }] };

describe("AI Capability Center", () => {
  beforeEach(() => { vi.clearAllMocks(); getModelCenter.mockResolvedValue(center); });
  afterEach(cleanup);

  it("lists only the real Sino agent and no fake work or future agent", async () => {
    render(<ModelCenter />);
    expect(await screen.findByText("Sino AI 秘书")).toBeTruthy();
    expect(screen.getByText(/运行中/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "＋ 添加 Agent" })).toBeTruthy();
    expect(screen.queryByText("新闻抓取")).toBeNull();
    expect(screen.queryByText("AI 媒体专员")).toBeNull();
    expect(screen.queryByText("Operator AI")).toBeNull();
  });

  it("selects and persists the execution engine independently", async () => {
    saveExecutionEngine.mockResolvedValue(center);
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书");
    fireEvent.click(screen.getByRole("button", { name: "管理" }));
    const selector = screen.getByRole("combobox", { name: "执行引擎" });
    expect(selector.value).toBe("codex");
    expect(screen.queryByText("系统固定")).toBeNull();
    fireEvent.change(selector, { target: { value: "codex" } });
    await waitFor(() => expect(saveExecutionEngine).toHaveBeenCalledWith("codex"));
  });

  it("adds a Provider with API Key and automatic model discovery", async () => {
    installModelProvider.mockResolvedValue({});
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书"); fireEvent.click(screen.getByRole("button", { name: "模型" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 添加模型" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenAIGPT 系列未添加选择/ }));
    fireEvent.change(screen.getByPlaceholderText("请输入 API Key"), { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    await waitFor(() => expect(installModelProvider).toHaveBeenCalledWith(expect.objectContaining({ provider_type: "openai", api_key: "secret-value" })));
    expect(screen.queryByDisplayValue("secret-value")).toBeNull();
  });

  it("offers OfoxAI as a formal provider and requires its service URL", async () => {
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书"); fireEvent.click(screen.getByRole("button", { name: "模型" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ 添加模型" }));
    fireEvent.click(screen.getByRole("button", { name: /OfoxAIGPT \/ Claude 等模型未添加选择/ }));
    fireEvent.change(screen.getByPlaceholderText("请输入 API Key"), { target: { value: "ofox-secret" } });
    expect(screen.getByPlaceholderText("请输入服务商提供的 Base URL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "连接" }).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("请输入服务商提供的 Base URL"), { target: { value: "https://gateway.ofox.example/v1" } });
    expect(screen.getByRole("button", { name: "连接" }).disabled).toBe(false);
  });

  it("refreshes and selects discovered models without a model text input", async () => {
    discoverProviderModels.mockResolvedValue(deepseek); selectProviderModels.mockResolvedValue(deepseek);
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书"); fireEvent.click(screen.getByRole("button", { name: "模型" }));
    fireEvent.click(screen.getAllByRole("button", { name: "管理" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
    await waitFor(() => expect(discoverProviderModels).toHaveBeenCalledWith("deepseek"));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /deepseek-reasoner/ })[0]);
    await waitFor(() => expect(selectProviderModels).toHaveBeenCalledWith("deepseek", ["deepseek-chat", "deepseek-reasoner"]));
    expect(screen.queryByText("Model")).toBeNull();
  });

  it("persists Sino model and multi-model assignments in agent detail", async () => {
    saveCapabilityAssignment.mockResolvedValue(center); saveMultiModelAssignment.mockResolvedValue(center);
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书");
    fireEvent.click(screen.getByRole("button", { name: "管理" }));
    expect(screen.getByText("技能")).toBeTruthy();
    expect(screen.getByText("项目智能")).toBeTruthy();
    expect(screen.getByText("推理")).toBeTruthy();
    expect(screen.queryByText("当前职责")).toBeNull();
    expect(screen.queryByText("待确认问题")).toBeNull();
    expect(screen.queryByText("会话上下文")).toBeNull();
    expect(screen.getByText("尚未配置工作流")).toBeTruthy();
    expect(screen.getByText("当前暂无可管理工具")).toBeTruthy();
    expect(screen.getByText("Conversation Memory")).toBeTruthy();
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "deepseek::deepseek-chat" } });
    await waitFor(() => expect(saveCapabilityAssignment).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek Chat/ }));
    await waitFor(() => expect(saveMultiModelAssignment).toHaveBeenCalled());
  });

  it("shows real health metrics and unknown cost fields without fabrication", async () => {
    checkModelProvider.mockResolvedValue({ status: "healthy", configuration: deepseek });
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书");
    fireEvent.click(screen.getByRole("button", { name: "状态与成本" }));
    expect(screen.getByText("120.5 ms")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("hides unconfigured GPT from My Models and relocates reconnect to Add Model", async () => {
    const multi = { ...center, providers: [deepseek, claude, gpt], health_cost: center.health_cost };
    getModelCenter.mockResolvedValue(multi);
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书"); fireEvent.click(screen.getByRole("button", { name: "模型" }));
    expect(screen.queryByText("GPT")).toBeNull();
    expect(screen.getAllByRole("button", { name: "管理" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "＋ 添加模型" }));
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getByText("认证失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: /OpenAIGPT 系列认证失败重新连接/ })).toBeTruthy();
  });

  it("isolates Claude health feedback and renders quota accurately", async () => {
    const multi = { ...center, providers: [deepseek, claude, gpt], health_cost: center.health_cost };
    getModelCenter.mockResolvedValue(multi);
    checkModelProvider.mockResolvedValue({ status: "unhealthy", configuration: claude });
    render(<ModelCenter />); await screen.findByText("Sino AI 秘书"); fireEvent.click(screen.getByRole("button", { name: "模型" }));
    fireEvent.click(screen.getAllByRole("button", { name: "管理" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "检查连接" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("账户额度不足"));
    expect(screen.queryByText("认证失败")).toBeNull();
    expect(screen.getAllByText("DeepSeek Chat")).toHaveLength(1);
  });
});
