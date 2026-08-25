// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SinoModelSelector, configuredConversationModels } from "./SinoModelSelector.jsx";
import { getEligibleModels, getModelCenter, setFounderConversationModel } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getEligibleModels: vi.fn(), getModelCenter: vi.fn(), setFounderConversationModel: vi.fn() }));

const center = {
  roles: [{ role_key: "sino_conversation", provider_key: "deepseek", model: "deepseek-chat" }],
  providers: [
    { provider_key: "deepseek", display_name: "DeepSeek", configured: true, enabled: true, health_status: "healthy", selected_models: ["deepseek-chat"], available_models: [{ model_id: "deepseek-chat", display_name: "DeepSeek Chat", capability_tags: ["对话"] }] },
    { provider_key: "gpt", display_name: "GPT", configured: true, enabled: true, health_status: "healthy", selected_models: ["gpt-5-pro"], available_models: [{ model_id: "gpt-5-pro", display_name: "GPT 5 Pro", recommended_for: ["Sino 对话"] }] },
    { provider_key: "claude", display_name: "Claude", configured: true, enabled: true, health_status: "unhealthy", selected_models: ["claude-sonnet"], available_models: [{ model_id: "claude-sonnet", display_name: "Claude Sonnet", capability_tags: ["对话"] }] },
  ],
};
const eligible = { models: [
  { identity: "deepseek::deepseek-chat", provider_id: "deepseek", provider_name: "DeepSeek", model_id: "deepseek-chat", display_name: "DeepSeek Chat", health_status: "healthy", availability: "available" },
  { identity: "gpt::gpt-5-pro", provider_id: "gpt", provider_name: "GPT", model_id: "gpt-5-pro", display_name: "GPT 5 Pro", health_status: "healthy", availability: "available" },
  { identity: "claude::claude-sonnet", provider_id: "claude", provider_name: "Claude", model_id: "claude-sonnet", display_name: "Claude Sonnet", health_status: "unhealthy", availability: "unavailable" },
] };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Sino AI Conversation Model selector", () => {
  it("reads configured conversation models without exposing credentials", () => {
    const models = configuredConversationModels(eligible);
    expect(models.map((item) => item.model)).toEqual(["deepseek-chat", "gpt-5-pro", "claude-sonnet"]);
    expect(JSON.stringify(models)).not.toContain("secret");
    expect(models.at(-1).available).toBe(false);
  });

  it("shows Sino identity, opens the menu, marks the configured default, and preselects before creation", async () => {
    getModelCenter.mockResolvedValue(center);
    getEligibleModels.mockResolvedValue(eligible);
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
    expect(screen.getByRole("menuitemradio", { name: /DeepSeek Chat/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: /Claude Sonnet/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT 5 Pro/ }));
    expect(onPreselect).toHaveBeenCalledWith(expect.objectContaining({ providerKey: "gpt", model: "gpt-5-pro" }));
  });

  it("closes the floating popover on outside click and Escape", async () => {
    getModelCenter.mockResolvedValue(center);
    getEligibleModels.mockResolvedValue(eligible);
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
    getEligibleModels.mockResolvedValue(eligible);
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
    getEligibleModels.mockResolvedValue(eligible);
    setFounderConversationModel.mockResolvedValue({ id: "conv-1", conversation_model_provider: "gpt", conversation_model: "gpt-5-pro" });
    const changed = vi.fn();
    const { rerender } = render(<SinoModelSelector conversation={{ id: "conv-1" }} onConversationChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: /Sino AI/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /GPT 5 Pro/ }));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ conversation_model: "gpt-5-pro" })));

    setFounderConversationModel.mockRejectedValue(new Error("raw secret exception"));
    rerender(<SinoModelSelector conversation={{ id: "conv-1", conversation_model_provider: "gpt", conversation_model: "gpt-5-pro" }} onConversationChanged={changed} />);
    fireEvent.click(screen.getByRole("button", { name: /Sino AI/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /DeepSeek Chat/ }));
    await screen.findByText("模型切换失败，已保持原模型。");
    expect(screen.queryByText(/raw secret/)).toBeNull();
  });
});
