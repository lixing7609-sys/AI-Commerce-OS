import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessMode } from "./types.js";

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("storeConnectionRepository", () => {
  let repo;

  beforeEach(async () => {
    globalThis.window = { localStorage: createMemoryLocalStorage(), setTimeout, clearTimeout };
    vi.resetModules();
    repo = await import("./storeConnectionRepository.js");
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("a brand-new store defaults to MODE_LIVE_READONLY, never MOCK or LIVE_AUTOMATED", () => {
    expect(repo.getAccessMode("new-store-1")).toBe(AccessMode.LIVE_READONLY);
  });

  it("initializeAccessModeForNewStore() is idempotent and always writes LIVE_READONLY", () => {
    expect(repo.initializeAccessModeForNewStore("store-a")).toBe(AccessMode.LIVE_READONLY);
    repo.setAccessMode("store-a", AccessMode.MOCK);
    repo.initializeAccessModeForNewStore("store-a");
    expect(repo.getAccessMode("store-a")).toBe(AccessMode.MOCK);
  });

  it("setAccessMode() refuses MODE_LIVE_AUTOMATED", () => {
    expect(() => repo.setAccessMode("store-b", AccessMode.LIVE_AUTOMATED)).toThrow(/LIVE_AUTOMATED/);
    expect(repo.getAccessMode("store-b")).toBe(AccessMode.LIVE_READONLY);
  });

  it("setAccessMode() refuses an unknown mode string", () => {
    expect(() => repo.setAccessMode("store-b", "MODE_NOT_REAL")).toThrow();
  });

  it("setAccessMode() persists a legitimate transition", () => {
    repo.setAccessMode("store-c", AccessMode.LIVE_APPROVAL);
    expect(repo.getAccessMode("store-c")).toBe(AccessMode.LIVE_APPROVAL);
  });

  it("getAdapterForStore() returns the mock adapter for MOCK/SANDBOX and the live adapter otherwise", async () => {
    const { mockAdapter } = await import("./mockAdapter.js");
    repo.setAccessMode("store-d", AccessMode.MOCK);
    expect(repo.getAdapterForStore("store-d")).toBe(mockAdapter);

    repo.setAccessMode("store-d", AccessMode.LIVE_APPROVAL);
    expect(repo.getAdapterForStore("store-d")).not.toBe(mockAdapter);
  });

  it("automation risk level defaults to L1 and flags L3/L4 as requiring extra confirmation", () => {
    expect(repo.getAutomationRiskLevel("store-e")).toBe("L1");
    expect(repo.setAutomationRiskLevel("store-e", "L2").requiresExtraConfirmation).toBe(false);
    expect(repo.setAutomationRiskLevel("store-e", "L3").requiresExtraConfirmation).toBe(true);
    expect(repo.setAutomationRiskLevel("store-e", "L4").requiresExtraConfirmation).toBe(true);
  });

  it("recordSyncJob()/listSyncJobs() persists newest-first and caps history length", () => {
    for (let i = 0; i < 25; i += 1) {
      repo.recordSyncJob("store-f", { jobId: `job-${i}`, startedAt: String(i) });
    }
    const jobs = repo.listSyncJobs("store-f");
    expect(jobs.length).toBeLessThanOrEqual(20);
    expect(jobs[0].jobId).toBe("job-24");
  });
});
