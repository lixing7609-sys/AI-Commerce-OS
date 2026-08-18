import { expect, test } from "@playwright/test";

test("current Path D projects the pending bounded authorization gate without approving it", async ({ page }) => {
  await page.goto("/");
  await page.locator('button.sino-conversation-item__open[title="为 Sino Founder AI 增加一个外部"]').click();

  await expect(page.getByText("等待 Founder 授权").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/本地配置检查已经完成/)).toBeVisible();
  await expect(page.getByRole("button", { name: "批准有限 Probe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "修改授权边界" })).toBeVisible();
  await expect(page.getByRole("button", { name: "驳回" })).toBeVisible();
  await expect(page.getByText("Founder：需要操作").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "继续", exact: true })).toHaveCount(0);
});
