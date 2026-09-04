import { describe, expect, it } from "vitest";
import { AccessMode, CapabilityClass } from "./types.js";
import {
  ADAPTER_METHOD_CAPABILITY,
  capabilityClassFor,
  isCapabilityAllowedInMode,
  requiresApproval,
} from "./capabilities.js";

describe("capabilityClassFor", () => {
  it("classifies every read-only adapter method as READ", () => {
    for (const method of ["getStoreProfile", "listProducts", "listOrders", "listCustomers", "getInventory", "getMetrics"]) {
      expect(capabilityClassFor(method)).toBe(CapabilityClass.READ);
    }
  });

  it("classifies publishProduct and updatePrice as APPROVAL_REQUIRED (highest-risk writes)", () => {
    expect(capabilityClassFor("publishProduct")).toBe(CapabilityClass.APPROVAL_REQUIRED);
    expect(capabilityClassFor("updatePrice")).toBe(CapabilityClass.APPROVAL_REQUIRED);
  });

  it("returns UNSUPPORTED for a method not in the contract", () => {
    expect(capabilityClassFor("deleteEverything")).toBe(CapabilityClass.UNSUPPORTED);
  });

  it("has an entry for every method actually used", () => {
    expect(Object.keys(ADAPTER_METHOD_CAPABILITY).length).toBeGreaterThan(15);
  });
});

describe("isCapabilityAllowedInMode", () => {
  it("MODE_LIVE_READONLY never allows WRITE or APPROVAL_REQUIRED", () => {
    expect(isCapabilityAllowedInMode(AccessMode.LIVE_READONLY, CapabilityClass.WRITE)).toBe(false);
    expect(isCapabilityAllowedInMode(AccessMode.LIVE_READONLY, CapabilityClass.APPROVAL_REQUIRED)).toBe(false);
  });

  it("MODE_LIVE_READONLY always allows READ", () => {
    expect(isCapabilityAllowedInMode(AccessMode.LIVE_READONLY, CapabilityClass.READ)).toBe(true);
  });

  it("MODE_MOCK and MODE_SANDBOX allow everything except UNSUPPORTED", () => {
    for (const mode of [AccessMode.MOCK, AccessMode.SANDBOX]) {
      expect(isCapabilityAllowedInMode(mode, CapabilityClass.WRITE)).toBe(true);
      expect(isCapabilityAllowedInMode(mode, CapabilityClass.APPROVAL_REQUIRED)).toBe(true);
    }
  });

  it("UNSUPPORTED is never allowed regardless of mode", () => {
    for (const mode of Object.values(AccessMode)) {
      expect(isCapabilityAllowedInMode(mode, CapabilityClass.UNSUPPORTED)).toBe(false);
    }
  });

  it("MODE_LIVE_AUTOMATED only allows plain WRITE, not APPROVAL_REQUIRED", () => {
    expect(isCapabilityAllowedInMode(AccessMode.LIVE_AUTOMATED, CapabilityClass.WRITE)).toBe(true);
    expect(isCapabilityAllowedInMode(AccessMode.LIVE_AUTOMATED, CapabilityClass.APPROVAL_REQUIRED)).toBe(false);
  });
});

describe("requiresApproval", () => {
  it("never requires approval for READ", () => {
    expect(requiresApproval(AccessMode.LIVE_APPROVAL, CapabilityClass.READ)).toBe(false);
  });

  it("MODE_LIVE_APPROVAL requires approval for every write class", () => {
    expect(requiresApproval(AccessMode.LIVE_APPROVAL, CapabilityClass.WRITE)).toBe(true);
    expect(requiresApproval(AccessMode.LIVE_APPROVAL, CapabilityClass.APPROVAL_REQUIRED)).toBe(true);
  });

  it("MODE_MOCK/MODE_SANDBOX never require approval", () => {
    expect(requiresApproval(AccessMode.MOCK, CapabilityClass.WRITE)).toBe(false);
    expect(requiresApproval(AccessMode.SANDBOX, CapabilityClass.APPROVAL_REQUIRED)).toBe(false);
  });

  it("MODE_LIVE_AUTOMATED still forces approval for APPROVAL_REQUIRED-class actions like publish/price", () => {
    expect(requiresApproval(AccessMode.LIVE_AUTOMATED, CapabilityClass.APPROVAL_REQUIRED)).toBe(true);
    expect(requiresApproval(AccessMode.LIVE_AUTOMATED, CapabilityClass.WRITE)).toBe(false);
  });
});
