import { expect, test } from "@playwright/test";

const conversationId = "conv-46a050fd62df416e9a81";

test("real Conversation keeps both tasks visible and changes focus without changing lifecycle", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.evaluate((id) => window.localStorage.setItem("sino-founder-active-conversation", id), conversationId);
  await page.reload();
  await page.locator('button.sino-conversation-item__open[title="我们先不聊开发"]').click();

  const queue = page.getByRole("region", { name: "Founder Work Queue" });
  await expect(queue).toBeVisible({ timeout: 60_000 });
  const taskA = queue.getByRole("article", { name: "Task Card: 搭建最小AI电商经营系统（第一阶段）" });
  const taskB = queue.getByRole("article", { name: /Task Card: 在左侧栏“设置”区域上方创建一个入口/ });
  await expect(queue.getByRole("article", { name: /Task Card:/ })).toHaveCount(2);
  await expect(taskA).toContainText("待确认");
  await expect(taskA).toContainText("Founder：需要操作");
  await expect(taskA.getByRole("button", { name: "确认执行" })).toBeVisible();
  await expect(taskB).toContainText("验证受阻");
  await expect(taskA).toHaveAttribute("aria-current", "true");
  await expect(taskB).toBeVisible();

  await taskB.locator("header").click();
  await expect(taskB).toHaveAttribute("aria-current", "true");
  await expect(taskA).toBeVisible();

  await taskA.locator("header").click();
  await expect(taskA).toHaveAttribute("aria-current", "true");
  await expect(taskB).toBeVisible();
  await expect(queue).toContainText("任务 2");

  const layout = await queue.evaluate((node) => ({
    overflowY: getComputedStyle(node).overflowY,
    withinViewport: node.getBoundingClientRect().bottom <= window.innerHeight,
  }));
  expect(layout.overflowY).toBe("auto");
  expect(layout.withinViewport).toBe(true);
});
