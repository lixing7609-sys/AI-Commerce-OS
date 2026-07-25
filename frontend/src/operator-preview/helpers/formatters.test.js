import { describe, expect, it } from "vitest";
import {
  DEMO_BADGE_LABEL,
  NOT_CONNECTED_LABEL,
  formatChangeVsYesterday,
  formatMetricValue,
  getBusinessTitle,
  getShopHealthLabel,
  isDevTaskIdLike,
  scopeLabelFor,
  shouldShowDemoBadge,
} from "./formatters";

describe("formatMetricValue", () => {
  it("shows 尚未接入 when not connected", () => {
    expect(formatMetricValue({ value: null, connected: false })).toEqual({
      text: NOT_CONNECTED_LABEL,
      badge: null,
    });
  });

  it("shows 尚未接入 when value is missing even if connected", () => {
    expect(formatMetricValue({ value: undefined, connected: true })).toEqual({
      text: NOT_CONNECTED_LABEL,
      badge: null,
    });
  });

  it("never fabricates a fake 0 for a disconnected metric", () => {
    const result = formatMetricValue({ value: null, connected: false });
    expect(result.text).not.toBe("0");
    expect(result.text).not.toBe("¥0");
  });

  it("marks demo values with the demo badge", () => {
    expect(formatMetricValue({ value: "¥12,680", isDemo: true, connected: true })).toEqual({
      text: "¥12,680",
      badge: DEMO_BADGE_LABEL,
    });
  });

  it("does not badge real connected values", () => {
    expect(formatMetricValue({ value: "186", isDemo: false, connected: true }).badge).toBeNull();
  });
});

describe("shouldShowDemoBadge", () => {
  it("is true when any item is demo data", () => {
    expect(shouldShowDemoBadge([{ is_demo: false }, { is_demo: true }])).toBe(true);
  });

  it("is false for an all-real list", () => {
    expect(shouldShowDemoBadge([{ is_demo: false }, { is_demo: false }])).toBe(false);
  });

  it("is false for empty/nullish input", () => {
    expect(shouldShowDemoBadge([])).toBe(false);
    expect(shouldShowDemoBadge(null)).toBe(false);
  });
});

describe("isDevTaskIdLike / getBusinessTitle", () => {
  it("recognizes TASK-XXXX as a developer identifier", () => {
    expect(isDevTaskIdLike("TASK-92913195A52A")).toBe(true);
    expect(isDevTaskIdLike("TASK-C9F94075DA53")).toBe(true);
  });

  it("does not treat a normal business title as a dev id", () => {
    expect(isDevTaskIdLike("LED灯带小样本测试方案")).toBe(false);
  });

  it("never returns a raw Task ID as the card title", () => {
    expect(getBusinessTitle({ title: "TASK-92913195A52A" }, "未命名工作")).toBe("未命名工作");
  });

  it("returns the business title when it is not dev-id-shaped", () => {
    expect(getBusinessTitle({ title: "LED灯带小样本测试方案" })).toBe("LED灯带小样本测试方案");
  });
});

describe("getShopHealthLabel", () => {
  it("maps every known health state", () => {
    expect(getShopHealthLabel("normal")).toBe("正常");
    expect(getShopHealthLabel("attention")).toBe("需要关注");
    expect(getShopHealthLabel("error")).toBe("异常");
    expect(getShopHealthLabel("not_connected")).toBe("尚未接入");
    expect(getShopHealthLabel("expiring")).toBe("授权即将到期");
  });

  it("never surfaces raw technical states like RuntimeEngine stopped", () => {
    const labels = ["normal", "attention", "error", "not_connected", "expiring"].map(getShopHealthLabel);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toContain("runtime");
    }
  });
});

describe("formatChangeVsYesterday", () => {
  it("formats a positive change with a leading sign", () => {
    expect(formatChangeVsYesterday(0.086)).toContain("+");
  });

  it("returns 尚未接入 for missing data", () => {
    expect(formatChangeVsYesterday(null)).toBe(NOT_CONNECTED_LABEL);
    expect(formatChangeVsYesterday(undefined)).toBe(NOT_CONNECTED_LABEL);
  });
});

describe("scopeLabelFor", () => {
  const shops = [{ id: "shop-1", name: "抖音小店A" }];

  it("resolves the all-shops scope", () => {
    expect(scopeLabelFor("all", shops)).toBe("全部店铺");
  });

  it("resolves the unassigned scope", () => {
    expect(scopeLabelFor("unassigned", shops)).toBe("未绑定店铺");
  });

  it("resolves a concrete shop id to its name", () => {
    expect(scopeLabelFor("shop-1", shops)).toBe("抖音小店A");
  });

  it("falls back to 全部店铺 for an unknown scope", () => {
    expect(scopeLabelFor("shop-unknown", shops)).toBe("全部店铺");
  });
});
