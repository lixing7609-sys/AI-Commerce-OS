// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SinoModelSelector, configuredConversationModels } from "./SinoModelSelector.jsx";
import { getModelCenter, setFounderConversationModel } from "../services/founderAiApi.js";

vi.mock("../services/founderAiApi.js", () => ({ getModelCenter: vi.fn(), setFounderConversationModel: vi.fn() }));

const center = {
  roles: [{ role_key: "sino_conversation", provider_key: "deepseek", model: "deepseek-chat" }],
  providers: [
    { provider_key: "deepseek", display_name: "DeepSeek", configured: true, enabled: true, health_status: "healthy", selected_models: ["deepseek-chat"], available_models: [{ model_id: "deepseek-chat", display_name: "DeepSeek Chat", capability_tags: ["对话"] }] },
    { provider_key: "gpt", display_name: "GPT", configured: true, enabled: true, health_status: "healthy", selected_models: ["gpt-5-pro"], available_models: [{ model_id: "gpt-5-pro", display_name: "GPT 5 Pro", recommended_for: ["Sino 对话"] }] },
    { provider_key: "claude", display_name: "Claude", configured: true, enabled: true, health_status: "unhealthy", selected_models: ["claude-sonnet"], available_models: [{ model_id: "claude-sonnet", display_name: "Claude Sonnet", capability_tags: ["对话"] }] },
  ],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Sino AI Conversation Model selector", () => {
  it("reads configured conversation models without exposing credentials", () => {
    const models = configuredConversationModels({ ...center, providers: center.providers.map((item) => ({ ...item, api_key_mask: "****secret" })) });
    expect(models.map((item) => item.model)).toEqual(["deepseek-chat", "gpt-5-pro", "claude-sonnet"]);
    expect(JSON.stringify(models)).not.toContain("secret");
    expect(models.at(-1).available).toBe(false);
  });

  it("shows Sino identity, opens the menu, marks the configured default, and preselects before creation", async () => {
    getModelCenter.mockResolvedValue(center);
    const onPreselect = vi.fn();
    render(<SinoModelSelector conversation={null} onPreselect={onPreselect} />);
    fireEvent.click(screen.getByRole("button", { name: /Sino AI/ }));
    await screen.findByRole("menu", { name: "Conversation Models" });
    expect(screen.getByRole("menuitemradio", { name: /DeepSeek Chat/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemradio", { name: /Claude Sonnet/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("menuitemradio", { name: /GPT 5 Pro/ }));
    expect(onPreselect).toHaveBeenCalledWith(expect.objectContaining({ providerKey: "gpt", model: "gpt-5-pro" }));
  });

  it("persists an existing conversation override and safely retains the previous model on failure", async () => {
    getModelCenter.mockResolvedValue(center);
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
