import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";

test("formal Founder workspace persists the GPT-style navigation rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const workspace = page.locator(".founder-workspace");
  const navigation = page.getByLabel("Founder Navigation");
  const expanded = await navigation.boundingBox();
  await expect(page.getByRole("button", { name: "Sino AI" })).toBeVisible();
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await expect(navigation).toHaveClass(/is-collapsed/);
  await page.waitForTimeout(220);
  const collapsed = await navigation.boundingBox();
  expect(collapsed.width).toBeLessThan(expanded.width - 100);
  await expect(page.getByRole("button", { name: "新建讨论" })).toBeVisible();
  await expect(page.getByRole("button", { name: "库" })).toBeVisible();
  await expect(page.getByRole("button", { name: "项目", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "会话" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
  await expect(workspace).toHaveAttribute("data-workspace-structure", "navigation conversation execution");
  await page.reload();
  expect((await navigation.boundingBox()).width).toBeLessThan(expanded.width - 100);
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(navigation).not.toHaveClass(/is-collapsed/);
  await page.waitForTimeout(220);
  expect((await navigation.boundingBox()).width).toBeGreaterThan(collapsed.width + 100);
});

test("Sino AI selects and restores a conversation-scoped configured model", async ({ page, request }) => {
  const created = await request.post(`${API}/conversations`, { data: {
    title: "Model selector isolated verification",
    conversation_type: "USER_CONVERSATION",
    created_by: "VERIFICATION",
    conversation_model_provider: "deepseek",
    conversation_model: "deepseek-chat",
  }});
  expect(created.ok()).toBeTruthy();
  const conversation = await created.json();
  try {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator(".sino-conversation-item__open", { hasText: "Model selector isolated verification" }).click();
    await page.getByRole("button", { name: "Sino AI" }).click();
    const deepseek = page.getByRole("menuitemradio", { name: /DeepSeek.*deepseek-chat/i });
    await expect(deepseek).toHaveAttribute("aria-checked", "true");
    const gpt = page.getByRole("menuitemradio", { name: /GPT 5 Pro.*gpt-5-pro/i });
    await expect(gpt).toBeEnabled();
    const updatedResponse = page.waitForResponse((response) => response.url().endsWith(`/conversations/${conversation.id}/conversation-model`) && response.request().method() === "PATCH");
    await gpt.click();
    expect((await updatedResponse).status()).toBe(200);
    const persisted = await request.get(`${API}/conversations/${conversation.id}`);
    expect((await persisted.json()).conversation_model).toBe("gpt-5-pro");
    await page.reload();
    await page.locator(".sino-conversation-item__open", { hasText: "Model selector isolated verification" }).click();
    await page.getByRole("button", { name: "Sino AI" }).click();
    await expect(page.getByRole("menuitemradio", { name: /GPT 5 Pro.*gpt-5-pro/i })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/api[_ -]?key|credential|密钥/i)).toHaveCount(0);
  } finally {
    await request.delete(`${API}/conversations/${conversation.id}`);
  }
});
