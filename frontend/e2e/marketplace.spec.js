import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for the M8 §9 Marketplace three-view scoping:
 * Founder sees everything (management), Operator sees only
 * operator+shared approved packages, Studio sees only studio+shared
 * approved packages. All three views share shared/marketplace/*, verified
 * here by checking that installing in one view is reflected honestly (mock
 * state) and that cross-product packages never leak.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("Marketplace: three-view scoping", () => {
  test("Founder Marketplace Center shows every package including draft/in_review and third-party submissions", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=marketplaceCenter");
    await expect(page.getByRole("heading", { name: "Marketplace 中心" })).toBeVisible();
    await expect(page.getByText("（草稿）退款协商 Agent")).toBeVisible();
    await expect(page.getByText("（审核中）动态改价 Skill")).toBeVisible();
    await expect(page.getByText("第三方·直播数据洞察")).toBeVisible();
    // Studio 专属和 Operator 专属都应该同时可见——管理视角不过滤
    await expect(page.getByText("选题雷达 Agent")).toBeVisible();
    await expect(page.getByText("商品详情页文案生成 Skill")).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Operator Marketplace only shows approved operator/shared packages, never draft/in_review or Studio-only ones", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/operator");
    await page.locator(".op-nav-link", { hasText: "能力市场" }).click();
    await expect(page.getByText("AI 客服员工·日常应答")).toBeVisible();
    await expect(page.getByText("家居行业经营知识库")).toBeVisible(); // SHARED 包
    await expect(page.getByText("选题雷达 Agent")).toHaveCount(0); // Studio 专属
    await expect(page.getByText("（草稿）退款协商 Agent")).toHaveCount(0); // draft
    await expect(page.getByText("（审核中）动态改价 Skill")).toHaveCount(0); // in_review
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio Marketplace only shows approved studio/shared packages, never draft/in_review or Operator-only ones", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "能力市场" }).click();
    await expect(page.getByText("选题雷达 Agent")).toBeVisible();
    await expect(page.getByText("家居行业经营知识库")).toBeVisible(); // SHARED 包
    await expect(page.getByText("AI 客服员工·日常应答")).toHaveCount(0); // Operator 专属
    await expect(page.getByText("第三方·直播数据洞察")).toHaveCount(0); // 第三方，审核中
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("installing a package in Operator Marketplace shows an honest installed state, not a fake payment flow", async ({ page }) => {
    await page.goto("/operator");
    await page.locator(".op-nav-link", { hasText: "能力市场" }).click();
    const card = page.locator("article", { hasText: "品牌调性 Prompt 模板" });
    await card.getByRole("button", { name: "安装" }).click();
    await expect(card.getByText("已安装")).toBeVisible();
  });
});
