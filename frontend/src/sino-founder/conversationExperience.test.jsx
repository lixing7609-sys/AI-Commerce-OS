// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationThread } from "./ConversationThread.jsx";
import { hasConversationReply, mergeConversationSnapshot } from "./ConversationWorkspace.jsx";

const snapshot = (messages) => ({ conversation: { id: "conv-experience", title: "自然讨论" }, messages });

describe("Sino Conversation experience", () => {
  it("keeps an optimistic Founder message until its canonical version arrives", () => {
    const optimistic = { message_id: "optimistic-client-1", role: "founder", content: "第一条消息", optimistic: true, grounding: { client_message_id: "client-1" } };
    expect(mergeConversationSnapshot(snapshot([optimistic]), snapshot([])).messages).toEqual([optimistic]);
    const canonical = { message_id: "message-client-1", role: "founder", content: "第一条消息", grounding: { client_message_id: "client-1" } };
    const merged = mergeConversationSnapshot(snapshot([optimistic]), snapshot([canonical]));
    expect(merged.messages).toEqual([canonical]);
  });

  it("recognizes the canonical Sino reply by client message id", () => {
    expect(hasConversationReply(snapshot([{ message_id: "reply-1", role: "assistant", grounding: { response_to_client_message_id: "client-1" } }]), "client-1")).toBe(true);
    expect(hasConversationReply(snapshot([]), "client-1")).toBe(false);
  });

  it("retains a newer canonical reply when an older poll snapshot arrives", () => {
    const founder = { message_id: "f2", role: "founder", content: "第二轮", grounding: { client_message_id: "client-2" } };
    const reply = { message_id: "a2", role: "assistant", content: "第二轮回复", grounding: { response_to_client_message_id: "client-2" } };
    const merged = mergeConversationSnapshot(snapshot([founder, reply]), snapshot([founder]));
    expect(merged.messages.map((item) => item.message_id)).toEqual(["f2", "a2"]);
    expect(hasConversationReply(merged, "client-2")).toBe(true);
  });

  it("shows a transient thinking state without creating a Conversation message", () => {
    const { container } = render(<ConversationThread snapshot={snapshot([{ message_id: "f1", role: "founder", content: "问题" }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy replyPending />);
    expect(screen.getByRole("status", { name: "Sino 正在思考" })).toBeTruthy();
    const founderMessage = container.querySelector('article[data-role="founder"]');
    expect(founderMessage).toBeTruthy();
    expect(founderMessage.textContent).toContain("问题");
    expect(founderMessage.textContent).not.toContain("Founder");
  });

  it("replaces thinking with one transient streaming reply", () => {
    const { container } = render(<ConversationThread snapshot={snapshot([{ message_id: "f1", role: "founder", content: "问题" }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy replyPending streamingReply={{ clientMessageId: "client-1", content: "正在增量回答 **重点**" }} />);
    expect(container.querySelector('[aria-label="Sino 正在思考"]')).toBeNull();
    expect(container.querySelectorAll('[data-streaming="true"]')).toHaveLength(1);
    expect(screen.getByText("重点").tagName).toBe("STRONG");
  });

  it("renders model Markdown as paragraphs, list, emphasis, strong and inline code", () => {
    const content = "## 判断\n\n第一段。\n\n第二段包含 **重点**、*观点* 和 `证据`。\n\n- 已有能力\n- 优先缺口";
    const { container } = render(<ConversationThread snapshot={snapshot([{ message_id: "a1", role: "assistant", content }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("heading", { level: 2, name: "判断" })).toBeTruthy();
    expect(container.querySelectorAll(".sino-message-body p")).toHaveLength(2);
    expect(container.querySelector(".sino-message-body ul")).toBeTruthy();
    expect(container.querySelector(".sino-message-body strong").textContent).toBe("重点");
    expect(container.querySelector(".sino-message-body em").textContent).toBe("观点");
    expect(container.querySelector(".sino-message-body code").textContent).toBe("证据");
  });
});
