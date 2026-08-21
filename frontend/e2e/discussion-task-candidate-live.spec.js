import { expect, test } from "@playwright/test";

test("real mature discussion projects its Conversation-Model candidate without creating a Task", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem(
    "sino-founder-active-conversation", "conv-46a050fd62df416e9a81"));
  await page.reload();
  await page.locator('button.sino-conversation-item__open[title="我们先不聊开发"]').click();

  const status = page.getByRole("region", { name: "Task Status", exact: true });
  await expect(status.getByText("待确认", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(status).toContainText("已形成待确认任务，尚未开始执行");
  await expect(status).toContainText("Founder：需要操作");

  const queue = page.getByRole("region", { name: "Founder Action Queue", exact: true });
  const action = queue.getByRole("article", { name: "Task Confirmation" });
  await expect(action).toContainText("搭建最小AI电商经营系统（第一阶段）");
  await expect(action).toContainText("商品理解→广告创意→投放优化");
  await expect(action.getByRole("button", { name: "确认执行" })).toBeVisible();
  await expect(action.getByRole("button", { name: "修改任务" })).toBeVisible();
  await expect(action.getByRole("button", { name: "继续讨论" })).toBeVisible();
  await expect(page.locator(".sino-execution-progress")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "停止任务" })).toHaveCount(0);
});
