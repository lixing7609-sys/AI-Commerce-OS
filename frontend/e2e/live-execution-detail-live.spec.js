import { expect, test } from "@playwright/test";

test("current task keeps Conversation in the center and Task Action Queue on the right", async ({ page }) => {
  await page.goto("/");
  await page.locator('button.sino-conversation-item__open[title="补全任务內容"]').click();

  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation).toBeVisible({ timeout: 20_000 });
  await expect(conversation.getByLabel("讨论记录")).toBeVisible();
  await expect(conversation.getByLabel("讨论内容")).toBeVisible();
  await expect(conversation.getByRole("region", { name: "实时执行详情" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Founder Action Queue", exact: true })).toBeVisible();

  await expect(page.locator(".sino-execution-progress")).toHaveCount(1);
  await expect(page.locator(".sino-brain-context .sino-execution-progress strong")).toHaveText("90%");
  await expect(page.locator(".sino-task-technical-details")).not.toHaveAttribute("open", "");
});
