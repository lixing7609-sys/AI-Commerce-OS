import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FEATURE_FLAGS, assertDistributedComputeAllowed, isDistributedComputeEnabled } from "./featureFlags.js";
import {
  cancelComputeTask,
  getComputeOverview,
  getDistributedComputeState,
  setGlobalPause,
} from "./mockComputeRepository.js";

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

describe("distributedCompute feature flag", () => {
  it("defaults distributedCompute.enabled to false", () => {
    expect(FEATURE_FLAGS.distributedCompute.enabled).toBe(false);
    expect(isDistributedComputeEnabled()).toBe(false);
  });

  it("assertDistributedComputeAllowed throws while the flag is off (no real dispatch path can proceed)", () => {
    expect(() => assertDistributedComputeAllowed()).toThrow();
  });
});

describe("distributedCompute mock repository", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds a device pool with distinct device states (not one shared identical record)", () => {
    const state = getDistributedComputeState();
    expect(state.devicePool.length).toBeGreaterThan(1);
    const statuses = new Set(state.devicePool.map((d) => d.networkState));
    expect(statuses.size).toBeGreaterThan(1);
  });

  it("every device has a per-device participation policy defaulting to disabled", () => {
    const state = getDistributedComputeState();
    for (const device of state.devicePool) {
      const policy = state.participationPolicies.find((p) => p.deviceId === device.deviceId);
      expect(policy).toBeTruthy();
      expect(policy.enabled).toBe(false);
    }
  });

  it("every compute task is marked sandboxed", () => {
    const state = getDistributedComputeState();
    for (const task of state.computeTasks) {
      expect(task.sandboxed).toBe(true);
    }
  });

  it("overview never fabricates a nonzero estimated cloud cost savings while the flag is off", () => {
    const overview = getComputeOverview();
    expect(overview.estimatedCloudCostSavedRmb).toBe(0);
  });

  it("all mock state is tagged as demo data", () => {
    expect(getDistributedComputeState().is_demo).toBe(true);
    expect(getComputeOverview().is_demo).toBe(true);
  });

  it("setGlobalPause only mutates mock display state and never throws or dispatches anything", async () => {
    const result = await setGlobalPause(false);
    expect(result).toBe(false);
    const restored = await setGlobalPause(true);
    expect(restored).toBe(true);
  });

  it("cancelComputeTask only updates the mock task's status field", async () => {
    const before = getDistributedComputeState();
    const targetId = before.computeTasks[0].taskId;
    const after = await cancelComputeTask(targetId);
    expect(after.computeTasks.find((t) => t.taskId === targetId).status).toBe("cancelled");
  });
});
