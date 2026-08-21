import { expect, test } from "@playwright/test";

test("preserved historical Conversations open with an empty Founder task runtime", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem(
    "sino-founder-active-conversation", "conv-46a050fd62df416e9a81"));
  await page.reload();
  await page.locator('button.sino-conversation-item__open[title="我们先不聊开发"]').click();

  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation).toContainText("我们先不聊开发，聊点其他的", { timeout: 60_000 });
  const status = page.getByRole("region", { name: "Task Status", exact: true });
  await expect(status).toContainText("讨论中");
  await expect(status).toContainText("尚未形成执行任务");
  await expect(status).toContainText("Founder：无需操作");
  await expect(page.getByRole("region", { name: "Founder Work Queue" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: /Task Card:/ })).toHaveCount(0);
  await expect(page.getByText("暂无需要你处理的事项")).toBeVisible();

  await page.locator('button.sino-conversation-item__open[title="把新建讨论页面改成3列式"]').click();
  await expect(conversation).toContainText("把新建讨论页面改成3列式", { timeout: 60_000 });
  await expect(page.getByRole("article", { name: /Task Card:/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Task Status", exact: true })).toContainText("尚未形成执行任务");
});
