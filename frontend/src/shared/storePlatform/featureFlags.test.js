import { describe, expect, it } from "vitest";
import { AccessMode } from "./types.js";
import { FEATURE_FLAGS, assertLiveAutomatedAllowed, isLiveAutomatedAllowed } from "./featureFlags.js";

describe("storePlatform feature flags", () => {
  it("liveAutomatedEnabled defaults to false", () => {
    expect(FEATURE_FLAGS.storePlatform.liveAutomatedEnabled).toBe(false);
    expect(isLiveAutomatedAllowed()).toBe(false);
  });

  it("defaultAccessModeForNewStore is MODE_LIVE_READONLY", () => {
    expect(FEATURE_FLAGS.storePlatform.defaultAccessModeForNewStore).toBe(AccessMode.LIVE_READONLY);
  });

  it("defaultAutomationRiskLevel is L1, never L3/L4", () => {
    expect(FEATURE_FLAGS.storePlatform.defaultAutomationRiskLevel).toBe("L1");
  });

  it("assertLiveAutomatedAllowed throws for MODE_LIVE_AUTOMATED", () => {
    expect(() => assertLiveAutomatedAllowed(AccessMode.LIVE_AUTOMATED)).toThrow(/liveAutomatedEnabled/);
  });

  it("assertLiveAutomatedAllowed does not throw for any other mode", () => {
    for (const mode of [AccessMode.MOCK, AccessMode.SANDBOX, AccessMode.LIVE_READONLY, AccessMode.LIVE_APPROVAL]) {
      expect(() => assertLiveAutomatedAllowed(mode)).not.toThrow();
    }
  });

  it("FEATURE_FLAGS is frozen (cannot be silently mutated at runtime)", () => {
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true);
  });
});
