import { expect, test } from "@playwright/test";

test("real + New Discussion route renders the confirmed three-column workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /新建讨论/ }).click();

  const left = page.locator(".sino-sidebar");
  const center = page.getByRole("region", { name: "Draft Discussion" });
  const right = page.getByRole("complementary", { name: "当前上下文" });
  await expect(left).toBeVisible();
  await expect(center).toBeVisible();
  await expect(right).toBeVisible();
  await expect(right.getByRole("region", { name: "Task Status", exact: true })).toBeVisible();
  await expect(right.getByRole("region", { name: "Founder Action Queue", exact: true })).toBeVisible();
  await expect(center.getByRole("textbox", { name: "讨论内容" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    return {
      left: box(".sino-sidebar"),
      center: box('[aria-label="Draft Discussion"]'),
      right: box('.sino-founder-context[aria-label="当前上下文"]'),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  expect(layout.left.right).toBeLessThanOrEqual(layout.center.left);
  expect(layout.center.right).toBeLessThanOrEqual(layout.right.left);
  for (const column of [layout.left, layout.center, layout.right]) {
    expect(column.width).toBeGreaterThan(0);
    expect(column.top).toBeGreaterThanOrEqual(0);
    expect(column.bottom).toBeLessThanOrEqual(layout.viewport.height);
  }
});
