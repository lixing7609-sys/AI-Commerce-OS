import { describe, expect, it } from "vitest";

import { EDITIONS, POLICY_KEYS, getEditionPolicy, hasPolicy } from "./editionPolicy.js";

describe("editionPolicy", () => {
  it("Founder has full evolution control and private data access", () => {
    expect(hasPolicy(EDITIONS.FOUNDER, POLICY_KEYS.EVOLUTION_FULL_CONTROL)).toBe(true);
    expect(hasPolicy(EDITIONS.FOUNDER, POLICY_KEYS.EVOLUTION_ROLLBACK)).toBe(true);
    expect(hasPolicy(EDITIONS.FOUNDER, POLICY_KEYS.PRIVATE_BUSINESS_DATA_ACCESS)).toBe(true);
  });

  it("Operator cannot access Cloud administration or full evolution control", () => {
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.DEVICE_PLATFORM_MANAGE)).toBe(false);
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.TENANT_PLATFORM_MANAGE)).toBe(false);
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.OTA_RELEASE_MANAGE)).toBe(false);
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.EVOLUTION_FULL_CONTROL)).toBe(false);
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.EVOLUTION_ROLLBACK)).toBe(false);
  });

  it("Operator can approve only low-risk learning candidates", () => {
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.EVOLUTION_CANDIDATE_APPROVE_LOW_RISK)).toBe(true);
    expect(hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.EVOLUTION_CANDIDATE_APPROVE_ANY_RISK)).toBe(false);
  });

  it("Cloud cannot access private raw business memory or data by default", () => {
    expect(hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.PRIVATE_BUSINESS_DATA_ACCESS)).toBe(false);
    expect(hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.MEMORY_FULL_ACCESS)).toBe(false);
    expect(hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.PROMPT_UNRESTRICTED_EDIT)).toBe(false);
  });

  it("Cloud has device/tenant/license/OTA management the other two editions lack", () => {
    expect(hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.DEVICE_PLATFORM_MANAGE)).toBe(true);
    expect(hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.TENANT_PLATFORM_MANAGE)).toBe(true);
    expect(hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.OTA_RELEASE_MANAGE)).toBe(true);
    expect(hasPolicy(EDITIONS.FOUNDER, POLICY_KEYS.TENANT_PLATFORM_MANAGE)).toBe(false);
  });

  it("unknown edition falls back to the most restrictive (Operator) policy", () => {
    const policy = getEditionPolicy("not-a-real-edition");
    expect(policy[POLICY_KEYS.EVOLUTION_FULL_CONTROL]).toBeUndefined();
  });
});
