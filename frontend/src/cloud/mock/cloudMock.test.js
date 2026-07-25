import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SHARED_DEMO_DEVICE_ID,
  authorizeDiagnostic,
  getCloudOverviewMetrics,
  getDevicesForOperator,
  pauseOtaRelease,
  resolveSupportCase,
  retryOtaRelease,
} from "./cloudMock.js";

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

describe("cloud console mock", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds a mix of online/offline devices and surfaces aggregate overview metrics", () => {
    const metrics = getCloudOverviewMetrics();
    expect(metrics.is_demo).toBe(true);
    expect(metrics.totalOperators).toBeGreaterThan(0);
    expect(metrics.offlineDevices).toBeGreaterThan(0);
    expect(metrics.healthyDevices).toBeGreaterThan(0);
    expect(metrics.otaFailed).toBeGreaterThan(0);
    expect(metrics.rollbackCount).toBeGreaterThan(0);
    expect(metrics.openSupportCases).toBeGreaterThan(0);
  });

  it("does not leak one operator's devices into another operator's device list", () => {
    const operator1Devices = getDevicesForOperator("operator-1");
    const operator2Devices = getDevicesForOperator("operator-2");
    expect(operator1Devices.every((d) => d.operatorId === "operator-1")).toBe(true);
    expect(operator2Devices.some((d) => d.operatorId === "operator-1")).toBe(false);
    expect(operator1Devices.some((d) => d.id === SHARED_DEMO_DEVICE_ID)).toBe(true);
  });

  it("retryOtaRelease only applies to failed releases and pauseOtaRelease only to in-progress ones", () => {
    const badRetry = retryOtaRelease("ota-4.3.1");
    expect(badRetry.ok).toBe(false);

    const goodRetry = retryOtaRelease("ota-4.2.2-failed");
    expect(goodRetry.ok).toBe(true);

    const badPause = pauseOtaRelease("ota-4.3.1");
    expect(badPause.ok).toBe(false);

    const goodPause = pauseOtaRelease("ota-4.4.0-beta");
    expect(goodPause.ok).toBe(true);
  });

  it("authorizeDiagnostic requires a real device id", () => {
    const result = authorizeDiagnostic("not-a-real-device");
    expect(result.ok).toBe(false);
  });

  it("resolveSupportCase is idempotent", () => {
    const first = resolveSupportCase("support-1");
    expect(first.ok).toBe(true);

    const second = resolveSupportCase("support-1");
    expect(second.ok).toBe(false);
    expect(second.alreadyProcessed).toBe(true);
  });
});
