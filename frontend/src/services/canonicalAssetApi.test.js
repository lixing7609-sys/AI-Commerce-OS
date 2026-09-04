import { afterEach, describe, expect, it, vi } from "vitest";

import { createArtifact, getArtifact, getArtifacts } from "./artifactApi";
import { createMemory, getMemories, getMemory } from "./memoryApi";
import { createTaskAsset, getTaskAsset, getTaskAssets } from "./taskAssetApi";

const sample = { id: "asset-1", system_id: "founder_ai", title: "Example" };

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body = sample) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

describe("canonical asset services", () => {
  it("uses task-assets paths and maps responses", async () => {
    const fetchMock = mockFetch([sample]);
    expect(await getTaskAssets()).toEqual([sample]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/task-assets",
      undefined
    );

    fetchMock.mockClear();
    expect(await getTaskAsset("a/1")).toEqual([sample]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/api/v1/task-assets/a%2F1"
    );
  });

  it("posts TaskAsset payloads", async () => {
    const fetchMock = mockFetch(sample);
    const payload = { title: "Build", scope: {} };
    expect(await createTaskAsset(payload)).toEqual(sample);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/api/v1/task-assets"
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(payload),
    });
  });

  it("uses artifact paths", async () => {
    const fetchMock = mockFetch([sample]);
    expect(await getArtifacts()).toEqual([sample]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/api/v1/artifacts"
    );

    fetchMock.mockClear();
    expect(await getArtifact("artifact/1")).toEqual([sample]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/api/v1/artifacts/artifact%2F1"
    );

    fetchMock.mockClear();
    await createArtifact({ artifact_type: "document", title: "Doc" });
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("uses memory paths", async () => {
    const fetchMock = mockFetch([sample]);
    expect(await getMemories()).toEqual([sample]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/api/v1/memories"
    );

    fetchMock.mockClear();
    expect(await getMemory("memory/1")).toEqual([sample]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8000/api/v1/memories/memory%2F1"
    );

    fetchMock.mockClear();
    await createMemory({ memory_type: "knowledge", title: "Note", content: "..." });
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });
});
