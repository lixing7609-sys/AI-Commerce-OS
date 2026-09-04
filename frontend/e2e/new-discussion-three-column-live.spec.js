import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";

test("Founder home and New Discussion are the same unified three-column workspace", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");

  const assertWorkspace = async () => {
    await expect(page.getByLabel("Founder Navigation")).toBeVisible();
    await expect(page.getByRole("main", { name: "Sino Natural Conversation" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "执行中心", exact: true })).toBeVisible();
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
  const before = await page.locator(".founder-workspace").evaluate((node) => ({
    columns: getComputedStyle(node).gridTemplateColumns,
    childCount: node.children.length,
  }));

  await page.getByRole("button", { name: /新建讨论/ }).click();
  await assertWorkspace();
  const after = await page.locator(".founder-workspace").evaluate((node) => ({
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
      left: rect(".founder-navigation-panel"),
      center: rect('[aria-label="Conversation"]'),
      right: rect('.founder-execution-center'),
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

test("the formal execution center resizes and persists without changing the three-region DOM", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("sino-founder-execution-center-width"));
  await page.reload();
  const panel = page.getByRole("complementary", { name: "执行中心", exact: true });
  const handle = page.getByRole("separator", { name: "调整执行中心宽度" });
  const initial = await panel.boundingBox();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + 4, handleBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y + 40);
  await page.mouse.up();
  const wider = await panel.boundingBox();
  expect(wider.width).toBeGreaterThan(initial.width + 80);

  const movedHandle = await handle.boundingBox();
  await page.mouse.move(movedHandle.x + 4, movedHandle.y + 40);
  await page.mouse.down();
  await page.mouse.move(movedHandle.x + 180, movedHandle.y + 40);
  await page.mouse.up();
  const narrower = await panel.boundingBox();
  expect(narrower.width).toBeLessThan(wider.width - 100);
  expect(narrower.width).toBeGreaterThanOrEqual(279);

  await page.reload();
  const restored = await panel.boundingBox();
  expect(Math.abs(restored.width - narrower.width)).toBeLessThan(2);
  await expect(page.locator(".founder-workspace").locator(":scope > *")).toHaveCount(3);
});

test("asset pages remain independent and returning home restores the unified workspace", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: "库", exact: true }).click();
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
