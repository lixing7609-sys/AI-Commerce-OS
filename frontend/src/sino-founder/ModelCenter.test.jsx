// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkModelProvider, discoverProviderModels, getModelCenter, getRuntimeEnvironmentRegistry, installModelProvider, saveCapabilityAssignment, saveModelRoutingPreferred, saveMultiModelAssignment, selectProviderModels, updateModelProviderCredentials } from "../services/founderAiApi.js";
import { MODEL_ASSIGNMENT_STATUS, ModelCenter, ProviderConfigModal, buildAssignedModelEconomics, resolveAssignmentStatus, resolveModelAssignmentStatus } from "./ModelCenter.jsx";
import "./sino-founder-ai.css";

vi.mock("../services/founderAiApi.js", () => ({ checkModelProvider: vi.fn(), discoverProviderModels: vi.fn(), getModelCenter: vi.fn(), getRuntimeEnvironmentRegistry: vi.fn(), installModelProvider: vi.fn(), saveCapabilityAssignment: vi.fn(), saveModelRoutingPreferred: vi.fn(), saveMultiModelAssignment: vi.fn(), selectProviderModels: vi.fn(), updateModelProviderCredentials: vi.fn() }));

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

const capabilityRegistry = { registry_id: "model-capability-registry-v1", models: [
  { provider_id: "gpt", model_id: "gpt-5-pro", display_name: "GPT 5 Pro", enabled: true, selected: true, healthy: true, capabilities: { supports_text_reasoning: { status: "UNVERIFIED" }, supports_vision_understanding: { status: "BLOCKED" }, supports_image_generation: { status: "UNVERIFIED" }, supports_tool_use: { status: "UNVERIFIED" }, supports_structured_output: { status: "UNVERIFIED" } } },
  { provider_id: "deepseek", model_id: "deepseek-chat", display_name: "DeepSeek Chat", enabled: true, selected: true, healthy: true, capabilities: { supports_text_reasoning: { status: "VERIFIED" }, supports_vision_understanding: { status: "UNVERIFIED" }, supports_image_generation: { status: "UNVERIFIED" }, supports_tool_use: { status: "UNVERIFIED" }, supports_structured_output: { status: "UNVERIFIED" } } },
  { provider_id: "ofox", model_id: "gemini-3.6-flash", display_name: "Gemini 3.6 Flash", enabled: true, selected: true, healthy: true, capabilities: { supports_text_reasoning: { status: "UNVERIFIED" }, supports_vision_understanding: { status: "VERIFIED" }, supports_image_generation: { status: "UNVERIFIED" }, supports_tool_use: { status: "UNVERIFIED" }, supports_structured_output: { status: "VERIFIED" } } },
], routing_policies: [
  { capability: "VISION_UNDERSTANDING", preferred_primary: { provider_id: "gpt", model_id: "gpt-5-pro" }, active_primary: { provider_id: "ofox", model_id: "gemini-3.6-flash", display_name: "Gemini 3.6 Flash" }, configured_fallback: { provider_id: "ofox", model_id: "gemini-3.6-flash", display_name: "Gemini 3.6 Flash" }, fallbacks: [], status: "ACTIVE", preferred_status: "UNVERIFIED_OR_UNHEALTHY" },
  { capability: "IMAGE_GENERATION", preferred_primary: null, active_primary: null, configured_fallback: null, fallbacks: [], status: "MISSING", preferred_status: "AUTO" },
] };

function SettingsHarness() {
  return <ModelCenter />;
}

describe("Founder Settings", () => {
  beforeEach(() => { vi.clearAllMocks(); getModelCenter.mockResolvedValue(center); getRuntimeEnvironmentRegistry.mockResolvedValue(runtimeRegistry); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("resolves every model and assignment state through the four-state truth matrix", () => {
    const { NORMAL, CONFIG_ERROR, ERROR, UNCONFIGURED } = MODEL_ASSIGNMENT_STATUS;
    const choices = [{ value: "healthy", healthy: true }, { value: "unhealthy", healthy: false }];
    expect(resolveModelAssignmentStatus({ value: "", choices })).toBe(UNCONFIGURED);
    expect(resolveModelAssignmentStatus({ value: "healthy", choices })).toBe(NORMAL);
    expect(resolveModelAssignmentStatus({ value: "missing", choices })).toBe(CONFIG_ERROR);
    expect(resolveModelAssignmentStatus({ value: "healthy", choices, invalid: true })).toBe(CONFIG_ERROR);
    expect(resolveModelAssignmentStatus({ value: "unhealthy", choices })).toBe(ERROR);

    const matrix = [
      [UNCONFIGURED, UNCONFIGURED, true, UNCONFIGURED],
      [NORMAL, UNCONFIGURED, true, NORMAL],
      [NORMAL, ERROR, true, NORMAL],
      [CONFIG_ERROR, UNCONFIGURED, true, CONFIG_ERROR],
      [ERROR, UNCONFIGURED, true, ERROR],
      [ERROR, NORMAL, true, NORMAL],
      [ERROR, ERROR, true, ERROR],
      [NORMAL, CONFIG_ERROR, true, NORMAL],
      [ERROR, NORMAL, false, ERROR],
    ];
    for (const [primaryStatus, fallbackStatus, fallbackSupported, expected] of matrix) {
      expect(resolveAssignmentStatus({ primaryStatus, fallbackStatus, fallbackSupported })).toBe(expected);
    }
  });

  it("aggregates assigned model economics by Provider and model without inventing usage", () => {
    const roles = [
      { role_key: "sino_conversation", provider_key: "deepseek", model: "deepseek-chat", fallbacks: [{ provider_key: "claude", model: "claude-sonnet-5" }] },
      { role_key: "deep_thinking", provider_key: "deepseek", model: "deepseek-chat", fallbacks: [] },
      { role_key: "code_execution", provider_key: "claude", model: "claude-sonnet-5", fallbacks: [] },
      { role_key: "multi_model_discussion", slots: [{ primary: { provider_key: "deepseek", model: "deepseek-chat" }, fallback: null }, { primary: { provider_key: "missing", model: "missing-model" }, fallback: null }] },
    ];
    const options = [
      { value: "deepseek::deepseek-chat", label: "DeepSeek Chat", healthy: true, provider: { display_name: "DeepSeek" } },
      { value: "claude::claude-sonnet-5", label: "Claude Sonnet 5", healthy: false, provider: { display_name: "Claude" } },
      { value: "unused::unused-model", label: "Unused", healthy: true, provider: { display_name: "Unused" } },
    ];
    const result = buildAssignedModelEconomics({ roles, options, registry: {}, modelUsage: [{ provider_id: "deepseek", model_id: "deepseek-chat", request_count: 3, completed_request_count: 2, average_latency_ms: 120.5 }] });
    expect(result).toHaveLength(3);
    expect(result.some((item) => item.model_id === "unused-model")).toBe(false);
    const deepseekEconomics = result.find((item) => item.model_id === "deepseek-chat");
    expect(deepseekEconomics.roles).toEqual(["Sino 主对话", "深度推理", "讨论模型 1"]);
    expect(deepseekEconomics.request_count).toBe(3);
    expect(deepseekEconomics.total_tokens).toBeNull();
    expect(deepseekEconomics.cost).toBeNull();
    const claudeEconomics = result.find((item) => item.model_id === "claude-sonnet-5");
    expect(claudeEconomics.roles).toEqual(["Sino 主对话 Fallback", "Coding"]);
    expect(claudeEconomics.request_count).toBeNull();
    expect(claudeEconomics.assignment_status).toBe(MODEL_ASSIGNMENT_STATUS.ERROR);
    expect(result.find((item) => item.model_id === "missing-model").assignment_status).toBe(MODEL_ASSIGNMENT_STATUS.CONFIG_ERROR);
  });

  it("uses one top-level model navigation and keeps operational domains as page entries", async () => {
    render(<ModelCenter />);
    expect(await screen.findByRole("heading", { name: "设置" })).toBeTruthy();
    expect(screen.queryByText("Sino Founder AI 系统配置")).toBeNull();
    expect(screen.queryByText("配置 Sino Founder AI 使用的模型、API、讨论与执行环境。")).toBeNull();
    expect(screen.queryByText("AI 能力中心")).toBeNull();
    expect(screen.queryByText("API Key ****1234")).toBeNull();
    expect(screen.queryByText(/secret-value/)).toBeNull();
    expect(screen.queryByRole("region", { name: "连接状态" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "设置分类" })).toBeNull();
    expect(screen.getByRole("button", { name: "打开Sino AI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开系统" })).toBeTruthy();
    for (const name of ["模型与 API", "模型能力", "模型路由策略", "执行器", "讨论配置", "运行环境"]) expect(screen.queryByRole("button", { name, exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "← 返回 Founder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "关闭设置" })).toBeNull();
    expect(document.querySelector(".sino-settings-tabs")).toBeNull();
  });

  it("uses the compact Settings label as a return-home action", async () => {
    const onHome = vi.fn();
    render(<ModelCenter onHome={onHome} />);
    expect(await screen.findByRole("button", { name: "← 返回首页" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "设置" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← 返回首页" }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("keeps the model page full width until a concrete model opens the Provider dialog", async () => {
    render(<ModelCenter />);
    const model = await screen.findByRole("button", { name: "DeepSeek Chat DeepSeek" });
    expect(screen.queryByRole("dialog", { name: "Provider 技术配置" })).toBeNull();
    expect(model.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(model);
    expect(await screen.findByRole("dialog", { name: "Provider 技术配置" })).toBeTruthy();
  });

  it("removes an unassigned model through the persisted Provider selection without opening its config", async () => {
    const provider = { ...deepseek, selected_models: ["deepseek-chat", "deepseek-reasoner"] };
    const updatedProvider = { ...provider, model: "deepseek-chat", selected_models: ["deepseek-chat"] };
    const updatedCenter = { ...center, providers: [updatedProvider], health_cost: [{ ...updatedProvider, usage: {} }] };
    getModelCenter.mockResolvedValueOnce({ ...center, providers: [provider], health_cost: [{ ...provider, usage: {} }] }).mockResolvedValue(updatedCenter);
    selectProviderModels.mockResolvedValue(updatedProvider);
    const { unmount } = render(<ModelCenter />);
    await screen.findByRole("button", { name: "DeepSeek Reasoner DeepSeek" });
    expect(screen.getAllByRole("button", { name: /^移除 / })).toHaveLength(2);
    expect(within(screen.getByRole("button", { name: "＋ 添加模型" })).queryByText("×")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "移除 DeepSeek Reasoner" }));
    expect(screen.queryByRole("dialog", { name: "Provider 技术配置" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "移除模型？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "移除", exact: true }));
    await waitFor(() => expect(selectProviderModels).toHaveBeenCalledWith("deepseek", ["deepseek-chat"]));
    await waitFor(() => expect(screen.queryByRole("button", { name: "DeepSeek Reasoner DeepSeek" })).toBeNull());
    expect(screen.getByLabelText("模型摘要", { exact: true }).textContent).toContain("1 个模型");
    unmount();
    render(<ModelCenter />);
    await screen.findByRole("button", { name: "DeepSeek Chat DeepSeek" });
    expect(screen.queryByRole("button", { name: "DeepSeek Reasoner DeepSeek" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek Chat DeepSeek" }));
    expect(screen.getByRole("checkbox", { name: /DeepSeek Reasoner/ }).checked).toBe(false);
  });

  it("blocks removal for Primary, Fallback, and discussion dependencies and opens Sino AI", async () => {
    const provider = { ...deepseek, selected_models: ["deepseek-chat", "deepseek-reasoner"] };
    const roles = capabilities.map((item) => item.role_key === "sino_conversation" ? { ...item, fallbacks: [{ provider_key: "deepseek", model: "deepseek-reasoner" }] } : item.role_key === "multi_model_discussion" ? { ...item, slots: [{ primary: { provider_key: "deepseek", model: "deepseek-chat" }, fallback: { provider_key: "deepseek", model: "deepseek-reasoner" } }] } : item);
    getModelCenter.mockResolvedValue({ ...center, providers: [provider], roles, health_cost: [{ ...provider, usage: {} }] });
    render(<ModelCenter />);
    await screen.findByRole("button", { name: "DeepSeek Reasoner DeepSeek" });
    fireEvent.click(screen.getByRole("button", { name: "移除 DeepSeek Chat" }));
    expect(screen.getByRole("dialog", { name: "模型正在使用" }).textContent).toContain("Sino 主对话");
    expect(screen.getByRole("dialog", { name: "模型正在使用" }).textContent).toContain("讨论模型 1");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "移除 DeepSeek Reasoner" }));
    const blocked = screen.getByRole("dialog", { name: "模型正在使用" });
    expect(blocked.textContent).toContain("Sino 主对话 Fallback");
    expect(blocked.textContent).toContain("讨论模型 1 Fallback");
    expect(within(blocked).queryByRole("button", { name: "移除", exact: true })).toBeNull();
    fireEvent.click(within(blocked).getByRole("button", { name: "前往 Sino AI" }));
    expect(screen.getByRole("dialog", { name: "Sino AI" })).toBeTruthy();
    expect(selectProviderModels).not.toHaveBeenCalled();
  });

  it("opens different Provider dialogs in sync with the selected model card", async () => {
    getModelCenter.mockResolvedValue({ ...center, providers: [deepseek, claude] });
    render(<SettingsHarness />);
    await screen.findByRole("heading", { name: "设置" });
    expect(screen.queryByRole("dialog", { name: "Provider 技术配置" })).toBeNull();
    const deepseekCard = screen.getByRole("button", { name: "DeepSeek Chat DeepSeek" });
    const claudeCard = screen.getByRole("button", { name: "Claude Sonnet 5 Claude" });
    fireEvent.click(deepseekCard);
    await waitFor(() => expect(deepseekCard.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByText("Provider 技术配置").closest(".sino-provider-config-modal").textContent).toContain("deepseek-chat");
    fireEvent.click(screen.getByRole("button", { name: "关闭 Provider 技术配置" }));
    fireEvent.click(claudeCard);
    await waitFor(() => expect(claudeCard.getAttribute("aria-pressed")).toBe("true"));
    expect(deepseekCard.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Provider 技术配置").closest(".sino-provider-config-modal").textContent).toContain("claude-sonnet-5");
  });

  it("separates model resources, Sino intelligence assignment, and system health", async () => {
    const { container } = render(<ModelCenter />);
    await screen.findByRole("heading", { name: "设置" });
    expect(screen.queryByRole("navigation", { name: "设置分类" })).toBeNull();
    expect(container.querySelector(".sino-settings-content")).toBeTruthy();
    expect(container.querySelector(".sino-settings-page--models")).toBeTruthy();
    expect(screen.getByLabelText("模型摘要").textContent).toContain("1 个模型 · 1 正常");
    expect(screen.getByRole("heading", { name: "模型" })).toBeTruthy();
    expect(screen.queryByText("模型资源池", { exact: true })).toBeNull();
    const modelGrid = screen.getByRole("list", { name: "已接入模型列表" });
    expect(modelGrid.querySelectorAll('button[aria-pressed]')).toHaveLength(1);
    expect(modelGrid.lastElementChild.textContent).toBe("＋ 添加模型");
    expect(screen.getByRole("button", { name: "＋ 添加模型" }).classList.contains("sino-add-model-card")).toBe(true);
    expect(screen.getByRole("button", { name: "DeepSeek Chat DeepSeek" }).textContent).toContain("Sino 主对话");
    expect(screen.getByRole("button", { name: "DeepSeek Chat DeepSeek" }).textContent).toContain("多模型讨论");
    const usage = screen.getByRole("region", { name: "用量与成本" });
    const modelList = screen.getByRole("list", { name: "已接入模型列表" });
    expect(modelList.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sinoEntry = screen.getByRole("button", { name: "打开Sino AI" });
    const systemEntry = screen.getByRole("button", { name: "打开系统" });
    expect(within(sinoEntry).queryByText("Sino AI", { exact: true })).toBeNull();
    expect(within(systemEntry).queryByText("系统", { exact: true })).toBeNull();
    expect(sinoEntry.textContent).toContain("模型职责分配、Primary / Fallback 与多模型讨论");
    expect(systemEntry.textContent).toContain("Executor、Runtime 与 System Health");
    expect(modelGrid.compareDocumentPosition(sinoEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sinoEntry.compareDocumentPosition(systemEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(systemEntry.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("region", { name: "模型分配" })).toBeNull();
    fireEvent.click(sinoEntry);
    const sinoDialog = screen.getByRole("dialog", { name: "Sino AI" });
    const sinoHeader = within(sinoDialog).getByRole("heading", { name: "Sino AI" }).closest("header");
    expect(within(sinoHeader).getByText("模型职责分配、Fallback 与多模型讨论，Primary 失败时有限切换至 Fallback。")).toBeTruthy();
    expect(within(sinoDialog).queryByText("Primary 失败时有限切换至 Fallback", { exact: true })).toBeNull();
    expect(screen.getByRole("region", { name: "模型分配" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "已接入模型列表" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "用量与成本" })).toBeTruthy();
    expect(screen.queryByText("自动多轮")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭Sino AI" }));
    fireEvent.click(systemEntry);
    expect(screen.getByRole("dialog", { name: "系统" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "执行器" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "运行环境" })).toBeTruthy();
  });

  it("constrains Vision assignments to verified models and persists its chain", async () => {
    getModelCenter.mockResolvedValue({ ...center, model_capability_registry: capabilityRegistry });
    const correctedRegistry = { ...capabilityRegistry, routing_policies: capabilityRegistry.routing_policies.map((item) => item.capability === "VISION_UNDERSTANDING" ? { ...item, preferred_primary: { provider_id: "ofox", model_id: "gemini-3.6-flash" }, preferred_fallback: null } : item) };
    saveModelRoutingPreferred.mockResolvedValue(correctedRegistry);
    render(<ModelCenter />);
    await screen.findByRole("heading", { name: "设置" });
    expect(screen.getByRole("list", { name: "已接入模型列表" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "打开Sino AI" }));
    const vision = screen.getByRole("combobox", { name: "Vision Primary" });
    expect(within(vision).getByRole("option", { name: /GPT 5 Pro.*能力不匹配/ }).disabled).toBe(true);
    expect(within(vision).queryByRole("option", { name: /DeepSeek Chat/ })).toBeNull();
    expect(within(vision).getByRole("option", { name: "Gemini 3.6 Flash" })).toBeTruthy();
    const visionFallback = screen.getByRole("combobox", { name: "Vision Fallback" });
    expect(within(visionFallback).getByRole("option", { name: /GPT 5 Pro.*能力不匹配/ }).disabled).toBe(true);
    expect(within(visionFallback).queryByRole("option", { name: /DeepSeek Chat/ })).toBeNull();
    expect(screen.getByLabelText("Vision Primary 状态").textContent).toBe("● 配置错误");
    expect(screen.getByLabelText("Vision Fallback 状态").textContent).toBe("● 未配置");
    expect(screen.getByLabelText("Vision Assignment 状态").textContent).toBe("● 配置错误");
    fireEvent.change(vision, { target: { value: "ofox::gemini-3.6-flash" } });
    await waitFor(() => expect(saveModelRoutingPreferred).toHaveBeenCalledWith("VISION_UNDERSTANDING", { provider_id: "ofox", model_id: "gemini-3.6-flash" }, null));
    await waitFor(() => expect(screen.getByLabelText("Vision Primary 状态").textContent).toBe("● 正常"));
  });

  it("keeps a legacy mismatched Vision Fallback visible but invalid and disabled", async () => {
    const registry = { ...capabilityRegistry, routing_policies: capabilityRegistry.routing_policies.map((item) => item.capability === "VISION_UNDERSTANDING" ? { ...item, preferred_primary: { provider_id: "ofox", model_id: "gemini-3.6-flash" }, preferred_fallback: { provider_id: "gpt", model_id: "gpt-5-pro" } } : item) };
    getModelCenter.mockResolvedValue({ ...center, model_capability_registry: registry });
    render(<ModelCenter />);
    await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开Sino AI" }));
    const fallback = screen.getByRole("combobox", { name: "Vision Fallback" });
    expect(within(fallback).getByRole("option", { name: /GPT 5 Pro.*能力不匹配/ }).disabled).toBe(true);
    expect(screen.getByLabelText("Vision Primary 状态").textContent).toBe("● 正常");
    expect(screen.getByLabelText("Vision Fallback 状态").textContent).toBe("● 配置错误");
    expect(screen.getByLabelText("Vision Assignment 状态").textContent).toBe("● 正常");
  });

  it("shows selected Provider details and omits an empty Provider modal", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<ProviderConfigModal onClose={onClose} />);
    expect(screen.queryByRole("dialog", { name: "Provider 技术配置" })).toBeNull();
    rerender(<ProviderConfigModal provider={deepseek} model={deepseek.available_models[0]} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Provider 技术配置" }).getAttribute("aria-modal")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "关闭 Provider 技术配置" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Provider 技术配置").closest("header")).toBeTruthy();
    expect(screen.getByText(/DeepSeek \/ deepseek/)).toBeTruthy();
    expect(screen.getByText("****1234")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "概览与连接控制" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "模型管理" })).toBeTruthy();
    expect(screen.queryByText("Provider 概览与连接控制", { exact: true })).toBeNull();
    expect(screen.queryByText("Provider 模型管理", { exact: true })).toBeNull();
    expect(screen.queryByText("Provider 端点")).toBeNull();
    expect(screen.queryByText("连接测试", { exact: true })).toBeNull();
    expect(screen.queryByText("当前启用模型")).toBeNull();
    rerender(<ProviderConfigModal />);
    expect(screen.queryByText("Sino Founder AI 系统配置")).toBeNull();
    expect(screen.queryByText("设置上下文")).toBeNull();
    expect(screen.queryByText("设置详情")).toBeNull();
  });

  it("uses two dense Provider sections and progressively reveals available models", () => {
    const models = Array.from({ length: 5 }, (_, index) => ({ model_id: `model-${index + 1}`, display_name: `Model ${index + 1}`, recommendation_score: index === 0 ? 90 : 50 }));
    const provider = { ...deepseek, base_url: "https://api.deepseek.com/v1", available_models: models, selected_models: ["model-1"] };
    const onRefresh = vi.fn();
    const onHealth = vi.fn();
    const { container } = render(<ProviderConfigModal provider={provider} model={models[0]} onRefresh={onRefresh} onHealth={onHealth} onChoose={vi.fn()} />);
    expect(container.querySelectorAll(".sino-settings-inspector-card")).toHaveLength(0);
    expect(container.querySelectorAll(".sino-settings-provider-inspector > section")).toHaveLength(2);
    expect(container.querySelectorAll(".sino-provider-connection-control .sino-provider-summary-row")).toHaveLength(2);
    const currentModelRow = container.querySelector(".sino-provider-summary-row--identity");
    expect(within(currentModelRow).getByText("Model 1")).toBeTruthy();
    expect(within(currentModelRow).getByText("Provider")).toBeTruthy();
    expect(within(currentModelRow).getByText("DeepSeek / deepseek")).toBeTruthy();
    expect(within(currentModelRow).getByText("Base URL")).toBeTruthy();
    expect(within(currentModelRow).getByText("https://api.deepseek.com/v1")).toBeTruthy();
    expect(within(currentModelRow).queryByText("model-1")).toBeNull();
    expect(screen.getByText("model-1")).toBeTruthy();
    const apiKeyRow = container.querySelector(".sino-provider-summary-row--actions");
    expect(within(apiKeyRow).getByText("****1234")).toBeTruthy();
    expect(within(apiKeyRow).getByRole("button", { name: "更新 API Key" })).toBeTruthy();
    expect(within(apiKeyRow).getByRole("button", { name: "测试连接" })).toBeTruthy();
    expect(within(screen.getByRole("dialog", { name: "Provider 技术配置" })).queryByText("状态", { exact: true })).toBeNull();
    expect(screen.getByText("Model 3")).toBeTruthy();
    expect(screen.queryByText("Model 4")).toBeNull();
    const toggle = screen.getByRole("button", { name: /查看全部 5 个模型/ });
    fireEvent.click(toggle);
    expect(screen.getByText("Model 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "收起" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByText("Model 4")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onHealth).toHaveBeenCalledTimes(1);
  });

  it("omits absent optional fields and has no persistent Provider status", () => {
    const provider = { ...claude, base_url: "" };
    const { container } = render(<ProviderConfigModal provider={provider} model={provider.available_models[0]} action={{}} />);
    expect(within(container.querySelector(".sino-provider-summary-row--identity")).queryByText("Base URL")).toBeNull();
    expect(screen.queryByText("状态", { exact: true })).toBeNull();
    expect(screen.queryByText("账户额度不足")).toBeNull();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeTruthy();
  });

  it("omits the API Key row when a Provider explicitly does not require credentials", () => {
    const provider = { ...deepseek, requires_api_key: false };
    const { container } = render(<ProviderConfigModal provider={provider} model={provider.available_models[0]} action={{}} />);
    expect(container.querySelectorAll(".sino-provider-summary-row")).toHaveLength(2);
    expect(screen.queryByText("API Key", { exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "测试连接" })).toBeTruthy();
  });

  it("shows Provider success feedback transiently without a persistent card", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<ProviderConfigModal provider={deepseek} model={deepseek.available_models[0]} action={{}} />);
    rerender(<ProviderConfigModal provider={deepseek} model={deepseek.available_models[0]} action={{ successMessage: "模型选择已保存" }} />);
    expect(screen.getByRole("status").textContent).toBe("模型选择已保存");
    expect(container.querySelector(".sino-settings-inspector-card")).toBeNull();
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("keeps Runtime details collapsed until explicitly requested", async () => {
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开系统" }));
    expect(screen.getByText("5/5 services healthy")).toBeTruthy();
    expect(screen.queryByText("http://127.0.0.1:5173")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    expect(await screen.findByText("http://127.0.0.1:5173")).toBeTruthy();
    expect(screen.getByText("http://127.0.0.1:8000")).toBeTruthy();
    expect(screen.getByText("PostgreSQL / LOCAL")).toBeTruthy();
    expect(screen.getByText("application-level HTTP Bearer RBAC")).toBeTruthy();
    expect(screen.getByText("loopback")).toBeTruthy();
    expect(screen.queryByText(/PLANNED/)).toBeNull();
    expect(screen.queryByText(/NOT_CONFIGURED/)).toBeNull();
    expect(screen.queryByText("NAS")).toBeNull();
    expect(screen.queryByText("商业云")).toBeNull();
    expect(document.body.textContent).not.toContain("credential-reference://");
  });

  it("uses the Settings panel as the sole scroll container and keeps the last runtime card reachable", async () => {
    render(<main className="sino-founder-main sino-founder-main--fixed-workspace"><ModelCenter /></main>);
    await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开系统" }));
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    const settings = screen.getByRole("region", { name: "设置" });
    expect(settings.matches(".sino-founder-main--fixed-workspace > .sino-settings")).toBe(true);
    expect(settings.contains(screen.getByText("网络"))).toBe(true);
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("main").classList.contains("sino-founder-main--fixed-workspace")).toBe(true);
  });

  it("shows the single real executor without a meaningless selector", async () => {
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开系统" }));
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "执行引擎" })).toBeNull();
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
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek Chat DeepSeek" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新模型" }));
    await waitFor(() => expect(discoverProviderModels).toHaveBeenCalledWith("deepseek"));
    fireEvent.click(screen.getAllByRole("checkbox", { name: /deepseek-reasoner/ })[0]);
    await waitFor(() => expect(selectProviderModels).toHaveBeenCalledWith("deepseek", ["deepseek-chat", "deepseek-reasoner"]));
    expect(screen.queryByPlaceholderText("Model")).toBeNull();
  });

  it("persists Primary/Fallback and multi-model assignments from model control", async () => {
    saveCapabilityAssignment.mockResolvedValue(center);
    saveMultiModelAssignment.mockImplementation(async (slots) => ({ ...center, roles: capabilities.map((item) => item.role_key === "multi_model_discussion" ? { ...item, slots, models: slots.flatMap((slot) => slot.primary ? [slot.primary] : []) } : item) }));
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开Sino AI" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sino 主对话 Primary" }), { target: { value: "deepseek::deepseek-chat" } });
    await waitFor(() => expect(saveCapabilityAssignment).toHaveBeenCalledWith("sino_conversation", "deepseek", "deepseek-chat", []));
    for (let index = 1; index <= 5; index += 1) expect(screen.getByRole("combobox", { name: `讨论模型 ${index} Primary` })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "讨论模型 1 Primary" }).value).toBe("deepseek::deepseek-chat");
    expect(screen.getByRole("combobox", { name: "讨论模型 5 Primary" }).closest(".sino-model-assignment-row").textContent).toContain("未配置");
    fireEvent.change(screen.getByRole("combobox", { name: "讨论模型 1 Primary" }), { target: { value: "" } });
    await waitFor(() => expect(saveMultiModelAssignment).toHaveBeenLastCalledWith(expect.arrayContaining([{ primary: null, fallback: null }])));
    fireEvent.change(screen.getByRole("combobox", { name: "讨论模型 1 Primary" }), { target: { value: "deepseek::deepseek-chat" } });
    await waitFor(() => expect(saveMultiModelAssignment).toHaveBeenLastCalledWith(expect.arrayContaining([{ primary: { provider_key: "deepseek", model: "deepseek-chat" }, fallback: null }])));
  });

  it("uses operational assignment status and keeps Coding intelligence separate from Codex", async () => {
    const roles = [...capabilities, { role_key: "deep_thinking", label: "深度思考", provider_key: "claude", model: "claude-sonnet-5", fallbacks: [{ provider_key: "deepseek", model: "deepseek-chat" }] }].map((item) => item.role_key === "code_execution" ? { ...item, provider_key: "claude", model: "claude-sonnet-5", fallbacks: [] } : item);
    getModelCenter.mockResolvedValue({ ...center, providers: [deepseek, claude], roles });
    saveCapabilityAssignment.mockResolvedValue({ ...center, providers: [deepseek, claude], roles });
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开Sino AI" }));
    expect(screen.getByLabelText("Sino 主对话 Primary 状态").textContent).toBe("● 正常");
    expect(screen.getByLabelText("Sino 主对话 Primary 状态").getAttribute("data-status")).toBe("normal");
    expect(screen.getByLabelText("Sino 主对话 Fallback 状态").textContent).toBe("● 未配置");
    expect(screen.getByLabelText("Sino 主对话 Assignment 状态").textContent).toBe("● 正常");
    expect(screen.getByLabelText("深度推理 Primary 状态").textContent).toBe("● 异常");
    expect(screen.getByLabelText("深度推理 Fallback 状态").textContent).toBe("● 正常");
    expect(screen.getByLabelText("深度推理 Assignment 状态").textContent).toBe("● 正常");
    expect(screen.getByRole("combobox", { name: "Sino 主对话 Primary" }).closest(".sino-model-assignment-row").textContent).toContain("正常");
    expect(screen.getByRole("combobox", { name: "深度推理 Primary" }).closest(".sino-model-assignment-row").textContent).not.toContain("Fallback 可用");
    expect(screen.getByRole("combobox", { name: "Vision Primary" }).closest(".sino-model-assignment-row").textContent).toContain("未配置");
    const coding = screen.getByRole("combobox", { name: "Coding Primary" });
    expect(screen.getByLabelText("Coding Fallback 状态").textContent).toBe("● 未配置");
    expect(screen.getByLabelText("Coding Assignment 状态").textContent).toBe("● 异常");
    expect(coding.closest(".sino-model-assignment-row").textContent).toContain("异常");
    expect(within(coding).getByRole("option", { name: /DeepSeek Chat/ })).toBeTruthy();
    expect(coding.closest(".sino-model-assignment-row").textContent).not.toContain("Codex");
    fireEvent.change(coding, { target: { value: "deepseek::deepseek-chat" } });
    await waitFor(() => expect(saveCapabilityAssignment).toHaveBeenCalledWith("code_execution", "deepseek", "deepseek-chat", []));
    const fallback = screen.getByRole("combobox", { name: "Sino 主对话 Fallback" });
    expect(within(fallback).getByRole("option", { name: /DeepSeek Chat/ }).disabled).toBe(true);
  });

  it("applies assignment status and duplicate-primary constraints to each discussion slot", async () => {
    const slots = [
      { primary: { provider_key: "deepseek", model: "deepseek-chat" }, fallback: null },
      { primary: { provider_key: "deepseek", model: "deepseek-chat" }, fallback: null },
      { primary: { provider_key: "claude", model: "claude-sonnet-5" }, fallback: { provider_key: "deepseek", model: "deepseek-chat" } },
      { primary: null, fallback: null },
      { primary: null, fallback: null },
    ];
    const roles = capabilities.map((item) => item.role_key === "multi_model_discussion" ? { ...item, slots, models: slots.flatMap((slot) => slot.primary ? [slot.primary] : []) } : item);
    getModelCenter.mockResolvedValue({ ...center, providers: [deepseek, claude], roles });
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "打开Sino AI" }));
    for (let index = 1; index <= 5; index += 1) expect(screen.getByLabelText(`讨论模型 ${index} Primary 状态`)).toBeTruthy();
    expect(screen.getByLabelText("讨论模型 1 Primary 状态").textContent).toBe("● 配置错误");
    expect(screen.getByLabelText("讨论模型 1 Fallback 状态").textContent).toBe("● 未配置");
    expect(screen.getByLabelText("讨论模型 1 Assignment 状态").textContent).toBe("● 配置错误");
    expect(screen.getByLabelText("讨论模型 3 Primary 状态").textContent).toBe("● 异常");
    expect(screen.getByLabelText("讨论模型 3 Fallback 状态").textContent).toBe("● 正常");
    expect(screen.getByLabelText("讨论模型 3 Assignment 状态").textContent).toBe("● 正常");
    expect(screen.getByLabelText("讨论模型 4 Primary 状态").textContent).toBe("● 未配置");
    expect(screen.getByLabelText("讨论模型 4 Fallback 状态").textContent).toBe("● 未配置");
    expect(screen.getByLabelText("讨论模型 4 Assignment 状态").textContent).toBe("● 未配置");
    expect(screen.getByRole("combobox", { name: "讨论模型 1 Primary" }).closest(".sino-model-assignment-row").textContent).toContain("配置错误");
    expect(screen.getByRole("combobox", { name: "讨论模型 3 Primary" }).closest(".sino-model-assignment-row").textContent).not.toContain("Fallback 可用");
    expect(screen.getByRole("combobox", { name: "讨论模型 4 Primary" }).closest(".sino-model-assignment-row").textContent).toContain("未配置");
    expect(within(screen.getByRole("combobox", { name: "讨论模型 4 Primary" })).getByRole("option", { name: /DeepSeek Chat.*已用于其他讨论模型/ }).disabled).toBe(true);
  });

  it("shows assigned-model economics without reusing incomplete Provider-level metrics", async () => {
    checkModelProvider.mockResolvedValue({ status: "healthy", configuration: deepseek });
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    expect(screen.getByRole("list", { name: "已接入模型列表" })).toBeTruthy();
    expect(screen.getByText("调用次数", { exact: true })).toBeTruthy();
    expect(screen.getByRole("table", { name: "已分配模型经济账" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "已分配模型", exact: true })).toBeNull();
    expect(screen.queryByText("额度", { exact: true })).toBeNull();
    expect(screen.queryByText("120.5 ms")).toBeNull();
  });

  it("hides unconfigured GPT from My Models and relocates reconnect to Add Model", async () => {
    const multi = { ...center, providers: [deepseek, claude, gpt], health_cost: center.health_cost };
    getModelCenter.mockResolvedValue(multi);
    render(<ModelCenter />); await screen.findByRole("heading", { name: "设置" });
    expect(screen.queryByText("GPT")).toBeNull();
    expect(screen.queryByRole("button", { name: "管理" })).toBeNull();
    expect(screen.getByRole("list", { name: "已接入模型列表" }).querySelectorAll("button[aria-pressed]")).toHaveLength(2);
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
    fireEvent.click(screen.getByRole("button", { name: "Claude Sonnet 5 Claude" }));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("账户额度不足"));
    expect(within(screen.getByRole("dialog", { name: "Provider 技术配置" })).queryByText("状态", { exact: true })).toBeNull();
    expect(screen.queryByText("认证失败")).toBeNull();
    expect(screen.getAllByText("DeepSeek Chat").length).toBeGreaterThanOrEqual(1);
  });

  it("updates Provider credentials only from the right Context and never reveals the existing key", async () => {
    updateModelProviderCredentials.mockResolvedValue(deepseek);
    render(<SettingsHarness />); await screen.findByRole("heading", { name: "设置" });
    fireEvent.click(screen.getByRole("button", { name: "DeepSeek Chat DeepSeek" }));
    expect(screen.getByText("****1234")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "更新 API Key" }));
    const input = await screen.findByLabelText("新的 API Key");
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "replacement-key" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(updateModelProviderCredentials).toHaveBeenCalledWith("deepseek", { api_key: "replacement-key", base_url: null, display_name: null }));
    expect(screen.queryByDisplayValue("replacement-key")).toBeNull();
  });
});
