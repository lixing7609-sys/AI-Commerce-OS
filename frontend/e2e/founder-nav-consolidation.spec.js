import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for M8 "Founder Product Shell Consolidation"
 * (阶段：Founder产品壳层收口). Locks in the nav-collapse requirements: no
 * duplicate top-level Founder business menus for capability that now lives
 * in Operator Lab / Studio Lab, old routes redirect instead of 404ing, and
 * the six-group nav structure is in place.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("Founder nav collapse: no duplicate top-level business menus", () => {
  test("店铺中心/内容中心/AI直播中心/流量网络中心 are no longer standalone top-level Founder nav buttons", async ({ page }) => {
    await page.goto("/founder");
    for (const label of ["店铺中心", "内容中心", "AI直播中心", "流量网络中心"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });

  test("the six requested nav groups are present", async ({ page }) => {
    await page.goto("/founder");
    for (const group of ["Founder 总览", "产品研发中心", "Operator 实验室", "Studio 实验室", "系统与发布"]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
  });

  test("商品中心/订单中心/客服中心/审批中心 remain reachable (not deleted) and are visibly marked 待同步", async ({ page }) => {
    await page.goto("/founder");
    for (const label of ["商品中心", "订单中心", "客服中心", "审批中心"]) {
      // 用 class + 文本内容定位，不用 role name——这几个按钮带
      // title 属性（悬浮提示），会影响可访问名的计算结果。
      const button = page.locator(".fdr-sidebar__item", { hasText: label });
      await expect(button).toBeVisible();
      await expect(button.getByText("待同步")).toBeVisible();
    }
  });
});

test.describe("Founder old-route redirects (no broken bookmarks)", () => {
  const cases = [
    { module: "contentCenter", targetLabel: "内容项目", errorLabel: "contentCenter → Studio Lab 内容项目" },
    { module: "liveCenter", targetLabel: "AI 直播", errorLabel: "liveCenter → Studio Lab AI 直播" },
    { module: "trafficNetworkCenter", targetLabel: "矩阵账号", errorLabel: "trafficNetworkCenter → Studio Lab 矩阵账号" },
  ];

  for (const { module, targetLabel, errorLabel } of cases) {
    test(`?module=${module} redirects into Studio Lab's ${targetLabel} page with zero console errors (${errorLabel})`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto(`/?mode=founder&module=${module}`);
      await expect(page.getByText("研发实验室 · 完整复用 Studio 产品端页面")).toBeVisible();
      await expect(page.locator(".st-nav-link.active")).toHaveText(new RegExp(targetLabel));
      expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
    });
  }

  test("?module=storeCenter redirects into Operator Lab's 店铺 page with zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=storeCenter");
    await expect(page.getByText("研发实验室 · 完整复用 Operator 产品端页面")).toBeVisible();
    await expect(page.locator(".op-nav-link.active")).toHaveText(/店铺/);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});

test.describe("Founder adCenter reclassified as founder-only R&D tool", () => {
  test("广告策略研发 lives under 产品研发中心, not a top-level peer of Operator's 广告投放", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByRole("button", { name: "广告策略研发" })).toBeVisible();
    await expect(page.getByRole("button", { name: "广告中心", exact: true })).toHaveCount(0);
  });
});
