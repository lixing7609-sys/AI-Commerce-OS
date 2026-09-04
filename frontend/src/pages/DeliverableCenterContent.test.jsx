// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeliverableCenterContent from "./DeliverableCenterContent";
import { getArtifactDetail, getArtifactList } from "../services/artifactReadService";
import {
  approveDeliverable,
  exportDeliverable,
  getDeliverable,
  getDeliverables,
} from "../services/deliverableApi";
import { getAgents } from "../services/agentApi";
import { getShops } from "../services/shopApi";

vi.mock("../components/shops/ShopScopeSelector", () => ({
  default: () => <div aria-label="shop scope" />,
}));

vi.mock("../components/analysisViews/CeoAnalysisView", () => ({
  default: ({ data }) => <pre aria-label="ceo analysis">{JSON.stringify(data)}</pre>,
}));

vi.mock("../components/analysisViews/ProductAnalysisView", () => ({
  default: ({ data }) => <pre aria-label="product analysis">{JSON.stringify(data)}</pre>,
}));

vi.mock("../components/analysisViews/SalesAnalysisView", () => ({
  default: ({ data }) => <pre aria-label="sales analysis">{JSON.stringify(data)}</pre>,
}));

vi.mock("../services/artifactReadService", () => ({
  getArtifactDetail: vi.fn(),
  getArtifactList: vi.fn(),
}));

vi.mock("../services/deliverableApi", () => ({
  approveDeliverable: vi.fn(),
  archiveDeliverable: vi.fn(),
  exportDeliverable: vi.fn(),
  getDeliverable: vi.fn(),
  getDeliverables: vi.fn(),
  rejectDeliverable: vi.fn(),
  restoreDeliverable: vi.fn(),
}));

vi.mock("../services/agentApi", () => ({ getAgents: vi.fn() }));
vi.mock("../services/shopApi", () => ({ getShops: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function artifactListItem(overrides = {}) {
  return {
    id: "artifact-1",
    artifact_id: "artifact-1",
    title: "Artifact result",
    summary: "Canonical summary",
    artifact_type: "general_result",
    deliverable_type: "general_result",
    status: "active",
    source_task_id: "task-asset-1",
    task_asset_id: "task-asset-1",
    current_version: 1,
    created_at: "2026-01-01T00:00:00Z",
    agent_name: "ArtifactAsset",
    shop_name: null,
    ...overrides,
  };
}

function artifactDetail(overrides = {}) {
  return {
    ...artifactListItem(),
    current_version_data: {
      version_number: 1,
      format: "structured",
      structured_content: { summary: "Canonical detail" },
      content: "Canonical detail",
    },
    versions: [],
    available_actions: [],
    child_tasks: [],
    parent_task: null,
    shop: null,
    legacy_deliverable_id: null,
    ...overrides,
  };
}

describe("DeliverableCenter ArtifactAsset read path", () => {
  it("loads normal list through artifactReadService instead of legacy deliverables", async () => {
    getShops.mockResolvedValue({ items: [] });
    getArtifactList.mockResolvedValue({ items: [artifactListItem()], total: 1 });

    render(<DeliverableCenterContent />);

    await waitFor(() => expect(getArtifactList).toHaveBeenCalledTimes(1));
    expect(getDeliverables).not.toHaveBeenCalled();
    expect(screen.getByText("Artifact result")).toBeTruthy();
    expect(screen.getByText("当前显示 1 条，共 1 条")).toBeTruthy();
  });

  it("loads normal detail through artifactReadService instead of legacy deliverable detail", async () => {
    getShops.mockResolvedValue({ items: [] });
    getAgents.mockResolvedValue({ items: [] });
    getArtifactDetail.mockResolvedValue(artifactDetail());

    render(<DeliverableCenterContent selectedDeliverableId="artifact-1" />);

    await waitFor(() => expect(getArtifactDetail).toHaveBeenCalledWith("artifact-1"));
    expect(getDeliverable).not.toHaveBeenCalled();
    expect(screen.getByText("Artifact result")).toBeTruthy();
    expect(screen.getAllByText((_, node) => node?.textContent?.includes("Canonical detail")).length).toBeGreaterThan(0);
  });

  it("keeps legacy export and review actions available through compatibility identity", async () => {
    const blob = new Blob(["artifact"], { type: "text/plain" });
    window.URL.createObjectURL = vi.fn(() => "blob:artifact");
    window.URL.revokeObjectURL = vi.fn();
    getShops.mockResolvedValue({ items: [] });
    getAgents.mockResolvedValue({ items: [] });
    getArtifactDetail.mockResolvedValue(artifactDetail({
      legacy_deliverable_id: "77",
      available_actions: ["approve", "export"],
    }));
    approveDeliverable.mockResolvedValue({ status: "approved" });
    exportDeliverable.mockResolvedValue({ blob, filename: "artifact.md" });

    render(<DeliverableCenterContent selectedDeliverableId="artifact-1" />);

    await screen.findByText("Artifact result");
    fireEvent.click(screen.getByText("批准"));
    await waitFor(() => expect(approveDeliverable).toHaveBeenCalledWith("77"));

    fireEvent.click(screen.getByText("下载 JSON"));
    await waitFor(() => expect(exportDeliverable).toHaveBeenCalledWith("77", "json"));
  });
});
