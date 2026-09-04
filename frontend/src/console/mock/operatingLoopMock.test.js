import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  canTransitionApproval,
  canTransitionContentProject,
  canTransitionPublishJob,
  deterministicPerformanceFor,
  getStageIndexForState,
  platformExecutionContract,
} from "./operatingLoopMock.js";

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

describe("operatingLoopMock state machines", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("canTransitionContentProject", () => {
    it("allows Draft -> Generating", () => {
      expect(canTransitionContentProject("Draft", "Generating").ok).toBe(true);
    });
    it("allows the full golden path chain", () => {
      const chain = [
        ["Draft", "Generating"],
        ["Generating", "Generated"],
        ["Generated", "Pending Approval"],
        ["Pending Approval", "Approved"],
        ["Approved", "Ready to Publish"],
        ["Ready to Publish", "Publishing"],
        ["Publishing", "Published"],
        ["Published", "Monitoring"],
        ["Monitoring", "Reviewed"],
      ];
      for (const [from, to] of chain) {
        expect(canTransitionContentProject(from, to).ok, `${from} -> ${to}`).toBe(true);
      }
    });
    it("rejects skipping states (Draft -> Published)", () => {
      const result = canTransitionContentProject("Draft", "Published");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/不允许/);
    });
    it("rejects transitions from a terminal state (Archived -> anything)", () => {
      expect(canTransitionContentProject("Archived", "Draft").ok).toBe(false);
    });
    it("rejects an unknown starting state", () => {
      const result = canTransitionContentProject("NotARealState", "Draft");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/未知/);
    });
    it("allows revision loop: Revision Requested -> Generating", () => {
      expect(canTransitionContentProject("Revision Requested", "Generating").ok).toBe(true);
    });
  });

  describe("canTransitionApproval", () => {
    it("allows pending -> approved/rejected/returned", () => {
      expect(canTransitionApproval("pending", "approved").ok).toBe(true);
      expect(canTransitionApproval("pending", "rejected").ok).toBe(true);
      expect(canTransitionApproval("pending", "returned").ok).toBe(true);
    });
    it("rejects re-deciding an already-approved request", () => {
      expect(canTransitionApproval("approved", "rejected").ok).toBe(false);
    });
  });

  describe("canTransitionPublishJob", () => {
    it("allows the full queue -> succeeded chain", () => {
      expect(canTransitionPublishJob("Draft", "Queued").ok).toBe(true);
      expect(canTransitionPublishJob("Queued", "Executing").ok).toBe(true);
      expect(canTransitionPublishJob("Executing", "Succeeded").ok).toBe(true);
    });
    it("rejects transitioning out of a Succeeded job", () => {
      expect(canTransitionPublishJob("Succeeded", "Executing").ok).toBe(false);
    });
    it("allows retry from Failed back to Queued", () => {
      expect(canTransitionPublishJob("Failed", "Queued").ok).toBe(true);
    });
  });

  describe("getStageIndexForState", () => {
    it("maps Draft to the first stage", () => {
      expect(getStageIndexForState("Draft")).toBe(0);
    });
    it("maps Reviewed to the last stage", () => {
      expect(getStageIndexForState("Reviewed")).toBe(9);
    });
    it("falls back to 0 for an unknown state", () => {
      expect(getStageIndexForState("NotARealState")).toBe(0);
    });
  });

  describe("deterministicPerformanceFor", () => {
    it("returns the same numbers for the same id every time", () => {
      const a = deterministicPerformanceFor("cproj-loop-led-strip");
      const b = deterministicPerformanceFor("cproj-loop-led-strip");
      expect(a).toEqual(b);
    });
    it("returns internally consistent derived metrics", () => {
      const perf = deterministicPerformanceFor("cproj-loop-led-strip");
      expect(perf.views).toBeLessThan(perf.impressions);
      expect(perf.productClicks).toBeLessThan(perf.views);
      expect(perf.ordersAttributed).toBeGreaterThan(0);
    });
  });

  describe("platformExecutionContract", () => {
    it("validatePayload rejects a payload missing required fields", () => {
      const result = platformExecutionContract.validatePayload({ storeId: "store-1" });
      expect(result.ok).toBe(false);
    });
    it("validatePayload accepts a complete payload", () => {
      const result = platformExecutionContract.validatePayload({
        storeId: "store-1",
        productSku: "SKU-LED-005",
        contentVersionId: "cver-1",
      });
      expect(result.ok).toBe(true);
    });
    it("execute() never performs a real network call and returns a mock content id", async () => {
      const result = await platformExecutionContract.execute({ platform: "抖音" });
      expect(result.ok).toBe(true);
      expect(result.platformContentId).toMatch(/^MOCK-/);
    });
  });
});
