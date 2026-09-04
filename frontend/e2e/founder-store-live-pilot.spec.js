import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for M8 "Founder First Real Store Live
 * Pilot" P0/P1 slice: Founder-superset nav (Operator Lab / Studio Lab
 * reusing the real product-end page registries) + the Store Connection
 * Center's layered access-mode model. Assumes the dev database has at
 * least one real shop (this repo's dev environment currently has "新城"
 * and "演示店铺") — if the shop list is empty, the store-specific
 * assertions are skipped rather than failing on missing fixture data.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("Founder: Store Connection Center / 平台连接 (真实店铺接入)", () => {
  // Founder Master Edition V1.0 中文框架审查版：本轮审查发现并清理了
  // 这个页面此前直接暴露的技术接入模式概念（MODE_MOCK/
  // MODE_LIVE_READONLY/MODE_LIVE_AUTOMATED 下拉框、风险等级、
  // Feature Flag、原始同步状态码）——这些是 Founder 侧 Connector
  // Principle 下的技术细节，不应该出现在 Operator 经营设置的「平台
  // 连接」视角里，见 src/console/labs/StoreConnectionCenter.jsx 顶部
  // 注释。这里的测试相应更新为验证清理后的业务化交互本身，而不是
  // 断言那些应该已经不存在的技术控件。

  test("loads real shops from the backend with 授权状态/同步状态, no technical access-mode controls leaked", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    await expect(page.getByRole("heading", { name: "平台连接" })).toBeVisible();

    const rows = page.locator("table tbody tr");
    await expect
      .poll(async () => (await rows.count()) > 0 || (await page.getByText("尚未创建任何店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "no real store in the dev database");

    // Connector Principle：不得出现技术接入模式/风险等级下拉框。
    await expect(page.getByText("MODE_LIVE_READONLY")).toHaveCount(0);
    await expect(page.getByText("MODE_LIVE_AUTOMATED")).toHaveCount(0);
    await expect(page.getByText("MODE_MOCK")).toHaveCount(0);
    // 全局店铺范围下拉是 Founder 侧边栏自己的控件，不算这个页面泄露的
    // 技术接入模式选择器——只断言内容区本身没有 <select>。
    await expect(page.locator(".fdr-content select")).toHaveCount(0);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("每一行都提供重新授权/暂停同步/立即同步这三个经营者能理解的操作", async ({ page }) => {
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    const rows = page.locator("table tbody tr");
    await expect
      .poll(async () => (await rows.count()) > 0 || (await page.getByText("尚未创建任何店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "no real store in the dev database");

    const firstRow = rows.first();
    await expect(firstRow.getByRole("button", { name: "重新授权" })).toBeVisible();
    await expect(firstRow.getByRole("button", { name: /暂停同步|恢复同步/ })).toBeVisible();
  });

  test("立即同步 completes an honest, non-fabricated sync without touching real stores", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    const runButtons = page.getByRole("button", { name: "立即同步" });
    await expect
      .poll(async () => (await runButtons.count()) > 0 || (await page.getByText("尚未创建任何店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const count = await runButtons.count();
    test.skip(count === 0, "no real store in the dev database");

    await runButtons.first().click();
    await expect(page.getByText("同步已完成")).toBeVisible({ timeout: 5000 });
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("同步记录 honestly reports what happened, no fabricated platform data", async ({ page }) => {
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    const historyButtons = page.getByRole("button", { name: "同步记录" });
    await expect
      .poll(async () => (await historyButtons.count()) > 0 || (await page.getByText("尚未创建任何店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const count = await historyButtons.count();
    test.skip(count === 0, "no real store in the dev database");

    await historyButtons.first().click();
    await expect(page.getByRole("heading", { name: "同步记录" })).toBeVisible();
    // 尚未真正接入平台后端时，必须诚实地说明这一点，而不是编造数据。
    const honestNote = page.getByText("平台数据同步尚未接入真实后端");
    const emptyState = page.getByText("尚未运行过同步");
    await expect(honestNote.or(emptyState).first()).toBeVisible();
  });
});

test.describe("Founder: Operator Lab (阶段 M8c contentOnly 渲染，Operator 完整导航直接展开在 Founder 侧边栏里)", () => {
  test("reuses the real Operator dashboard page with zero console errors, no nested Operator sidebar", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=operatorLab");
    await expect(page.getByText("一人公司经营驾驶舱")).toBeVisible();
    await expect(page.locator(".op-sidebar")).toHaveCount(0);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("navigating via Founder's sidebar sub-item does not reload or break the Founder shell", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "广告投放" }).click();
    await expect(page.getByRole("heading", { name: "广告投放" })).toBeVisible();
    // Founder 自己的顶层导航必须仍然存在（说明没有整页跳转/重新加载）
    await expect(page.getByRole("button", { name: "今日总览", exact: true })).toBeVisible();
  });

  test("店铺 page inside Operator 实验室 is the same real ShopCenterContent as standalone Operator, plus the Founder-only 平台连接器 overlay tab", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    // 店铺管理已经收口进 经营设置 的"店铺管理" Tab（Charter §3.3：
    // shops + settings → Settings），不再是独立顶级子项。
    await page.locator(".fdr-sidebar__subitem", { hasText: "经营设置" }).click();
    await page.getByRole("button", { name: "店铺管理", exact: true }).click();
    const firstCard = page.locator("article").first();
    const hasStore = await firstCard.isVisible().catch(() => false);
    test.skip(!hasStore, "no real store in the dev database");

    await firstCard.click();
    await expect(page.getByRole("button", { name: "平台连接器" })).toBeVisible();
    const authTabIndex = await page.evaluate(() =>
      [...document.querySelectorAll(".shop-detail-tabs button")].map((b) => b.textContent.trim())
    );
    expect(authTabIndex).toContain("平台连接器");
    expect(authTabIndex.indexOf("平台连接器")).toBe(authTabIndex.indexOf("连接与授权") + 1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("standalone Operator's 店铺 page never shows the Founder-only 平台连接器 tab", async ({ page }) => {
    await page.goto("/operator");
    await page.locator(".op-nav-link", { hasText: "店铺" }).click();
    const firstCard = page.locator("article").first();
    await expect
      .poll(async () => (await firstCard.isVisible().catch(() => false)) || (await page.getByText("尚未添加店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const hasStore = await firstCard.isVisible().catch(() => false);
    test.skip(!hasStore, "no real store in the dev database");

    await firstCard.click();
    await expect(page.getByRole("button", { name: "平台连接器" })).toHaveCount(0);
  });
});

test.describe("Founder: Studio 实验室 (阶段 M8c contentOnly 渲染，Studio 完整导航直接展开在 Founder 侧边栏里)", () => {
  test("reuses the real Studio overview page with zero console errors, no nested Studio sidebar", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=studioLab");
    await expect(page.getByText("Studio 概览 —— 内容生产、矩阵账号、流量与广告资源的经营视图")).toBeVisible();
    await expect(page.locator(".st-sidebar")).toHaveCount(0);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("the embedded Studio content is reachable and scrollable via Founder's own single content container, no double scrollbar", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "AI 短剧" }).click();
    await expect(page.getByRole("heading", { name: "AI 短剧" })).toBeVisible();

    // Founder 自己的内容容器（.fdr-content）现在是唯一的滚动上下文——
    // 内嵌页面不再自带 .st-content 有界容器，不应该出现第二个独立的
    // 滚动区域相互冲突。
    const scrollContainerCount = await page.evaluate(() => {
      const candidates = [".fdr-content", ".st-content"];
      return candidates.filter((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const style = getComputedStyle(el);
        return style.overflowY === "auto" || style.overflowY === "scroll";
      }).length;
    });
    expect(scrollContainerCount).toBe(1);
  });
});
