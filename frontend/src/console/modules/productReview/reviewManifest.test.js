import { describe, expect, it } from "vitest";
import { REVIEW_GROUPS, REVIEW_PAGES, getReviewSummary } from "./reviewManifest.js";

describe("产品审查清单（Founder Master Edition V1.0 中文框架审查版）", () => {
  it("恰好 5 个顶层分组", () => {
    expect(REVIEW_GROUPS).toHaveLength(5);
  });

  it("恰好 51 个可见页面", () => {
    expect(REVIEW_PAGES).toHaveLength(51);
  });

  it("每个分组的页面数量和 Charter 冻结的数量一致（8/7/13/13/10）", () => {
    const expected = { founderWorkspaceGroup: 8, aiCapabilityCenterGroup: 7, operatorLabGroup: 13, studioLabGroup: 13, cloudCenterGroup: 10 };
    for (const [group, count] of Object.entries(expected)) {
      expect(REVIEW_PAGES.filter((p) => p.group === group)).toHaveLength(count);
    }
  });

  it("每个页面都有中文名称、职责说明、功能区域、实现文件", () => {
    for (const page of REVIEW_PAGES) {
      expect(page.label.length).toBeGreaterThan(0);
      expect(page.responsibility.length).toBeGreaterThan(0);
      expect(page.sections.length).toBeGreaterThan(0);
      expect(page.file.length).toBeGreaterThan(0);
      expect(["demo", "partial", "live"]).toContain(page.backend);
    }
  });

  it("getReviewSummary 的分组小计加总等于 51", () => {
    const summary = getReviewSummary();
    const total = summary.byGroup.reduce((sum, g) => sum + g.actual, 0);
    expect(total).toBe(51);
    expect(summary.total).toBe(51);
  });
});
