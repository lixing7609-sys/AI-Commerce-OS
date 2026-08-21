// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationThread } from "./ConversationThread.jsx";
import { normalizeFounderView } from "./ConversationWorkspace.jsx";
import { ExecutionCenterEmpty, FounderWorkQueue } from "./SinoBrainContext.jsx";

vi.mock("../services/founderAiApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  acceptFounderTaskResult: vi.fn(), cancelFounderExecution: vi.fn(),
  decideCodexAuthorization: vi.fn(), decideFounderClarification: vi.fn(),
  decideFounderTaskCandidate: vi.fn(), focusFounderTask: vi.fn(),
}));

afterEach(cleanup);

const conversation = (messages = []) => <ConversationThread snapshot={messages.length ? { conversation: { id: "conv-1", title: "历史讨论" }, messages } : null}
  message="" onMessage={() => {}} onSend={() => {}} busy={false} />;

describe("Unified three-column Founder Workspace", () => {
  it("merges home, new discussion and project entry into the Conversation workspace", () => {
    expect(normalizeFounderView("home")).toBe("conversation");
    expect(normalizeFounderView("draft")).toBe("conversation");
    expect(normalizeFounderView("project")).toBe("conversation");
  });

  it("renders an empty natural Conversation surface without creation shortcuts", () => {
    render(conversation());
    const center = screen.getByRole("region", { name: "Conversation" });
    expect(within(center).getByText("和 Sino 讨论任何想法、问题或计划……")).toBeTruthy();
    expect(within(center).getByRole("textbox", { name: "讨论内容" })).toBeTruthy();
    expect(within(center).queryByText("创造什么 AI 能力？")).toBeNull();
    expect(within(center).queryByText("创建 Agent")).toBeNull();
  });

  it("uses Execution Center as the one empty right-column projection", () => {
    render(<ExecutionCenterEmpty />);
    const right = screen.getByRole("region", { name: "Execution Center" });
    expect(within(right).getByRole("heading", { name: "执行中心" })).toBeTruthy();
    expect(within(right).getByText("暂无执行事项")).toBeTruthy();
    expect(within(right).queryByText("能力上下文")).toBeNull();
  });

  it("projects one candidate and multiple tasks through the same Execution Center list", () => {
    const tasks = [
      { task_ref: "candidate:c1", candidate_id: "c1", title: "待确认任务", status: "pending_founder_confirmation", founder_action_required: true, founder_actions: [], is_candidate: true, is_completed: false, is_archived: false, details: {} },
      { task_ref: "task:t1", task_id: "t1", title: "执行中任务", status: "executing", progress: 35, founder_action_required: false, founder_actions: [], is_candidate: false, is_completed: false, is_archived: false, details: {} },
    ];
    render(<FounderWorkQueue tasks={tasks} focusedTaskId="candidate:c1" conversationId="conv-1" />);
    const right = screen.getByRole("region", { name: "Execution Center" });
    expect(within(right).getAllByRole("article", { name: /Task Card:/ })).toHaveLength(2);
    expect(within(right).getByRole("article", { name: "Task Card: 待确认任务" })).toBeTruthy();
    expect(within(right).getByRole("article", { name: "Task Card: 执行中任务" })).toBeTruthy();
  });
});
