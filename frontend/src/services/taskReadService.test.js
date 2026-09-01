import { afterEach, describe, expect, it, vi } from "vitest";

import { getTaskDetail, getTaskList, getTasks, getTaskStats } from "./taskReadService";

afterEach(() => vi.restoreAllMocks());

describe("TaskCenter read service", () => {
  it("reads canonical TaskAsset data and preserves list shape", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ id: "asset-1", title: "Build", status: "draft", execution_status: "not_started" }],
    });
    const result = await getTaskList({ limit: 50, offset: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/task-assets");
    expect(result.items[0]).toMatchObject({ id: "asset-1", task_id: "asset-1", task_type: "Build", status: "pending", task_asset_status: "draft" });
    expect(result.pagination).toMatchObject({ limit: 50, offset: 0, returned: 1 });
    expect(result.stats).toMatchObject({ total: 1, pending: 1, running: 0, completed: 0, failed: 0 });
  });

  it("falls back to the legacy read source when canonical read fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: "legacy-1" }], pagination: { returned: 1 } }) });
    const result = await getTasks({ status: "pending" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.items[0].id).toBe("legacy-1");
  });

  it("reads canonical TaskAsset detail instead of legacy task detail", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "asset-detail", title: "Detail", status: "approved", execution_status: "completed", updated_at: "2026-01-01T00:00:00Z" }),
    });
    const result = await getTaskDetail("asset/detail");
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/task-assets/asset%2Fdetail");
    expect(result).toMatchObject({ id: "asset-detail", task_type: "Detail", status: "completed", completed_at: "2026-01-01T00:00:00Z" });
  });

  it("derives TaskCenter stats from canonical TaskAsset data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "pending", title: "Pending", status: "draft", execution_status: "not_started" },
        { id: "running", title: "Running", status: "approved", execution_status: "running" },
        { id: "completed", title: "Done", status: "approved", execution_status: "completed" },
        { id: "failed", title: "Failed", status: "failed", execution_status: "failed" },
      ],
    });
    await expect(getTaskStats()).resolves.toEqual({ total: 4, pending: 1, running: 1, completed: 1, failed: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/v1/task-assets");
  });
});
