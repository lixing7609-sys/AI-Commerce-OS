import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SHARED_DEMO_DEVICE_ID,
  approveUpdateWindow,
  authorizeDiagnostics,
  getDeviceSummary,
  getPrivacySummary,
  revokeDiagnostics,
  setBusinessDataUpload,
} from "./deviceMock.js";

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

describe("operator device + privacy mock", () => {
  beforeEach(() => {
    vi.stubGlobal("window", createFakeWindow());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds a device with the shared demo id and a pending update", () => {
    const device = getDeviceSummary();
    expect(device.id).toBe(SHARED_DEMO_DEVICE_ID);
    expect(device.is_demo).toBe(true);
    expect(device.availableUpdate.status).toBe("ready_to_install");
  });

  it("seeds a privacy state that defaults to local-first with diagnostics unauthorized", () => {
    const privacy = getPrivacySummary();
    expect(privacy.localFirst).toBe(true);
    expect(privacy.diagnosticAuthorized).toBe(false);
    expect(privacy.businessDataUploadEnabled).toBe(false);
  });

  it("approveUpdateWindow schedules the pending update and cannot be repeated", () => {
    const first = approveUpdateWindow();
    expect(first.ok).toBe(true);
    expect(getDeviceSummary().availableUpdate.status).toBe("scheduled");

    const second = approveUpdateWindow();
    expect(second.ok).toBe(false);
  });

  it("authorizeDiagnostics / revokeDiagnostics toggle and are idempotent", () => {
    const authorize = authorizeDiagnostics(24);
    expect(authorize.ok).toBe(true);
    expect(getPrivacySummary().diagnosticAuthorized).toBe(true);

    const repeatAuthorize = authorizeDiagnostics(24);
    expect(repeatAuthorize.ok).toBe(false);
    expect(repeatAuthorize.alreadyProcessed).toBe(true);

    const revoke = revokeDiagnostics();
    expect(revoke.ok).toBe(true);
    expect(getPrivacySummary().diagnosticAuthorized).toBe(false);

    const repeatRevoke = revokeDiagnostics();
    expect(repeatRevoke.ok).toBe(false);
  });

  it("setBusinessDataUpload toggles the private-data upload consent flag", () => {
    setBusinessDataUpload(true);
    expect(getPrivacySummary().businessDataUploadEnabled).toBe(true);
    setBusinessDataUpload(false);
    expect(getPrivacySummary().businessDataUploadEnabled).toBe(false);
  });
});
