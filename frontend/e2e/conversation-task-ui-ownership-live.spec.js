import { expect, test } from "@playwright/test";

test("real clarification keeps Conversation in the center and Founder Action Queue consistent", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("sino-founder-active-conversation", "conv-a0aaac4688b949569438"));
  await page.reload();
  await page.locator('button.sino-conversation-item__open[title="把新建讨论页面改成3列式"]').click();

  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation).toBeVisible({ timeout: 20_000 });
  await expect(conversation.getByText("把新建讨论页面改成3列式", { exact: true }).first()).toBeVisible();
  await expect(conversation.getByText(/目标范围或完成标准还不够唯一/)).toBeVisible();
  await expect(conversation.getByRole("textbox", { name: "讨论内容" })).toBeVisible();
  await expect(conversation.getByText("Current Action", { exact: true })).toHaveCount(0);
  await expect(conversation.getByRole("button", { name: "继续", exact: true })).toHaveCount(0);
  await expect(conversation.getByRole("navigation", { name: "Sino Brain stages" })).toHaveCount(0);
  await expect(conversation.getByText("Confidence", { exact: true })).toHaveCount(0);

  const taskStatus = page.getByRole("region", { name: "Task Status" });
  await expect(taskStatus.getByText("等待确认", { exact: true })).toBeVisible();
  await expect(taskStatus.getByText("尚未形成执行任务", { exact: true })).toBeVisible();
  await expect(taskStatus.getByText("Founder：需要操作", { exact: true })).toBeVisible();
  const queue = page.getByRole("region", { name: "Founder Action Queue", exact: true });
  await expect(queue).toContainText("1 项待处理");
  await expect(queue.getByRole("article", { name: "Clarification Required" })).toContainText("三栏职责需要确认");
  await expect(queue.getByRole("button", { name: "确认当前理解" })).toHaveCount(0);
  await expect(queue.getByRole("button", { name: "继续讨论" })).toBeVisible();
  await expect(page.locator(".sino-execution-progress")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "停止任务" })).toHaveCount(0);
  await expect(page.getByText("Brain Dashboard", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sino-task-technical-details")).not.toHaveAttribute("open", "");
});

test("real long Conversation keeps its composer and side panels inside a short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 560 });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.setItem("sino-founder-active-conversation", "conv-a0aaac4688b949569438"));
  await page.reload();
  await page.locator('button.sino-conversation-item__open[title="把新建讨论页面改成3列式"]').click();
  const composer = page.locator(".sino-conversation-composer-dock");
  const log = page.locator(".sino-conversation-log");
  const right = page.locator(".sino-founder-task-sidebar");
  await expect(composer).toBeVisible({ timeout: 20_000 });
  const layout = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const logElement = document.querySelector(".sino-conversation-log");
    return { composer: box(".sino-conversation-composer-dock"), log: box(".sino-conversation-log"), right: box(".sino-founder-task-sidebar"),
      logScrollHeight: logElement.scrollHeight, logClientHeight: logElement.clientHeight,
      bodyHeight: document.body.scrollHeight, viewportHeight: window.innerHeight,
      logOverflow: getComputedStyle(logElement).overflowY, rightOverflow: getComputedStyle(document.querySelector(".sino-founder-task-sidebar")).overflowY };
  });
  expect(layout.composer.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.composer.top).toBeGreaterThanOrEqual(layout.log.bottom - 1);
  expect(layout.logScrollHeight).toBeGreaterThan(layout.logClientHeight);
  expect(layout.logOverflow).toBe("auto");
  expect(layout.right.bottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.rightOverflow).toBe("auto");
  expect(layout.bodyHeight).toBeLessThanOrEqual(layout.viewportHeight);
  await expect(log).toBeVisible();
  await expect(right).toBeVisible();
});
