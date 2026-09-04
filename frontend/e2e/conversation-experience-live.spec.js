import { expect, test } from "@playwright/test";

const question = "我觉得现在 Sino Founder AI 虽然已经能执行任务了，但是作为 Founder 日常长期使用的 AI 助手，你觉得现在还缺少什么？";

test("first Founder message is immediate and the Conversation Model replies without another interaction", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await page.getByRole("button", { name: /新建讨论/ }).click();

  const draft = page.getByRole("region", { name: "Draft Discussion" });
  await draft.getByRole("textbox", { name: "讨论内容" }).fill(question);
  await draft.getByRole("button", { name: "发送" }).click();

  const conversation = page.getByRole("region", { name: "Conversation" });
  const founderMessage = conversation.locator('[data-role="founder"]', { hasText: question });
  await expect(founderMessage).toBeVisible({ timeout: 1_500 });
  await expect(founderMessage).toHaveCount(1);

  const sinoResponse = conversation.locator('[data-role="assistant"]').filter({ has: page.locator(".sino-message-body") }).last();
  await expect(sinoResponse).toBeVisible({ timeout: 90_000 });
  await expect(conversation.locator('[data-role="founder"]', { hasText: question })).toHaveCount(1);
  await expect(conversation.locator('[data-role="assistant"]')).toHaveCount(1);
  await expect(sinoResponse.locator(".sino-message-body p").first()).toBeVisible();

  const rawReply = await sinoResponse.locator(".sino-message-body").innerText();
  expect(rawReply.trim().length).toBeGreaterThan(40);
  console.log(`SINO_RAW_REPLY_START\n${rawReply}\nSINO_RAW_REPLY_END`);
});
