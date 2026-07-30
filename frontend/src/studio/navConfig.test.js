import { describe, expect, it } from "vitest";
import {
  DEFAULT_NAV_KEY, LEGACY_STUDIO_KEYS, NAV_GROUPS, NAV_ITEMS, getGroupKeyForNavItem, getStudioNavItemByKey,
  getVisibleNavItemsByGroup, isValidStudioNavKey,
} from "./navConfig.js";

describe("Studio NAV_ITEMS (Founder Master Edition Charter §3.4)", () => {
  it("has exactly the 13 frozen top-level items + 2 hidden detail pages, in order", () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      "workspace", "graphicContent", "aiVideo", "aiArticle", "aiLive", "shortDrama", "aiAudio",
      "matrixAccounts", "publishingCenter", "assetLibrary", "brandAssets", "analytics", "settings",
      "director", "graphicContentEditor",
    ]);
  });

  it("every visible item has a non-empty label and icon", () => {
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

  it("defaults to the workspace page", () => {
    expect(DEFAULT_NAV_KEY).toBe("workspace");
  });

  it("does not use the bare technical term Connector in any nav label", () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).not.toMatch(/Connector/i);
    }
  });
});

describe("NAV_GROUPS (Founder Master Edition Charter §3.4 — flat, no sub-clusters)", () => {
  it("has exactly one flat, non-collapsible group", () => {
    expect(NAV_GROUPS.map((g) => g.key)).toEqual(["studio"]);
    expect(NAV_GROUPS[0].collapsible).toBe(false);
  });
});

describe("isValidStudioNavKey / getStudioNavItemByKey / getVisibleNavItemsByGroup / getGroupKeyForNavItem", () => {
  it("resolves a known top-level key", () => {
    expect(isValidStudioNavKey("analytics")).toBe(true);
    expect(getStudioNavItemByKey("analytics")?.label).toBe("内容数据");
  });

  it("resolves hidden detail-page keys as valid (reachable via navigate, not shown in sidebar)", () => {
    expect(isValidStudioNavKey("director")).toBe(true);
    expect(isValidStudioNavKey("graphicContentEditor")).toBe(true);
  });

  it("resolves every retired/absorbed old key as valid (old deep links must not silently fall back to the default page)", () => {
    expect(LEGACY_STUDIO_KEYS.length).toBeGreaterThan(0);
    for (const legacyKey of LEGACY_STUDIO_KEYS) {
      expect(isValidStudioNavKey(legacyKey)).toBe(true);
      // Retired keys are absorbed into a composite page — they must not
      // also still be top-level NAV_ITEMS (that would mean the charter's
      // 13-item collapse didn't actually happen for this key).
      expect(NAV_ITEMS.some((item) => item.key === legacyKey)).toBe(false);
    }
  });

  it("safely returns false/null for an unknown key", () => {
    expect(isValidStudioNavKey("notAKey")).toBe(false);
    expect(getStudioNavItemByKey("notAKey")).toBeNull();
  });

  it("getVisibleNavItemsByGroup excludes hidden items", () => {
    const studioItems = getVisibleNavItemsByGroup("studio");
    expect(studioItems.every((i) => !i.hidden)).toBe(true);
    expect(studioItems.some((i) => i.key === "director")).toBe(false);
    expect(studioItems).toHaveLength(13);
  });

  it("getGroupKeyForNavItem resolves the correct group", () => {
    expect(getGroupKeyForNavItem("graphicContent")).toBe("studio");
    expect(getGroupKeyForNavItem("analytics")).toBe("studio");
  });
});
