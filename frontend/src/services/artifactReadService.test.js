import { afterEach, describe, expect, it, vi } from "vitest";

import { getArtifact, getArtifacts } from "./artifactApi";
import { getDeliverable } from "./deliverableApi";
import {
  __artifactReadServiceInternals,
  getArtifactDetail,
  getArtifactDisplayModel,
  getArtifactList,
} from "./artifactReadService";

vi.mock("./artifactApi", () => ({
  getArtifact: vi.fn(),
  getArtifacts: vi.fn(),
}));

vi.mock("./deliverableApi", () => ({
  getDeliverable: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("artifactReadService", () => {
  it("uses ArtifactAsset list as the primary artifact read source", async () => {
    getArtifacts.mockResolvedValue([
      { id: "artifact-1", title: "首页方案", artifact_type: "general_result", status: "active", task_asset_id: "task-1" },
    ]);

    const result = await getArtifactList({ limit: 50, offset: 0 });

    expect(getArtifacts).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("artifact_asset");
    expect(result.items[0]).toMatchObject({
      id: "artifact-1",
      artifact_id: "artifact-1",
      deliverable_type: "general_result",
      task_asset_id: "task-1",
      source_task_id: "task-1",
      metadata: { canonical_source: "artifact_asset" },
    });
  });

  it("uses ArtifactAsset detail as the primary detail source", async () => {
    getArtifact.mockResolvedValue({
      id: "artifact/detail",
      title: "Detail",
      artifact_type: "ceo_analysis",
      status: "active",
      task_asset_id: "task-2",
      content_ref: JSON.stringify({ execution_id: "execution-1", summary: "Visible result" }),
    });

    const result = await getArtifactDetail("artifact/detail");

    expect(getArtifact).toHaveBeenCalledWith("artifact/detail");
    expect(getDeliverable).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "artifact/detail",
      artifact_id: "artifact/detail",
      execution_id: "execution-1",
      task_asset_id: "task-2",
      current_version_data: {
        structured_content: expect.objectContaining({ summary: "Visible result" }),
      },
    });
  });

  it("keeps legacy deliverable detail as compatibility enrichment only", async () => {
    getArtifact.mockResolvedValue({
      id: "artifact-legacy",
      title: "Legacy backed",
      artifact_type: "general_result",
      status: "active",
      content_ref: "deliverable://42",
    });
    getDeliverable.mockResolvedValue({
      id: 42,
      current_version: 3,
      versions: [{ version_number: 1 }, { version_number: 2 }, { version_number: 3 }],
      current_version_data: { version_number: 3, format: "text", structured_content: { text: "legacy" } },
      available_actions: ["export", "archive"],
    });

    const result = await getArtifactDetail("artifact-legacy");

    expect(getArtifact).toHaveBeenCalledWith("artifact-legacy");
    expect(getDeliverable).toHaveBeenCalledWith("42");
    expect(result).toMatchObject({
      id: "artifact-legacy",
      artifact_id: "artifact-legacy",
      legacy_deliverable_id: "42",
      metadata: { canonical_source: "artifact_asset", compatibility_source: "legacy_deliverable" },
      current_version: 3,
      available_actions: ["export", "archive"],
    });
  });

  it("maps TaskAsset linkage into the stable frontend artifact shape", () => {
    const result = getArtifactDisplayModel({
      id: "artifact-2",
      title: "Linked",
      artifact_type: "document",
      task_asset_id: "task-asset-1",
      conversation_id: "conv-1",
      decision_id: "decision-1",
    });

    expect(result).toMatchObject({
      id: "artifact-2",
      artifact_id: "artifact-2",
      task_id: "task-asset-1",
      task_asset_id: "task-asset-1",
      source_task_id: "task-asset-1",
      conversation_id: "conv-1",
      decision_id: "decision-1",
    });
  });

  it("does not fabricate execution linkage when canonical evidence is absent", () => {
    const result = __artifactReadServiceInternals.normalizeArtifactAsset({
      id: "artifact-no-execution",
      title: "No execution",
      artifact_type: "document",
    });

    expect(result.execution_id).toBeNull();
  });
});
