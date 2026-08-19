import { expect, test } from "@playwright/test";

test("Capability Repository clear control is conditionally visible and restores results", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "能力仓库", exact: true }).click();
  await page.getByRole("button", { name: "能力周期", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "搜索能力名称或 Domain" });
  await expect(search).toBeVisible();
  await expect(page.getByRole("button", { name: "清除", exact: true })).toHaveCount(0);
  await expect(page.locator(".sino-global-search-results .sino-workspace-row").first()).toBeVisible();
  const initialRows = await page.locator(".sino-global-search-results .sino-workspace-row").count();
  await search.fill("商品");
  await expect(page.getByRole("button", { name: "清除", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "清除", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "清除", exact: true })).toHaveCount(0);
  await expect(page.locator(".sino-global-search-results .sino-workspace-row")).toHaveCount(initialRows);
  await page.reload();
  await page.getByRole("button", { name: "能力仓库", exact: true }).click();
  await page.getByRole("button", { name: "能力周期", exact: true }).click();
  await expect(page.getByRole("button", { name: "清除", exact: true })).toHaveCount(0);
});
