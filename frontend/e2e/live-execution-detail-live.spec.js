import { expect, test } from "@playwright/test";

test("current task separates overall progress from Founder-readable live detail", async ({ page }) => {
  await page.goto("/");
  await page.locator('button.sino-conversation-item__open[title="补全任务內容"]').click();

  const detail = page.getByRole("region", { name: "实时执行详情" });
  await expect(detail).toBeVisible({ timeout: 20_000 });
  await expect(detail.getByText("补全任务內容，或找到合理的内容展示方式。执行过程中再想重复查看的时候，现在查看不了")).toBeVisible();
  await expect(detail.getByText("自动恢复")).toBeVisible();
  await expect(detail.getByText("执行流程长时间没有产生有效进展")).toBeVisible();
  await expect(detail.getByText(/避开需要额外系统权限的检查方式/)).toBeVisible();
  await expect(detail.locator(".sino-execution-progress")).toHaveCount(0);
  await expect(detail.getByText(/90%/)).toHaveCount(0);

  await expect(page.locator(".sino-execution-progress")).toHaveCount(1);
  await expect(page.locator(".sino-brain-context .sino-execution-progress strong")).toHaveText("90%");
  await expect(detail.locator("details")).not.toHaveAttribute("open", "");
});
