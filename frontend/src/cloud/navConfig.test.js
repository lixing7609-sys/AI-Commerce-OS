import { describe, expect, it } from "vitest";

import { NAV_ITEMS, isValidCloudNavKey } from "./navConfig.js";

const OPERATOR_ONLY_TERMS = ["店铺", "AI 秘书", "AI成长", "数据与隐私"];
const FOUNDER_ONLY_TERMS = ["Agent 工作室", "Prompt 资产库", "自动化策略", "基准测试"];

describe("Cloud navigation registry", () => {
  it("has no duplicate nav keys", () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not display private store-operation labels (Cloud manages devices/tenants, not shops)", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    for (const term of OPERATOR_ONLY_TERMS) {
      expect(labels).not.toContain(term);
    }
  });

  it("does not display Founder-only capability labels", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    for (const term of FOUNDER_ONLY_TERMS) {
      expect(labels).not.toContain(term);
    }
  });

  it("isValidCloudNavKey resolves known keys and safely rejects unknown ones", () => {
    expect(isValidCloudNavKey("overview")).toBe(true);
    expect(isValidCloudNavKey("doesNotExist123")).toBe(false);
  });
});
