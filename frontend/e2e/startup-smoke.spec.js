import { test, expect } from "@playwright/test";

/**
 * Startup-critical smoke test (阶段：release-blocking repair). Verifies
 * the exact failure this task was created to fix — that all three
 * edition URLs survive a genuinely fresh page load with real content,
 * real branding, and zero uncaught console errors — plus that the new
 * Operator advertising destination exists and renders. This is not a
 * general UI regression suite; keep additions here narrow and focused
 * on "does the app actually start and show the right thing."
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("startup smoke — all three editions", () => {
  // 阶段 Founder Full-System v3 Batch 2：Founder 是主产品，裸 URL
  // （不带任何参数）默认打开 Founder，不再是 Operator Cloud——见
  // editions/editionConfig.js。Operator Cloud 的稳定入口是 `/cloud`
  // 路径别名。
  test("bare root (default, no query params) loads Founder with real content, branding, and zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator(".fdr-sidebar__edition")).toHaveText("Founder");
    await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Cloud (/cloud) loads with real content, branding, and zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/cloud");
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByText("AI Commerce Operator Cloud")).toBeVisible();
    await expect(page.getByText("隐私边界", { exact: false }).first()).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Operator (?mode=operator-preview) loads with AI Commerce OS OPERATOR branding and zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=operator-preview");
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByText("AI Commerce")).toBeVisible();
    await expect(page.getByText("OPERATOR", { exact: true })).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Founder (?mode=founder&module=secretary) loads with real content and zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=secretary");
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.getByText("AI 秘书说点什么")).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("a hard reload of each edition URL still works (the exact failure this task fixes)", async ({ page }) => {
    for (const url of ["/", "/?mode=operator-preview", "/?mode=founder&module=secretary"]) {
      await page.goto(url);
      await page.reload();
      await expect(page.locator("main")).not.toBeEmpty();
    }
  });
});

test.describe("Operator advertising (广告投放)", () => {
  test("the advertising nav destination exists and resolves to real content", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=operator-preview");
    await page.getByRole("button", { name: /广告投放/ }).click();
    await expect(page.getByRole("heading", { name: "广告投放" })).toBeVisible();
    // Overview
    await expect(page.getByText("今日广告花费")).toBeVisible();
    await expect(page.getByText("贡献利润").first()).toBeVisible();
    // Account selector
    await expect(page.getByText("店铺与广告账户")).toBeVisible();
    // AI recommendations + approval workflow
    await expect(page.getByText("AI 投放建议与审批")).toBeVisible();
    await expect(page.getByText(/审批|批准|已批准|投放中/).first()).toBeVisible();
    // Wallet
    await expect(page.getByText("广告钱包").first()).toBeVisible();
    await expect(page.getByText("平台媒介预算分配")).toBeVisible();
    // Contribution-profit attribution principle
    await expect(page.getByText("广告优化目标是提升贡献利润")).toBeVisible();
    // Mock data must be visibly labeled
    await expect(page.getByText("原型数据").first()).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("does not expose Founder-only or Cloud-only controls on the Operator advertising page", async ({ page }) => {
    await page.goto("/?mode=operator-preview");
    await page.getByRole("button", { name: /广告投放/ }).click();
    await expect(page.getByText("Prompt 资产库")).toHaveCount(0);
    await expect(page.getByText("模型路由")).toHaveCount(0);
    await expect(page.getByText("跨租户")).toHaveCount(0);
    await expect(page.getByText("平台级 OTA")).toHaveCount(0);
  });
});
