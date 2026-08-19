import { expect, test } from "@playwright/test";

const conversationId = globalThis.process?.env.PATH_F_CONVERSATION_ID;

test("current Path F projects verified reuse completion", async ({ page }) => {
  test.skip(!conversationId, "Set PATH_F_CONVERSATION_ID for the explicit Path F live run.");
  await page.goto("/");
  await page.locator('button.sino-conversation-item__open[title="再次执行一次 Sino Founder AI 本"]').first().click();
  await expect(page.getByText("Local Development Environment").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("复用验证完成").first()).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Capability Repository", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "继续", exact: true })).toHaveCount(0);
});
