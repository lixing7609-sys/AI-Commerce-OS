import { afterEach, describe, expect, it, vi } from "vitest";

import { getLibraryMemory } from "./founderAiApi";
import { listKnowledgeDocuments } from "./knowledgeApi";
import { getMemories, getMemory } from "./memoryApi";
import {
  __memoryReadServiceInternals,
  classifyMemoryProjection,
  getMemoryDetail,
  getMemoryDisplayModel,
  getMemoryList,
} from "./memoryReadService";

vi.mock("./memoryApi", () => ({
  getMemories: vi.fn(),
  getMemory: vi.fn(),
}));

vi.mock("./founderAiApi", () => ({
  getLibraryMemory: vi.fn(),
}));

vi.mock("./knowledgeApi", () => ({
  listKnowledgeDocuments: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("memoryReadService", () => {
  it("uses MemoryAsset list as the primary durable memory read source", async () => {
    getMemories.mockResolvedValue([
      { id: "memory-1", memory_type: "learning", title: "Learning", content: "{\"learning\":\"Keep scope tight\"}", status: "active" },
    ]);

    const result = await getMemoryList();

    expect(getMemories).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ total: 1, source: "memory_asset" });
    expect(result.items[0]).toMatchObject({
      id: "memory-1",
      memory_id: "memory-1",
      memory_type: "learning",
      projection_class: "DURABLE_MEMORY",
      metadata: { canonical_source: "memory_asset" },
    });
    expect(listKnowledgeDocuments).not.toHaveBeenCalled();
  });

  it("uses MemoryAsset detail as canonical primary and library detail as compatibility enrichment", async () => {
    getMemory.mockResolvedValue({
      id: "memory/detail",
      memory_type: "knowledge",
      title: "Canonical title",
      content: "{\"knowledge\":\"Canonical content\",\"execution_id\":\"execution-canonical\"}",
      status: "active",
      task_asset_id: "task-1",
    });
    getLibraryMemory.mockResolvedValue({
      memory_id: "memory/detail",
      title: "Library title must not win",
      content: "Library content must not win",
      memory_type: "legacy",
      status: "outdated",
      execution_id: "execution-library",
      references: [{ reference_id: "ref-1" }],
      history: [{ memory_id: "memory/detail", revision_number: 1 }],
    });

    const result = await getMemoryDetail("memory/detail");

    expect(getMemory).toHaveBeenCalledWith("memory/detail");
    expect(getLibraryMemory).toHaveBeenCalledWith("memory/detail");
    expect(result).toMatchObject({
      id: "memory/detail",
      memory_id: "memory/detail",
      title: "Canonical title",
      content: "{\"knowledge\":\"Canonical content\",\"execution_id\":\"execution-canonical\"}",
      memory_type: "knowledge",
      status: "active",
      task_asset_id: "task-1",
      execution_id: "execution-canonical",
      provenance: {
        canonical_source: "memory_asset",
        compatibility_source: "library_memory",
        references: [{ reference_id: "ref-1" }],
      },
      history: [{ memory_id: "memory/detail", revision_number: 1 }],
    });
  });

  it("keeps library failures from replacing canonical MemoryAsset detail", async () => {
    getMemory.mockResolvedValue({ id: "memory-2", memory_type: "decision", title: "Decision", content: "{}", status: "active" });
    getLibraryMemory.mockRejectedValue(new Error("library unavailable"));

    const result = await getMemoryDetail("memory-2");

    expect(result).toMatchObject({
      id: "memory-2",
      memory_id: "memory-2",
      memory_type: "decision",
      provenance: { canonical_source: "memory_asset", compatibility_source: null },
    });
  });

  it("normalizes canonical memory shape with linkage, timestamps, terms and provenance", () => {
    const result = getMemoryDisplayModel({
      id: "memory-3",
      memory_type: "key_term",
      title: "Term",
      content: "{\"terms\":[\"TaskAsset\"],\"source\":\"conversation\"}",
      status: "active",
      conversation_id: "conv-1",
      decision_id: "decision-1",
      task_asset_id: "task-1",
      artifact_id: "artifact-1",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      confidence: 0.9,
      tags: ["term:TaskAsset"],
    });

    expect(result).toMatchObject({
      id: "memory-3",
      memory_id: "memory-3",
      type: "key_term",
      source: "conversation",
      conversation_id: "conv-1",
      decision_id: "decision-1",
      task_id: "task-1",
      task_asset_id: "task-1",
      artifact_id: "artifact-1",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      confidence: 0.9,
      terms: ["TaskAsset"],
      metadata: { canonical_source: "memory_asset" },
    });
  });

  it("classifies projection-only, knowledge-source and runtime context inputs without treating them as durable MemoryAsset", () => {
    expect(classifyMemoryProjection({ id: "memory-4", memory_type: "knowledge", content: "{}" })).toBe("DURABLE_MEMORY");
    expect(__memoryReadServiceInternals.normalizeMemory({ id: "projected", content: "{\"projected_context\":true}" }).projection_class).toBe("PROJECTED_CONTEXT");
    expect(__memoryReadServiceInternals.normalizeMemory({ id: "source-doc", content: "{\"knowledge_source\":true}" }).projection_class).toBe("KNOWLEDGE_SOURCE");
    expect(__memoryReadServiceInternals.normalizeMemory({ id: "runtime", content: "{\"runtime_context\":true}" }).projection_class).toBe("RUNTIME_CONTEXT");
  });
});
