// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkModelProvider, discoverProviderModels, getModelCenter, getRuntimeEnvironmentRegistry, installModelProvider, saveCapabilityAssignment, saveExecutionEngine, saveMultiModelAssignment, selectProviderModels, updateModelProviderCredentials } from "../services/founderAiApi.js";
import { ModelCenter, SettingsContext } from "./ModelCenter.jsx";
import "./sino-founder-ai.css";

vi.mock("../services/founderAiApi.js", () => ({ checkModelProvider: vi.fn(), deleteModelProvider: vi.fn(), discoverProviderModels: vi.fn(), getModelCenter: vi.fn(), getRuntimeEnvironmentRegistry: vi.fn(), installModelProvider: vi.fn(), saveCapabilityAssignment: vi.fn(), saveExecutionEngine: vi.fn(), saveMultiModelAssignment: vi.fn(), selectProviderModels: vi.fn(), setModelProviderEnabled: vi.fn(), updateModelProviderCredentials: vi.fn() }));

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
const runtimeRegistry = { registry_id: "runtime-environment-registry-founder-ai", environments: [{ environment_type: "LOCAL", status: "ACTIVE", services: [{ service_id: "founder_frontend", protocol: "http", host: "127.0.0.1", port: 5173, status: "ACTIVE", health: "healthy", last_verified_at: "2026-08-17T05:49:31Z" }, { service_id: "founder_backend", protocol: "http", host: "127.0.0.1", port: 8000, status: "ACTIVE", health: "healthy", last_verified_at: "2026-08-17T05:49:31Z" }], database: { type: "PostgreSQL", connectivity_status: "verified", health_status: "healthy", credential_reference_exists: true, last_verified_at: "2026-08-17T05:49:31Z" }, iam: { type: "application-level HTTP Bearer RBAC", verification_status: "verified", last_verified_at: "2026-08-17T05:49:31Z" }, network: { boundary: "loopback", verification_status: "verified", last_verified_at: "2026-08-17T05:49:31Z" } }, { environment_type: "NAS", status: "PLANNED" }, { environment_type: "COMMERCIAL_CLOUD", status: "NOT_CONFIGURED" }] };

function SettingsHarness() {
  const [detail, setDetail] = useState(null);
  return <><ModelCenter onContextChange={setDetail} /><SettingsContext detail={detail} onClose={vi.fn()} /></>;
}

describe("Founder Settings", () => {
  beforeEach(() => { vi.clearAllMocks(); getModelCenter.mockResolvedValue(center); getRuntimeEnvironmentRegistry.mockResolvedValue(runtimeRegistry); });
  afterEach(cleanup);

  it("uses the Settings identity and four configuration categories", async () => {
    const onContextChange = vi.fn();
    render(<ModelCenter onContextChange={onContextChange} />);
    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    expect(screen.queryByText("Sino Founder AI 系统配置")).toBeNull();
    expect(screen.queryByText("配置 Sino Founder AI 使用的模型、API、讨论与执行环境。")).toBeNull();
    expect(screen.queryByText("AI 能力中心")).toBeNull();
    expect(screen.queryByText("API Key ****1234")).toBeNull();
    expect(screen.queryByText(/secret-value/)).toBeNull();
    expect(screen.queryByRole("region", { name: "连接状态" })).toBeNull();
    for (const name of ["模型与 API", "Sino AI", "执行器", "讨论配置"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "← 返回 Founder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "关闭设置" })).toBeNull();
    expect(document.querySelector(".sino-settings-tabs")).toBeTruthy();
  });

  it("shows selected Provider details in the shared Settings Context", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<SettingsContext detail={{ section: "models", provider: deepseek, model: deepseek.available_models[0] }} onClose={onClose} />);
    expect(screen.getByText("Sino Founder AI 系统配置")).toBeTruthy();
    expect(screen.getByText("配置 Sino Founder AI 使用的模型、API、讨论与执行环境。")).toBeTruthy();
    expect(screen.getByText(/DeepSeek \/ deepseek/)).toBeTruthy();
    expect(screen.getByText("****1234")).toBeTruthy();
    expect(screen.getByText("Available Models")).toBeTruthy();
    rerender(<SettingsContext detail={{ section: "sino" }} onClose={onClose} />);
    expect(screen.getByText("Sino Founder AI 系统配置")).toBeTruthy();
    expect(screen.getByText("设置详情")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows verified LOCAL bindings and future stages without exposing credential references", async () => {
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "Runtime Environment" }));
    expect(await screen.findByText("http://127.0.0.1:5173")).toBeTruthy();
    expect(screen.getByText("http://127.0.0.1:8000")).toBeTruthy();
    expect(screen.getByText("PostgreSQL / LOCAL")).toBeTruthy();
    expect(screen.getByText("application-level HTTP Bearer RBAC")).toBeTruthy();
    expect(screen.getByText("loopback")).toBeTruthy();
    expect(screen.getByText("Configured / Reference Exists")).toBeTruthy();
    expect(screen.getByText("PLANNED")).toBeTruthy();
    expect(screen.getAllByText("NOT_CONFIGURED").length).toBeGreaterThanOrEqual(1);
    expect(document.body.textContent).not.toContain("credential-reference://");
  });

  it("uses the middle Settings panel as the sole scroll container and keeps the last runtime card reachable", async () => {
    render(<div className="sino-founder-shell"><main className="sino-founder-main sino-founder-main--fixed-workspace"><ModelCenter /></main><aside className="sino-founder-context" aria-label="Settings Context">Settings Context</aside></div>);
    await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "Runtime Environment" }));
    const settings = screen.getByRole("region", { name: "设置" });
    expect(settings.matches(".sino-founder-main--fixed-workspace > .sino-settings")).toBe(true);
    expect(settings.contains(screen.getByText("Network"))).toBe(true);
    expect(screen.getByLabelText("Settings Context")).toBeTruthy();
    expect(screen.getByRole("main").classList.contains("sino-founder-main--fixed-workspace")).toBe(true);
  });

  it("selects and persists the execution engine independently", async () => {
    saveExecutionEngine.mockResolvedValue(center);
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "执行器" }));
    fireEvent.click(screen.getByRole("button", { name: /Codex/ }));
    const selector = screen.getByRole("combobox", { name: "执行引擎" });
    expect(selector.value).toBe("codex");
    expect(screen.queryByText("系统固定")).toBeNull();
    fireEvent.change(selector, { target: { value: "codex" } });
    await waitFor(() => expect(saveExecutionEngine).toHaveBeenCalledWith("codex"));
  });

  it("adds a Provider with API Key and automatic model discovery", async () => {
    installModelProvider.mockResolvedValue({});
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "＋ 添加模型" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenAIGPT 系列未添加选择/ }));
    fireEvent.change(screen.getByPlaceholderText("请输入 API Key"), { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));
    await waitFor(() => expect(installModelProvider).toHaveBeenCalledWith(expect.objectContaining({ provider_type: "openai", api_key: "secret-value" })));
    expect(screen.queryByDisplayValue("secret-value")).toBeNull();
  });

  it("offers OfoxAI as a formal provider and requires its service URL", async () => {
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
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
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    expect(screen.queryByRole("button", { name: "管理" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek Chat/ }));
    fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
    await waitFor(() => expect(discoverProviderModels).toHaveBeenCalledWith("deepseek"));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /deepseek-reasoner/ })[0]);
    await waitFor(() => expect(selectProviderModels).toHaveBeenCalledWith("deepseek", ["deepseek-chat", "deepseek-reasoner"]));
    expect(screen.queryByPlaceholderText("Model")).toBeNull();
  });

  it("persists Sino model and multi-model assignments in agent detail", async () => {
    saveCapabilityAssignment.mockResolvedValue(center); saveMultiModelAssignment.mockResolvedValue(center);
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "Sino AI" }));
    fireEvent.click(screen.getByRole("button", { name: /默认对话模型/ }));
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "deepseek::deepseek-chat" } });
    await waitFor(() => expect(saveCapabilityAssignment).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "讨论配置" }));
    fireEvent.click(screen.getByRole("button", { name: /多模型讨论/ }));
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek Chat/ }));
    await waitFor(() => expect(saveMultiModelAssignment).toHaveBeenCalled());
  });

  it("shows real health metrics and unknown cost fields without fabrication", async () => {
    checkModelProvider.mockResolvedValue({ status: "healthy", configuration: deepseek });
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    expect(screen.getByText("120.5 ms")).toBeTruthy();
    expect(screen.getByRole("table", { name: "模型状态列表" })).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("hides unconfigured GPT from My Models and relocates reconnect to Add Model", async () => {
    const multi = { ...center, providers: [deepseek, claude, gpt], health_cost: center.health_cost };
    getModelCenter.mockResolvedValue(multi);
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    expect(screen.queryByText("GPT")).toBeNull();
    expect(screen.queryByRole("button", { name: "管理" })).toBeNull();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "＋ 添加模型" }));
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getByText("认证失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: /OpenAIGPT 系列认证失败重新连接/ })).toBeTruthy();
  });

  it("isolates Claude health feedback and renders quota accurately", async () => {
    const multi = { ...center, providers: [deepseek, claude, gpt], health_cost: center.health_cost };
    getModelCenter.mockResolvedValue(multi);
    checkModelProvider.mockResolvedValue({ status: "unhealthy", configuration: claude });
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: /Claude Sonnet 5/ }));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("账户额度不足"));
    expect(screen.queryByText("认证失败")).toBeNull();
    expect(screen.getAllByText("DeepSeek Chat").length).toBeGreaterThanOrEqual(1);
  });

  it("updates Provider credentials only from the right Context and never reveals the existing key", async () => {
    updateModelProviderCredentials.mockResolvedValue(deepseek);
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: /DeepSeek Chat/ }));
    expect(screen.getByText("****1234")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "更新 API Key" }));
    const input = screen.getByLabelText("新的 API Key");
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "replacement-key" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateModelProviderCredentials).toHaveBeenCalledWith("deepseek", { api_key: "replacement-key", base_url: null, display_name: null }));
    expect(screen.queryByDisplayValue("replacement-key")).toBeNull();
  });
});
