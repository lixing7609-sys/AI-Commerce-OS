import { describe, expect, it } from "vitest";
import {
  OPERATOR_NAV_ITEMS,
  containsForbiddenDevTerms,
  getNavItemByKey,
  isValidNavKey,
} from "./navigation";

describe("OPERATOR_NAV_ITEMS", () => {
  it("has the finalized 14-item customer-facing structure, in order", () => {
    expect(OPERATOR_NAV_ITEMS.map((item) => item.key)).toEqual([
      "dashboard",
      "secretary",
      "shops",
      "products",
      "content",
      "adOps",
      "orders",
      "customerService",
      "approvals",
      "growth",
      "costToken",
      "deviceUpdates",
      "dataPrivacy",
      "settings",
    ]);
  });

  it("advertising (adOps) is a real, ready destination, not a coming-soon skeleton", () => {
    expect(getNavItemByKey("adOps")?.status).toBe("ready");
    expect(getNavItemByKey("adOps")?.label).toBe("广告投放");
  });

  it("every item has a status of either ready or comingSoon", () => {
    for (const item of OPERATOR_NAV_ITEMS) {
      expect(["ready", "comingSoon"]).toContain(item.status);
    }
  });

  it("only exposes Chinese business labels, no developer jargon", () => {
    for (const item of OPERATOR_NAV_ITEMS) {
      expect(containsForbiddenDevTerms(item.label)).toBe(false);
    }
  });

  it("does not include legacy dev-centric nav items", () => {
    const labels = OPERATOR_NAV_ITEMS.map((item) => item.label);
    for (const legacyLabel of ["运营概览", "AI员工", "任务中心", "数据分析", "知识库"]) {
      expect(labels).not.toContain(legacyLabel);
    }
  });

  it("provides exactly five items for the mobile bottom navigation slice", () => {
    expect(OPERATOR_NAV_ITEMS.slice(0, 5)).toHaveLength(5);
  });
});

describe("getNavItemByKey / isValidNavKey", () => {
  it("resolves a known key", () => {
    expect(getNavItemByKey("dashboard")?.label).toBe("今日经营");
    expect(isValidNavKey("dashboard")).toBe(true);
  });

  it("safely returns null/false for unknown keys", () => {
    expect(getNavItemByKey("tasks")).toBeNull();
    expect(isValidNavKey("tasks")).toBe(false);
  });
});

describe("containsForbiddenDevTerms", () => {
  it("flags developer jargon", () => {
    expect(containsForbiddenDevTerms("RuntimeEngine 状态")).toBe(true);
    expect(containsForbiddenDevTerms("Task ID")).toBe(true);
    expect(containsForbiddenDevTerms("Agent role")).toBe(true);
  });

  it("does not flag ordinary business text", () => {
    expect(containsForbiddenDevTerms("今日经营")).toBe(false);
  });
});
