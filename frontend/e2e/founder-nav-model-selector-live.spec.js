import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";

test("formal Founder workspace resizes and fully hides the GPT-style navigation panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const workspace = page.locator(".founder-workspace");
  const navigation = page.getByLabel("Founder Navigation");
  const expanded = await navigation.boundingBox();
  const centerBefore = await page.getByRole("main", { name: "Sino Natural Conversation" }).boundingBox();
  const selector = page.getByRole("button", { name: "Sino AI · 选择模型" });
  await expect(selector).toBeVisible();
  const selectorBefore = await selector.boundingBox();
  const handle = page.getByRole("separator", { name: "调整左侧导航宽度" });
  const handleBox = await handle.boundingBox();
  await handle.hover({ position: { x: 5, y: 80 } });
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 105, handleBox.y + 80, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(220);
  const wider = await navigation.boundingBox();
  expect(wider.width).toBeGreaterThan(expanded.width + 80);
  await page.reload();
  expect(Math.abs((await navigation.boundingBox()).width - wider.width)).toBeLessThan(2);
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await page.waitForTimeout(220);
  await expect(page.getByLabel("Founder Navigation")).toHaveCount(0);
  await expect(workspace).toHaveAttribute("data-workspace-structure", "conversation execution");
  const centerCollapsed = await page.getByRole("main", { name: "Sino Natural Conversation" }).boundingBox();
  expect(centerCollapsed.x).toBeLessThan(centerBefore.x - 100);
  expect((await selector.boundingBox()).x).toBeLessThan(selectorBefore.x - 100);
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建讨论" })).toBeVisible();
  await expect(page.getByRole("button", { name: "库" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "设置" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Founder Navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "展开侧边栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await page.waitForTimeout(220);
  const restored = await page.getByLabel("Founder Navigation").boundingBox();
  expect(Math.abs(restored.width - wider.width)).toBeLessThan(2);
  await expect(workspace).toHaveAttribute("data-workspace-structure", "navigation conversation execution");
});

test("Sino AI selects and restores a conversation-scoped configured model", async ({ page, request }) => {
  const eligibleResponse = await request.get(`${API}/founder-ai/model-center/eligible-models?role=sino_conversation`);
  expect(eligibleResponse.ok()).toBeTruthy();
  const eligible = (await eligibleResponse.json()).models.filter((model) => model.health_status !== "unhealthy" && model.availability !== "unavailable");
  expect(eligible.length).toBeGreaterThanOrEqual(2);
  const initialModel = eligible[0];
  const overrideModel = eligible.find((model) => model.identity !== initialModel.identity);
  const created = await request.post(`${API}/conversations`, { data: {
    title: "Model selector isolated verification",
    conversation_type: "USER_CONVERSATION",
    created_by: "VERIFICATION",
    conversation_model_provider: initialModel.provider_id,
    conversation_model: initialModel.model_id,
  }});
  expect(created.ok()).toBeTruthy();
  const conversation = await created.json();
  try {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator(".sino-conversation-item__open", { hasText: "Model selector isolated verification" }).click();
    await page.getByRole("button", { name: "Model selector isolated verification · 选择模型" }).click();
    const initial = page.getByRole("menuitemradio").filter({ hasText: initialModel.model_id });
    await expect(initial).toHaveAttribute("aria-checked", "true");
    const override = page.getByRole("menuitemradio").filter({ hasText: overrideModel.model_id });
    await expect(override).toBeEnabled();
    const updatedResponse = page.waitForResponse((response) => response.url().endsWith(`/conversations/${conversation.id}/conversation-model`) && response.request().method() === "PATCH");
    await override.click();
    expect((await updatedResponse).status()).toBe(200);
    const persisted = await request.get(`${API}/conversations/${conversation.id}`);
    expect((await persisted.json()).conversation_model_provider).toBe(overrideModel.provider_id);
    expect((await persisted.json()).conversation_model).toBe(overrideModel.model_id);
    await page.reload();
    await page.locator(".sino-conversation-item__open", { hasText: "Model selector isolated verification" }).click();
    await page.getByRole("button", { name: "Model selector isolated verification · 选择模型" }).click();
    await expect(page.getByRole("menuitemradio").filter({ hasText: overrideModel.model_id })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/api[_ -]?key|credential|密钥/i)).toHaveCount(0);
  } finally {
    await request.delete(`${API}/conversations/${conversation.id}`);
  }
});
