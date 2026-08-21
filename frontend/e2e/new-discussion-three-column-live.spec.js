import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";

test("Founder home and New Discussion are the same unified three-column workspace", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");

  const assertWorkspace = async () => {
    await expect(page.locator(".sino-sidebar")).toBeVisible();
    await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Execution Center" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "讨论内容" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "执行中心" })).toBeVisible();
    await expect(page.getByText("暂无执行事项")).toBeVisible();
    await expect(page.getByText("能力上下文")).toHaveCount(0);
    await expect(page.getByText("创造什么 AI 能力？")).toHaveCount(0);
    await expect(page.getByText("创建 Agent")).toHaveCount(0);
  };

  await assertWorkspace();
  const before = await page.locator(".sino-founder-shell").evaluate((node) => ({
    columns: getComputedStyle(node).gridTemplateColumns,
    childCount: node.children.length,
  }));

  await page.getByRole("button", { name: /新建讨论/ }).click();
  await assertWorkspace();
  const after = await page.locator(".sino-founder-shell").evaluate((node) => ({
    columns: getComputedStyle(node).gridTemplateColumns,
    childCount: node.children.length,
  }));
  expect(after).toEqual(before);

  const bounds = await page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box && { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
    };
    return {
      left: rect(".sino-sidebar"),
      center: rect('[aria-label="Conversation"]'),
      right: rect('.sino-founder-context[aria-label="当前上下文"]'),
      viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.left.right).toBeLessThanOrEqual(bounds.center.left);
  expect(bounds.center.right).toBeLessThanOrEqual(bounds.right.left);
  for (const column of [bounds.left, bounds.center, bounds.right]) {
    expect(column.width).toBeGreaterThan(0);
    expect(column.top).toBeGreaterThanOrEqual(0);
    expect(column.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  }

  expect(await (await request.get(`${API}/conversations`)).json()).toEqual([]);
});

test("asset pages remain independent and returning home restores the unified workspace", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "能力仓库", exact: true }).click();
  await expect(page.getByRole("heading", { name: "草案中心" })).toBeVisible();
  await page.getByTitle("Sino Founder AI 首页").click();
  await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Execution Center" })).toBeVisible();

  await page.getByRole("button", { name: /设置/ }).click();
  await expect(page.getByText("Sino Founder AI 系统配置")).toBeVisible();
  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Execution Center" })).toBeVisible();
});
