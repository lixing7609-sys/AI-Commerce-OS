import { expect, test } from "@playwright/test";

const rounds = ["第一个测试问题：你如何理解持续对话？", "继续第二个问题：上下文为什么重要？", "继续第三个问题：请给一个简短建议。"];

test("one existing Conversation delivers and streams three independent rounds", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: /新建讨论/ }).click();
  const draft = page.getByRole("region", { name: "Draft Discussion" });
  await draft.getByRole("textbox", { name: "讨论内容" }).fill(rounds[0]);
  await draft.getByRole("button", { name: "发送" }).click();

  const conversation = page.getByRole("region", { name: "Conversation" });
  const composer = conversation.getByRole("textbox", { name: "讨论内容" });
  const send = conversation.locator('.sino-conversation-composer-dock .sino-button');
  const canonicalReplies = conversation.locator('.sino-message-group:not([data-streaming="true"]) article[data-role="assistant"]');

  for (let index = 0; index < rounds.length; index += 1) {
    if (index > 0) {
      await composer.fill(rounds[index]);
      await expect(send).toBeEnabled();
      await send.click();
    }
    await expect(conversation.locator('[data-role="founder"]', { hasText: rounds[index] })).toHaveCount(1, { timeout: 2_000 });
    await expect(send).toBeDisabled();
    const streamed = conversation.locator('[data-streaming="true"] article[data-role="assistant"]');
    await expect(streamed).toBeVisible({ timeout: 90_000 });
    const firstChunk = (await streamed.innerText()).trim();
    expect(firstChunk.length).toBeGreaterThan(0);
    await expect.poll(async () => {
      if (await streamed.count()) return (await streamed.innerText()).trim().length;
      return firstChunk.length + 1;
    }, { timeout: 90_000 }).toBeGreaterThan(firstChunk.length);
    await expect(canonicalReplies).toHaveCount(index + 1, { timeout: 90_000 });
    await expect(streamed).toHaveCount(0);
    // The next round is deliberately not submitted until this exact round is canonical.
  }

  await expect(conversation.locator('[data-role="founder"]')).toHaveCount(3);
  await expect(canonicalReplies).toHaveCount(3);
});
