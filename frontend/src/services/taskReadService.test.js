import { afterEach, describe, expect, it, vi } from "vitest";

import { getTasks } from "./taskReadService";

afterEach(() => vi.restoreAllMocks());

describe("TaskCenter read service", () => {
  it("reads canonical TaskAsset data and preserves list shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ id: "asset-1", title: "Build", status: "draft", execution_status: "not_started" }],
    });
    const result = await getTasks({ limit: 50, offset: 0 });
    expect(result.items[0]).toMatchObject({ id: "asset-1", task_type: "Build" });
    expect(result.pagination).toMatchObject({ limit: 50, offset: 0, returned: 1 });
  });

  it("falls back to the legacy read source when canonical read fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: "legacy-1" }], pagination: { returned: 1 } }) });
    const result = await getTasks({ status: "pending" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.items[0].id).toBe("legacy-1");
  });
});
