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

test.describe("Founder: Store Connection Center (真实店铺接入)", () => {
  test("loads real shops from the backend and defaults every store to MODE_LIVE_READONLY", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    await expect(page.getByRole("heading", { name: "真实店铺接入" })).toBeVisible();

    const rows = page.locator("table tbody tr");
    await expect
      .poll(async () => (await rows.count()) > 0 || (await page.getByText("尚未创建任何店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "no real store in the dev database");

    // 每一行的接入模式下拉都必须默认停在 MODE_LIVE_READONLY，绝不能
    // 默认落在 MODE_MOCK 或任何 LIVE_* 写模式。
    const modeSelects = page.locator("select").filter({ hasText: "MODE_LIVE_READONLY" });
    expect(await modeSelects.count()).toBeGreaterThan(0);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("MODE_LIVE_AUTOMATED is never offered as a selectable option", async ({ page }) => {
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    await expect(page.getByText("本阶段全局禁用，不对任何店铺开放")).toBeVisible();
    await expect(page.getByText("MODE_LIVE_AUTOMATED", { exact: false }).first()).toBeVisible();
    // 下拉选项里不应该出现 LIVE_AUTOMATED 这个可选值
    const options = page.locator("select option");
    const optionValues = await options.evaluateAll((els) => els.map((el) => el.getAttribute("value")));
    expect(optionValues).not.toContain("MODE_LIVE_AUTOMATED");
  });

  test("运行 Mock 演练 completes an honest, non-fabricated MODE_MOCK sync without touching real stores", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    await page.getByRole("button", { name: "运行 Mock 演练" }).click();
    await expect(page.getByText(/MODE_MOCK 演练完成/)).toBeVisible({ timeout: 5000 });
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("运行只读同步 on a real store honestly reports 0 processed records (no fabricated platform data)", async ({ page }) => {
    await page.goto("/?mode=founder&module=storeConnectionCenter");
    const runButtons = page.getByRole("button", { name: "运行只读同步" });
    await expect
      .poll(async () => (await runButtons.count()) > 0 || (await page.getByText("尚未创建任何店铺").count()) > 0, { timeout: 5000 })
      .toBe(true);
    const count = await runButtons.count();
    test.skip(count === 0, "no real store in the dev database");

    await runButtons.first().click();
    const historyButtons = page.getByRole("button", { name: "同步记录" });
    await historyButtons.first().click();
    await expect(page.getByRole("heading", { name: "同步运行记录" })).toBeVisible();
    await expect(page.getByText("平台数据同步尚未接入真实后端")).toBeVisible();
    // 处理记录数列必须真实为 0，不能显示任何虚构的非零数字
    await expect(page.locator("table").last().getByText("0").first()).toBeVisible();
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
    await expect(page.getByRole("button", { name: "AI 秘书处" })).toBeVisible();
  });

  test("店铺 page inside Operator Lab is the same real ShopCenterContent as standalone Operator, plus the Founder-only 平台连接器 overlay tab", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "店铺" }).click();
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

test.describe("Founder: Studio Lab (阶段 M8c contentOnly 渲染，Studio 完整导航直接展开在 Founder 侧边栏里)", () => {
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
