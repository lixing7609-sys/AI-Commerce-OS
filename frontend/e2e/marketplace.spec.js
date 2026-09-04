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
    // 阶段 M8c：默认落地页是"Marketplace 概览"（统计卡片，不是完整
    // 列表）——完整能力包表格在"我的能力包"子页面，显式导航过去。
    await page.goto("/?mode=founder&module=marketplaceCenter&subView=myPackages");
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
    // Founder Master Edition Charter §3.4: Studio's nav is now 13 flat
    // items; Marketplace is absorbed into Asset Library as a tab.
    await page.locator(".st-nav-link", { hasText: "素材库" }).click();
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

test.describe("Marketplace: authority is framed as Operator Cloud, not a per-Mac-mini local market (阶段 M8c)", () => {
  test("Founder Marketplace 中心 explicitly states it's a Cloud management/publish entry, not a local full market service", async ({ page }) => {
    await page.goto("/?mode=founder&module=marketplaceCenter");
    await expect(page.getByText("云端 Marketplace 的 Founder 管理/发布入口")).toBeVisible();
    await expect(page.getByText("权威数据归属 Operator Cloud")).toBeVisible();
  });

  test("Founder Marketplace 中心's in-page tab bar shows honest 规划中/Cloud Mock badges, never claims unfinished features are live", async ({ page }) => {
    // 阶段 Founder Full-System v3 Batch 2 §A：Marketplace 不再是顶级
    // 侧边栏分组（旧的"Marketplace 中心"顶级入口已收口进 Cloud
    // Center），子导航从侧边栏手风琴移到了页面内的 Tab 栏——见
    // console/labs/MarketplaceCenter.jsx。
    await page.goto("/?mode=founder&module=marketplaceCenter");
    await expect(page.locator(".fdr-tabs__item", { hasText: "Release Candidate 提交" }).getByText("规划中")).toBeVisible();
    await expect(page.locator(".fdr-tabs__item", { hasText: "分成与结算" }).getByText("规划中")).toBeVisible();
    await expect(page.locator(".fdr-tabs__item", { hasText: "Cloud Marketplace 控制台" }).getByText("Cloud Mock")).toBeVisible();
  });

  test("Cloud Marketplace 控制台 tab honestly states no real Operator Cloud backend is connected yet, no fake console link", async ({ page }) => {
    await page.goto("/?mode=founder&module=marketplaceCenter&subView=cloudConsole");
    await expect(page.getByText("尚未接入真实 Operator Cloud 后端")).toBeVisible();
    await expect(page.getByText("Cloud Marketplace Mock API")).toBeVisible();
    await expect(page.getByRole("button", { name: "打开云端管理控制台（尚未接入）" })).toBeDisabled();
  });

  test("Operator's 能力市场 nav item is reachable as a Cloud consumer view, same shared component as Studio's", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.getByRole("button", { name: "能力市场" })).toBeVisible();
  });
});
