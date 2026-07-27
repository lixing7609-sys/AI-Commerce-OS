import { describe, expect, it } from "vitest";
import { DEFAULT_NAV_KEY, NAV_ITEMS, getStudioNavItemByKey, isValidStudioNavKey } from "./navConfig.js";

describe("Studio NAV_ITEMS", () => {
  it("has all 13 required core pages, in order", () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      "overview",
      "contentProjects",
      "shortDrama",
      "aiVideo",
      "aiLive",
      "matrixAccounts",
      "contentAssets",
      "trafficPool",
      "adResources",
      "adOrders",
      "computeTasks",
      "dataAnalytics",
      "settings",
    ]);
  });

  it("every item has a non-empty Chinese label and icon", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it("defaults to the overview page", () => {
    expect(DEFAULT_NAV_KEY).toBe("overview");
  });

  it("does not use the bare technical term Connector in any nav label", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).not.toMatch(/Connector/i);
    }
  });
});

describe("isValidStudioNavKey / getStudioNavItemByKey", () => {
  it("resolves a known key", () => {
    expect(isValidStudioNavKey("computeTasks")).toBe(true);
    expect(getStudioNavItemByKey("computeTasks")?.label).toBe("算力任务");
  });

  it("safely returns false/null for an unknown key", () => {
    expect(isValidStudioNavKey("notAKey")).toBe(false);
    expect(getStudioNavItemByKey("notAKey")).toBeNull();
  });
});
