// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SinoModelSelector, configuredConversationModels } from "./SinoModelSelector.jsx";
import { getModelCenter, getSinoAssignedModels, setFounderConversationModel } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getModelCenter: vi.fn(), getSinoAssignedModels: vi.fn(), setFounderConversationModel: vi.fn() }));

const center = {
  roles: [{ role_key: "sino_conversation", provider_key: "gpt", model: "gpt-5-pro" }],
  providers: [
    { provider_key: "deepseek", display_name: "DeepSeek", configured: true, enabled: true, health_status: "healthy", selected_models: ["deepseek-chat"], available_models: [{ model_id: "deepseek-chat", display_name: "DeepSeek Chat", capability_tags: ["对话"] }] },
    { provider_key: "gpt", display_name: "GPT", configured: true, enabled: true, health_status: "healthy", selected_models: ["gpt-5-pro"], available_models: [{ model_id: "gpt-5-pro", display_name: "GPT 5 Pro", recommended_for: ["Sino 对话"] }] },
    { provider_key: "claude", display_name: "Claude", configured: true, enabled: true, health_status: "unhealthy", selected_models: ["claude-sonnet"], available_models: [{ model_id: "claude-sonnet", display_name: "Claude Sonnet", capability_tags: ["对话"] }] },
  ],
};
const assigned = { models: [
  { identity: "gpt::gpt-5-pro", provider_id: "gpt", provider_name: "GPT", model_id: "gpt-5-pro", display_name: "GPT 5 Pro", health_status: "healthy", availability: "available", roles: ["Sino 主对话"] },
  { identity: "deepseek::deepseek-chat", provider_id: "deepseek", provider_name: "DeepSeek", model_id: "deepseek-chat", display_name: "DeepSeek Chat", health_status: "healthy", availability: "available", roles: ["讨论模型 1"] },
] };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Sino AI Conversation Model selector", () => {
  it("reads configured conversation models without exposing credentials", () => {
    const models = configuredConversationModels({ models: [...assigned.models, assigned.models[0]] });
    expect(models.map((item) => item.model)).toEqual(["gpt-5-pro", "deepseek-chat"]);
    expect(JSON.stringify(models)).not.toContain("secret");
    expect(models.every((item) => item.available)).toBe(true);
  });

  it("loads only the backend-authorized Conversation pool without Coding role leakage", async () => {
    getModelCenter.mockResolvedValue(center);
    getSinoAssignedModels.mockResolvedValue(assigned);
    render(<SinoModelSelector conversation={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Sino AI/ }));
    await screen.findByRole("menuitemradio", { name: /GPT 5 Pro/ });
    expect(getSinoAssignedModels).toHaveBeenCalledTimes(1);
    expect(screen.getByText("DeepSeek Chat")).toBeTruthy();
    expect(screen.queryByText("Claude Sonnet")).toBeNull();
  });

  it("projects model transport failure as LOAD_FAILED instead of an empty model catalog", async () => {
    getModelCenter.mockRejectedValue(new TypeError("Failed to fetch"));
    getSinoAssignedModels.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SinoModelSelector conversation={{ id: "conv-1", title: "持久讨论" }} />);
    fireEvent.click(screen.getByRole("button", { name: /持久讨论/ }));
    expect(await screen.findByText("模型状态暂时无法加载，已保留当前模型。")).toBeTruthy();
    expect(screen.queryByText("暂无可用 Conversation Model")).toBeNull();
  });

  it("shows Sino identity, opens the menu, marks the configured default, and preselects before creation", async () => {
    getModelCenter.mockResolvedValue(center);
    getSinoAssignedModels.mockResolvedValue(assigned);
    const onPreselect = vi.fn();
    render(<SinoModelSelector conversation={null} onPreselect={onPreselect} />);
    const trigger = screen.getByRole("button", { name: /Sino AI/ });
    expect(trigger.classList.contains("sino-model-selector__trigger--pill")).toBe(true);
    expect(trigger.querySelector(".sino-model-selector__chevron-right")).toBeTruthy();
    expect(trigger.querySelector("i")).toBeNull();
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu", { name: "Conversation Models" });
    expect(menu.classList.contains("sino-model-selector__menu--floating")).toBe(true);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.querySelector("[data-popover-arrow]")).toBeTruthy();
    expect(menu.querySelector("header")).toBeNull();
    expect(screen.queryByText("Conversation Model", { exact: true })).toBeNull();
    expect(screen.queryByText("只影响后续对话", { exact: true })).toBeNull();
    expect(screen.getByRole("menuitemradio", { name: /GPT 5 Pro/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: /DeepSeek Chat/ })).toBeTruthy();
    expect(screen.getByText(/Provider：GPT/)).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitemradio", { name: /DeepSeek Chat/ }));
    expect(onPreselect).toHaveBeenCalledWith(expect.objectContaining({ providerKey: "deepseek", model: "deepseek-chat" }));
  });

  it("closes the floating popover on outside click and Escape", async () => {
    getModelCenter.mockResolvedValue(center);
    getSinoAssignedModels.mockResolvedValue(assigned);
    render(<div><SinoModelSelector conversation={null} /><button type="button">Outside</button></div>);
    const trigger = screen.getByRole("button", { name: /Sino AI/ });
    fireEvent.click(trigger);
    await screen.findByRole("menu", { name: "Conversation Models" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu", { name: "Conversation Models" })).toBeNull();
    fireEvent.click(trigger);
    await screen.findByRole("menu", { name: "Conversation Models" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Conversation Models" })).toBeNull();
  });

  it("projects the current Conversation title into the same ellipsized model trigger", async () => {
    getModelCenter.mockResolvedValue(center);
    getSinoAssignedModels.mockResolvedValue(assigned);
    const title = "供应链金融模式分析与跨区域长期运营策略讨论";
    render(<SinoModelSelector conversation={{ id: "conv-project", title }} />);
    const trigger = screen.getByRole("button", { name: `${title} · 选择模型` });
    expect(trigger.title).toBe(title);
    expect(trigger.querySelector("span").textContent).toBe(title);
    fireEvent.click(trigger);
    expect(await screen.findByRole("menu", { name: "Conversation Models" })).toBeTruthy();
  });

  it("persists an existing conversation override and safely retains the previous model on failure", async () => {
    getModelCenter.mockResolvedValue(center);
    getSinoAssignedModels.mockResolvedValue(assigned);
    setFounderConversationModel.mockResolvedValue({ id: "conv-1", conversation_model_provider: "deepseek", conversation_model: "deepseek-chat" });
    const changed = vi.fn();
    const { rerender } = render(<SinoModelSelector conversation={{ id: "conv-1" }} onConversationChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: /Sino AI/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /DeepSeek Chat/ }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ conversation_model: "deepseek-chat" })));

    setFounderConversationModel.mockRejectedValue(new Error("raw secret exception"));
    rerender(<SinoModelSelector conversation={{ id: "conv-1", conversation_model_provider: "deepseek", conversation_model: "deepseek-chat" }} onConversationChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: /Sino AI/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /GPT 5 Pro/ }));
    await screen.findByText("模型切换失败，已保持原模型。");
    expect(screen.queryByText(/raw secret/)).toBeNull();
  });
});
