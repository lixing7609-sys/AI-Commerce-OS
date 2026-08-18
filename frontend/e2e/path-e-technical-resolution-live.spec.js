import { expect, test } from "@playwright/test";

test("current Path E shows autonomous health resolution completed", async ({ page }) => {
  await page.goto("/");
  await page.locator('button.sino-conversation-item__open[title="执行一次 Sino Founder AI 本地开"]').click();
  await expect(page.getByText("环境健康检查完成").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("Founder：无需操作").first()).toBeVisible();
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "继续", exact: true })).toHaveCount(0);
});
