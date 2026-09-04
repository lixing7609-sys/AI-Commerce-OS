import { describe, expect, it } from "vitest";
import { buildShopSalesSegments, computeDonutSegments, groupCountsByKey } from "./chartData";

describe("computeDonutSegments", () => {
  it("splits segments into contiguous percentage ranges that sum to 100", () => {
    const parts = computeDonutSegments([
      { name: "A", value: 60 },
      { name: "B", value: 40 },
    ]);
    expect(parts[0].start).toBe(0);
    expect(parts[0].end).toBeCloseTo(60);
    expect(parts[1].start).toBeCloseTo(60);
    expect(parts[1].end).toBeCloseTo(100);
    expect(parts[0].pct).toBeCloseTo(60);
  });

  it("assigns a fallback color from the palette when none is given", () => {
    const parts = computeDonutSegments([{ name: "A", value: 1 }]);
    expect(parts[0].color).toBeTruthy();
  });

  it("does not divide by zero when every value is zero", () => {
    const parts = computeDonutSegments([
      { name: "A", value: 0 },
      { name: "B", value: 0 },
    ]);
    expect(parts.every((part) => part.pct === 0)).toBe(true);
  });
});

describe("groupCountsByKey", () => {
  it("counts items by key and sorts descending", () => {
    const rows = groupCountsByKey(
      [{ type: "a" }, { type: "b" }, { type: "a" }, { type: "a" }],
      (item) => item.type
    );
    expect(rows).toEqual([
      { label: "a", value: 3 },
      { label: "b", value: 1 },
    ]);
  });
});

describe("buildShopSalesSegments", () => {
  it("maps shops to name/value pairs, defaulting missing sales to zero", () => {
    const segments = buildShopSalesSegments([
      { name: "Shop A", todaySales: 100 },
      { shop_name: "Shop B" },
    ]);
    expect(segments).toEqual([
      { name: "Shop A", value: 100 },
      { name: "Shop B", value: 0 },
    ]);
  });
});
