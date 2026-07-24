import { describe, expect, it } from "vitest";

import { sanitizeTaskDetail } from "./taskDetailHelpers";

describe("sanitizeTaskDetail shop fields (阶段 8E)", () => {
  it("returns shopName null for unbound tasks", () => {
    const detail = sanitizeTaskDetail({
      id: "TASK-1",
      status: "completed",
      shop_id: null,
      shop_name: null,
    });

    expect(detail.shopId).toBeNull();
    expect(detail.shopName).toBeNull();
  });

  it("carries through shop_id and shop_name when bound", () => {
    const detail = sanitizeTaskDetail({
      id: "TASK-2",
      status: "completed",
      shop_id: 5,
      shop_name: "阶段8E验证店铺",
    });

    expect(detail.shopId).toBe(5);
    expect(detail.shopName).toBe("阶段8E验证店铺");
  });

  it("still masks sensitive keys in result even with shop fields present", () => {
    const detail = sanitizeTaskDetail({
      id: "TASK-3",
      status: "completed",
      shop_id: 1,
      shop_name: "测试店铺",
      result: { api_key: "sk-should-not-appear", ok: true },
    });

    expect(detail.resultText).not.toContain("sk-should-not-appear");
    expect(detail.resultText).toContain("***");
  });
});
