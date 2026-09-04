import { describe, expect, it } from "vitest";

import { PAGE_COMPONENTS } from "./pageRegistry.jsx";
import { OPERATOR_NAV_ITEMS } from "./helpers/navigation.js";
import { EDITIONS, POLICY_KEYS, hasPolicy } from "../shared/editionPolicy.js";

const FOUNDER_ONLY_TERMS = [
  "Prompt 资产库", "Skill 资产库", "Knowledge 资产库", "Agent 工作室",
  "模型路由", "基准测试", "评估中心", "自动化策略", "回放中心",
];

const CLOUD_ONLY_TERMS = [
  "经营者", "租户", "设备群", "许可与套餐", "OTA 与支持", "Token 计量",
];

describe("Operator page registry", () => {
  it("every registered nav item has a defined page component", () => {
    for (const item of OPERATOR_NAV_ITEMS) {
      expect(PAGE_COMPONENTS[item.key], `nav item "${item.key}" has no component`).toBeTypeOf("function");
    }
  });

  it("has no duplicate nav keys", () => {
    const keys = OPERATOR_NAV_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not register a page for a key that isn't in OPERATOR_NAV_ITEMS", () => {
    const validKeys = new Set(OPERATOR_NAV_ITEMS.map((i) => i.key));
    for (const key of Object.keys(PAGE_COMPONENTS)) {
      expect(validKeys.has(key), `pageRegistry has an orphaned key "${key}" not in navigation.js`).toBe(true);
    }
  });

  it("does not expose Founder-only capability labels in its own nav", () => {
    const labels = OPERATOR_NAV_ITEMS.map((i) => i.label);
    for (const term of FOUNDER_ONLY_TERMS) {
      expect(labels).not.toContain(term);
    }
  });

  it("does not expose Cloud-only platform-management labels in its own nav", () => {
    const labels = OPERATOR_NAV_ITEMS.map((i) => i.label);
    for (const term of CLOUD_ONLY_TERMS) {
      expect(labels).not.toContain(term);
    }
  });

  it("Operator policy never grants Founder-only or Cloud-only capability keys", () => {
    [
      POLICY_KEYS.EVOLUTION_FULL_CONTROL,
      POLICY_KEYS.PROMPT_UNRESTRICTED_EDIT,
      POLICY_KEYS.SKILL_UNRESTRICTED_EDIT,
      POLICY_KEYS.DEVICE_PLATFORM_MANAGE,
      POLICY_KEYS.TENANT_PLATFORM_MANAGE,
      POLICY_KEYS.OTA_RELEASE_MANAGE,
    ].forEach((key) => {
      expect(hasPolicy(EDITIONS.OPERATOR, key)).toBe(false);
    });
  });
});
