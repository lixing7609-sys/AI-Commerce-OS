import { expect, test } from "@playwright/test";

test("real discussion keeps Conversation in the center and quiet Task Status on the right", async ({ page }) => {
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
  await expect(taskStatus.getByText("讨论中", { exact: true })).toBeVisible();
  await expect(taskStatus.getByText("尚未形成执行任务", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Founder Action Queue", exact: true })).toContainText("暂无需要你处理的事项");
  await expect(page.locator(".sino-execution-progress")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "停止任务" })).toHaveCount(0);
  await expect(page.getByText("Brain Dashboard", { exact: true })).toHaveCount(0);
  await expect(page.locator(".sino-task-technical-details")).not.toHaveAttribute("open", "");
});
