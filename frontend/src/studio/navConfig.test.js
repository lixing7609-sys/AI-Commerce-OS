import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV_KEY, NAV_GROUPS, NAV_ITEMS, getGroupKeyForNavItem, getStudioNavItemByKey,
  getVisibleNavItemsByGroup, isValidStudioNavKey,
} from "./navConfig.js";

describe("Studio NAV_ITEMS (阶段 Studio V3 Integration)", () => {
  it("has all 35 visible pages + 2 hidden detail pages, in order", () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      "secretary", "overview",
      "hotspotAnalysis", "trendForecast", "topicPool", "contentProjects",
      "shortDrama", "aiVideo", "graphicContent", "aiLive", "scriptStoryboard", "characterScene",
      "mediaGeneration", "aiEditing", "voiceSubtitleBgm", "contentReview",
      "matrixAccounts", "matrixPublish", "contentAssets", "trafficPool", "adResources", "adOrders",
      "monetizationCenter", "revenueShare", "brandDeals", "liveCommerce", "knowledgeProducts", "ipLicensing",
      "computeTasks", "dataAnalytics", "marketplace",
      "studioSettings", "platformConnections", "brandGuidelines", "notificationsPermissions",
      "director", "graphicContentEditor",
    ]);
  });

  it("includes AI图文 (graphicContent) as a first-class item in AI创作中心, alongside shortDrama/aiVideo/aiLive", () => {
    const creationGroupKeys = NAV_ITEMS.filter((i) => i.group === "creation" && !i.hidden).map((i) => i.key);
    expect(creationGroupKeys).toContain("graphicContent");
    expect(creationGroupKeys.indexOf("graphicContent")).toBeGreaterThan(creationGroupKeys.indexOf("aiVideo"));
    expect(creationGroupKeys.indexOf("graphicContent")).toBeLessThan(creationGroupKeys.indexOf("aiLive"));
  });

  it("every visible item has a non-empty Chinese label and icon", () => {
    for (const item of NAV_ITEMS.filter((i) => !i.hidden)) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it("every item belongs to a declared group", () => {
    const groupKeys = new Set(NAV_GROUPS.map((g) => g.key));
    for (const item of NAV_ITEMS) {
      expect(groupKeys.has(item.group)).toBe(true);
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

describe("NAV_GROUPS (阶段 Studio V3 Integration §六 六分组)", () => {
  it("has exactly the six required groups, in order, with only 总控 non-collapsible", () => {
    expect(NAV_GROUPS.map((g) => g.key)).toEqual(["control", "planning", "creation", "matrix", "commerce", "settings"]);
    expect(NAV_GROUPS.find((g) => g.key === "control").collapsible).toBe(false);
    for (const g of NAV_GROUPS.filter((g) => g.key !== "control")) {
      expect(g.collapsible).toBe(true);
    }
  });
});

describe("isValidStudioNavKey / getStudioNavItemByKey / getVisibleNavItemsByGroup / getGroupKeyForNavItem", () => {
  it("resolves a known key", () => {
    expect(isValidStudioNavKey("computeTasks")).toBe(true);
    expect(getStudioNavItemByKey("computeTasks")?.label).toBe("算力任务");
  });

  it("resolves hidden detail-page keys as valid (reachable via navigate, not shown in sidebar)", () => {
    expect(isValidStudioNavKey("director")).toBe(true);
    expect(isValidStudioNavKey("graphicContentEditor")).toBe(true);
  });

  it("safely returns false/null for an unknown key", () => {
    expect(isValidStudioNavKey("notAKey")).toBe(false);
    expect(getStudioNavItemByKey("notAKey")).toBeNull();
  });

  it("getVisibleNavItemsByGroup excludes hidden items", () => {
    const creationItems = getVisibleNavItemsByGroup("creation");
    expect(creationItems.every((i) => !i.hidden)).toBe(true);
    expect(creationItems.some((i) => i.key === "director")).toBe(false);
  });

  it("getGroupKeyForNavItem resolves the correct group", () => {
    expect(getGroupKeyForNavItem("graphicContent")).toBe("creation");
    expect(getGroupKeyForNavItem("monetizationCenter")).toBe("commerce");
  });
});
