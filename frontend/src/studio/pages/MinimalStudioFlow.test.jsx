// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MinimalStudioFlow } from "./MinimalStudioFlow.jsx";
import * as api from "../studioAiApi.js";

vi.mock("../studioAiApi.js", () => ({
  createStudioConversation: vi.fn(),
  getStudioConversation: vi.fn(),
  listStudioConversations: vi.fn(),
  submitStudioTask: vi.fn(),
}));

const conversation = { conversation_id: "studio-conversation-1", system_id: "studio_ai", title: "生成一张商品主图" };
const snapshot = {
  conversation,
  messages: [
    { message_id: "message-1", role: "founder", content: "生成一张商品主图" },
    { message_id: "message-2", role: "assistant", content: "当前缺少已批准的图片生成 Capability。" },
  ],
  task: {
    task_id: "studio-task-1",
    task_type: "image_generation",
    status: "capability_missing",
    execution_status: "not_started",
    capability_lookup: { status: "capability_missing", capability: null },
    model_lookup: { status: "model_missing", model: null },
    asset: null,
    next_action: "Develop and approve an image-generation Capability in Founder AI.",
  },
};

describe("MinimalStudioFlow", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    api.listStudioConversations.mockResolvedValue({ conversations: [] });
    api.createStudioConversation.mockResolvedValue(conversation);
    api.submitStudioTask.mockResolvedValue(snapshot);
  });

  it("renders the bounded three-area Studio workspace", async () => {
    render(<MinimalStudioFlow />);
    expect(screen.getByText("Studio Local Project")).toBeTruthy();
    expect(screen.getByLabelText("Studio Input")).toBeTruthy();
    expect(screen.getByText("Next State")).toBeTruthy();
    await waitFor(() => expect(api.listStudioConversations).toHaveBeenCalledTimes(1));
  });

  it("creates an isolated Studio conversation and reports honest missing dependencies", async () => {
    api.listStudioConversations
      .mockResolvedValueOnce({ conversations: [] })
      .mockResolvedValueOnce({ conversations: [conversation] });
    render(<MinimalStudioFlow />);
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    await waitFor(() => expect(api.createStudioConversation).toHaveBeenCalledWith("生成一张商品主图"));
    expect(api.submitStudioTask).toHaveBeenCalledWith("studio-conversation-1", "生成一张商品主图");
    expect(await screen.findByText("Capability Missing")).toBeTruthy();
    expect(screen.getByText("Missing / Unverified")).toBeTruthy();
    expect(screen.getByText("not_started")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
  });
});
