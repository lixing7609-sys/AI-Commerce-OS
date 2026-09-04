import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  advanceProjectStage,
  getIpList,
  getStudioOverview,
  getStudioState,
  reserveAdResource,
} from "./studioMock.js";

function createFakeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
  };
}

describe("Studio mock data layer", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds every domain collection with real, non-empty business data", () => {
    const state = getStudioState();
    expect(state.contentProjects.length).toBeGreaterThan(0);
    expect(state.matrixAccounts.length).toBeGreaterThan(0);
    expect(state.contentAssets.length).toBeGreaterThan(0);
    expect(state.trafficPool.length).toBeGreaterThan(0);
    expect(state.adResources.length).toBeGreaterThan(0);
    expect(state.adOrders.length).toBeGreaterThan(0);
  });

  it("matrix accounts show coherent differentiation across health/monetization states", () => {
    const state = getStudioState();
    const healthStates = new Set(state.matrixAccounts.map((a) => a.accountHealth));
    expect(healthStates.size).toBeGreaterThan(1);
  });

  it("ad orders distinguish Operator-originated demand from external customers", () => {
    const state = getStudioState();
    const operatorOrders = state.adOrders.filter((o) => o.customerType === "operator");
    const externalOrders = state.adOrders.filter((o) => o.customerType === "external");
    expect(operatorOrders.length).toBeGreaterThan(0);
    expect(externalOrders.length).toBeGreaterThan(0);
    for (const order of operatorOrders) {
      expect(order.sourceOperatorBusinessUnitId).toBeTruthy();
    }
  });

  it("overview aggregates are computed from the underlying collections, not hardcoded", () => {
    const overview = getStudioOverview();
    expect(overview.matrixAccountCount).toBe(getStudioState().matrixAccounts.length);
    expect(overview.sellableResources).toBeGreaterThanOrEqual(0);
  });

  it("all reads are tagged as demo data", () => {
    expect(getStudioState().is_demo).toBe(true);
    expect(getStudioOverview().is_demo).toBe(true);
    expect(getIpList().every((ip) => ip.is_demo)).toBe(true);
  });

  it("reserveAdResource only reserves an available resource, never a sold-out one", async () => {
    const before = getStudioState();
    const soldOut = before.adResources.find((r) => r.status === "sold_out");
    expect(soldOut).toBeTruthy();
    const after = await reserveAdResource(soldOut.resourceId);
    expect(after.adResources.find((r) => r.resourceId === soldOut.resourceId).status).toBe("sold_out");

    const available = before.adResources.find((r) => r.status === "available");
    const afterAvailable = await reserveAdResource(available.resourceId);
    expect(afterAvailable.adResources.find((r) => r.resourceId === available.resourceId).status).toBe("reserved");
  });

  it("advanceProjectStage updates only the targeted project's stage", async () => {
    const before = getStudioState();
    const target = before.contentProjects[0];
    const after = await advanceProjectStage(target.projectId, "已发布测试阶段");
    expect(after.contentProjects.find((p) => p.projectId === target.projectId).stage).toBe("已发布测试阶段");
    const untouched = after.contentProjects.find((p) => p.projectId !== target.projectId);
    expect(untouched.stage).not.toBe("已发布测试阶段");
  });
});
