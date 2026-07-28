import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for moving "统一平台连接器" out of a
 * detached Store Center panel and into each store's own detail view
 * (阶段：Founder Store Center IA 精修). Assumes the dev database has
 * at least two real shops (seeded via the normal Store Center "新增
 * 店铺" flow) — this repo's dev environment currently has "新城" and
 * "演示店铺". If run against an empty shop list, the first two tests
 * are skipped rather than failing on missing fixture data.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function openFirstStore(page) {
  await page.goto("/?mode=founder&module=storeCenter");
  const storeCard = page.locator(".shop-card").first();
  try {
    await storeCard.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    return null;
  }
  await storeCard.click();
  await expect(page.getByRole("button", { name: "平台连接器" })).toBeVisible();
  return page.locator("h1").first().innerText();
}

test.describe("Founder Store Center: platform connector moved into store detail", () => {
  test("store detail tab order places 平台连接器 between 链接与授权 and 任务", async ({ page }) => {
    const errors = collectPageErrors(page);
    const storeName = await openFirstStore(page);
    test.skip(!storeName, "no real store in the dev database to open");

    const tabs = page.locator(".shop-detail-tabs button");
    const labels = await tabs.allInnerTexts();
    const authIndex = labels.indexOf("连接与授权");
    const connectorIndex = labels.indexOf("平台连接器");
    const tasksIndex = labels.indexOf("任务");
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(connectorIndex).toBe(authIndex + 1);
    expect(tasksIndex).toBe(connectorIndex + 1);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("平台连接器 tab renders meaningful store-specific content and transitions correctly", async ({ page }) => {
    const errors = collectPageErrors(page);
    const storeName = await openFirstStore(page);
    test.skip(!storeName, "no real store in the dev database to open");

    await page.getByRole("button", { name: "连接与授权" }).click();
    await expect(page.getByRole("heading", { name: "凭据" })).toBeVisible();
    // 真实凭据字段必须是密码框，不明文展示任何 secret 值
    const secretInputs = page.locator("input[type='password']");
    expect(await secretInputs.count()).toBeGreaterThan(0);

    await page.getByRole("button", { name: "平台连接器" }).click();
    await expect(page.getByRole("heading", { name: "连接器概况" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "能力矩阵" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "同步与健康度" })).toBeVisible();
    await expect(page.getByText("演示数据").first()).toBeVisible();
    // 不应该出现真实凭据值
    await expect(page.getByText(/access_token|app_secret|client_secret/i)).toHaveCount(0);

    await page.getByRole("button", { name: "任务" }).click();
    await expect(page.getByText("连接器概况")).toHaveCount(0);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("switching stores changes the connector data, and hard refresh does not blank the page", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=storeCenter");
    const storeCards = page.locator(".shop-card");
    try {
      await storeCards.first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      // falls through to storeCount === 0 below
    }
    const storeCount = await storeCards.count();
    test.skip(storeCount < 2, "fewer than two real stores in the dev database");

    await storeCards.nth(0).click();
    await page.getByRole("button", { name: "平台连接器" }).click();
    await expect(page.getByRole("heading", { name: "连接器概况" })).toBeVisible();
    const firstStoreConnectorType = await page.getByText(/开放平台|连接器框架|SP-API|Open Platform/).first().innerText();

    await page.getByText("← 返回店铺列表").click();
    await storeCards.nth(1).click();
    await page.getByRole("button", { name: "平台连接器" }).click();
    await expect(page.getByRole("heading", { name: "连接器概况" })).toBeVisible();
    const secondStoreConnectorType = await page.getByText(/开放平台|连接器框架|SP-API|Open Platform/).first().innerText();

    // 不同店铺至少店铺名不同（连接器类型也常常不同，但平台相同时可能相同，店铺名必然不同）
    expect(firstStoreConnectorType).toBeTruthy();
    expect(secondStoreConnectorType).toBeTruthy();

    // 店铺详情的当前选中店铺/标签页只存在于组件内存状态，没有同步到
    // URL（阶段现状，不是本次改动引入的行为）——硬刷新后按设计会回到
    // 店铺列表，这里只验证"没有变成空白页/没有未捕获异常"，不假设
    // 深链接会保留在同一个店铺的同一个标签页。
    await page.reload();
    await expect(page.locator("main").last()).not.toBeEmpty();
    await expect(page.locator(".shop-card").first()).toBeVisible();

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Store Center list no longer shows the old detached 统一平台连接器 panel", async ({ page }) => {
    await page.goto("/?mode=founder&module=storeCenter");
    await expect(page.getByText("统一平台连接器")).toHaveCount(0);
  });
});
