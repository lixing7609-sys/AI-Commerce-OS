// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/founderAiApi.js", () => ({
  acceptFounderTaskResult: vi.fn(), cancelFounderExecution: vi.fn(), decideCodexAuthorization: vi.fn(),
  decideFounderClarification: vi.fn(), decideFounderTaskCandidate: vi.fn(), focusFounderTask: vi.fn(),
}));

import { focusFounderTask } from "../services/founderAiApi.js";
import { FounderWorkQueue } from "./SinoBrainContext.jsx";

const task = (index, overrides = {}) => ({
  task_ref: `task-${index}`, task_id: `task-${index}`, candidate_id: null, title: `Task ${index}`,
  status: "queued", progress: index, founder_action_required: false, founder_actions: [],
  is_candidate: false, is_completed: false, is_archived: false, details: { description: `Detail ${index}` },
  ...overrides,
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  focusFounderTask.mockImplementation(async (_conversationId, taskRef) => ({ focused_task_id: taskRef }));
});

describe("Founder Work Queue", () => {
  it.each([1, 2, 4, 10])("renders all %i tasks as one continuous list", (count) => {
    render(<FounderWorkQueue conversationId="conv-many" tasks={Array.from({ length: count }, (_, index) => task(index))} focusedTaskId="task-0" />);
    expect(screen.getAllByRole("article", { name: /Task Card:/ })).toHaveLength(count);
    expect(screen.getByRole("region", { name: "Conversation Tasks" }).className).toContain("sino-work-queue-list");
  });

  it("focuses the clicked task without hiding or mutating the other cards", async () => {
    const tasks = [task(0, { status: "executing" }), task(1, { status: "pending_founder_confirmation" })];
    const onFocused = vi.fn();
    render(<FounderWorkQueue conversationId="conv-many" tasks={tasks} focusedTaskId="task-0" onFocused={onFocused} />);
    fireEvent.click(screen.getByRole("article", { name: "Task Card: Task 1" }));
    expect(focusFounderTask).toHaveBeenCalledWith("conv-many", "task-1");
    await vi.waitFor(() => expect(onFocused).toHaveBeenCalledWith({ focused_task_id: "task-1" }));
    expect(screen.getByRole("article", { name: "Task Card: Task 0" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Task Card: Task 1" })).toBeTruthy();
  });

  it("binds a confirmation action only to its candidate card", () => {
    const candidate = task(0, { task_ref: "candidate:c-0", task_id: null, candidate_id: "c-0",
      title: "Candidate", status: "pending_founder_confirmation", founder_action_required: true,
      is_candidate: true, details: { goal: "Goal", scope: [], constraints: [], acceptance_criteria: [] },
      founder_actions: [{ action_id: "a-0", candidate_id: "c-0", type: "TASK_CONFIRMATION", status: "pending" }] });
    render(<FounderWorkQueue conversationId="conv-many" tasks={[candidate, task(1)]} focusedTaskId="candidate:c-0" />);
    expect(within(screen.getByRole("article", { name: "Task Card: Candidate" })).getByRole("button", { name: "确认执行" })).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Task Card: Task 1" })).queryByRole("button", { name: "确认执行" })).toBeNull();
  });

  it("keeps prior cards when an eleventh task is appended", () => {
    const firstTen = Array.from({ length: 10 }, (_, index) => task(index));
    const { rerender } = render(<FounderWorkQueue conversationId="conv-many" tasks={firstTen} focusedTaskId="task-0" />);
    rerender(<FounderWorkQueue conversationId="conv-many" tasks={[...firstTen, task(10)]} focusedTaskId="task-10" />);
    expect(screen.getAllByRole("article", { name: /Task Card:/ })).toHaveLength(11);
    expect(screen.getByRole("article", { name: "Task Card: Task 0" })).toBeTruthy();
  });

  it("keeps completed tasks retrievable in a collapsed section", () => {
    render(<FounderWorkQueue conversationId="conv-many" tasks={[task(0), task(1, { status: "completed", is_completed: true })]} focusedTaskId="task-0" />);
    const completed = screen.getByText("已完成（1）").closest("details");
    expect(completed.open).toBe(false);
    expect(within(completed).getByRole("article", { name: "Task Card: Task 1" })).toBeTruthy();
  });
});
