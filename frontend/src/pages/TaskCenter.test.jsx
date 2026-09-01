// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TaskCenter from "./TaskCenter";
import { getTaskDetail, getTaskList, getTaskStats } from "../services/taskReadService";
import { getShops } from "../services/shopApi";

vi.mock("../components/layout/Sidebar", () => ({
  default: () => <aside aria-label="sidebar" />,
}));

vi.mock("../components/shops/ShopScopeSelector", () => ({
  default: () => <div aria-label="shop scope" />,
}));

vi.mock("../components/tasks/RecoveryCandidatesPanel", () => ({
  default: ({ onTaskMutated, onViewTask }) => (
    <section aria-label="recovery">
      <button type="button" onClick={onTaskMutated}>refresh after recovery</button>
      <button type="button" onClick={() => onViewTask("asset-2")}>view recovery task</button>
    </section>
  ),
}));

vi.mock("../components/tasks/TaskDetailDrawer", () => ({
  default: ({ task }) => <aside aria-label="task drawer">{task?.id || "no task"}</aside>,
}));

vi.mock("../services/taskReadService", () => ({
  getTaskList: vi.fn(),
  getTaskStats: vi.fn(),
  getTaskDetail: vi.fn(),
}));

vi.mock("../services/shopApi", () => ({
  getShops: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function mockTaskReads() {
  getShops.mockResolvedValue({ items: [] });
  getTaskList.mockResolvedValue({
    items: [{ id: "asset-1", task_type: "Build", status: "pending", created_at: "2026-01-01T00:00:00Z" }],
    pagination: { limit: 50, offset: 0, returned: 1, filtered_total: 1 },
  });
  getTaskStats.mockResolvedValue({ total: 1, pending: 1, running: 0, completed: 0, failed: 0 });
  getTaskDetail.mockResolvedValue({ id: "asset-2", task_type: "Recovered", status: "running" });
}

describe("TaskCenter canonical read path", () => {
  it("loads list and stats through the TaskAsset read service", async () => {
    mockTaskReads();
    render(<TaskCenter />);
    await waitFor(() => expect(getTaskList).toHaveBeenCalledTimes(1));
    expect(getTaskStats).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Build")).toBeTruthy();
    expect(screen.getByText("asset-1")).toBeTruthy();
    expect(screen.getAllByText("1").length).toBeGreaterThanOrEqual(2);
  });

  it("loads missing detail through the TaskAsset read service", async () => {
    mockTaskReads();
    render(<TaskCenter selectedTaskId="asset-2" />);
    await waitFor(() => expect(getTaskDetail).toHaveBeenCalledWith("asset-2"));
    expect(await screen.findByText("asset-2")).toBeTruthy();
  });

  it("preserves recovery-triggered refresh without owning recovery operations", async () => {
    mockTaskReads();
    render(<TaskCenter />);
    await waitFor(() => expect(getTaskList).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("refresh after recovery"));
    await waitFor(() => expect(getTaskList).toHaveBeenCalledTimes(2));
  });
});
