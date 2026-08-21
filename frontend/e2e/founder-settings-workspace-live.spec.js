import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidenceDirectory = "../.runtime/visual-evidence/settings-workspace";
const provider = {
  provider_key: "deepseek", provider_type: "deepseek", display_name: "DeepSeek", installed: true,
  enabled: true, health_status: "healthy", api_key_mask: "****1234", base_url: "https://api.deepseek.com/v1",
  available_models: Array.from({ length: 18 }, (_, index) => ({ model_id: index ? `deepseek-model-${index + 1}` : "deepseek-chat", display_name: index ? `DeepSeek Model ${index + 1}` : "deepseek-chat", recommendation_score: 90 })),
  selected_models: ["deepseek-chat"],
};
const center = {
  provider_catalog: [], providers: [provider], roles: [], agents: [], skills: [], applications: [], execution_engines: [],
  health_cost: [{ ...provider, usage: { calls: 3, tokens: 1200, cost: 0.03, average_latency_ms: 280, quota: null } }],
  model_capability_registry: {
    models: [{ provider_id: "deepseek", model_id: "deepseek-chat", display_name: "deepseek-chat", enabled: true, selected: true, healthy: true, capabilities: {
      supports_text_reasoning: { status: "VERIFIED" }, supports_vision_understanding: { status: "UNVERIFIED" },
      supports_image_generation: { status: "UNSUPPORTED" }, supports_tool_use: { status: "VERIFIED" }, supports_structured_output: { status: "VERIFIED" },
    } }],
    routing_policies: [{ capability: "TEXT_REASONING", preferred_primary: { provider_id: "deepseek", model_id: "deepseek-chat" }, active_primary: { provider_id: "deepseek", model_id: "deepseek-chat", display_name: "deepseek-chat" }, configured_fallback: null, status: "ACTIVE", preferred_status: "VERIFIED" }],
  },
};
const runtime = { environments: [{ environment_type: "LOCAL", status: "ACTIVE", services: [], database: {}, iam: {}, network: {} }, { environment_type: "NAS", status: "PLANNED" }, { environment_type: "COMMERCIAL_CLOUD", status: "NOT_CONFIGURED" }] };

test("Settings removes the Founder sidebar, expands its workspace, and keeps the configuration inspector", async ({ page }) => {
  mkdirSync(evidenceDirectory, { recursive: true });
  await page.route("**/api/v1/founder-ai/model-center", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(center) }));
  await page.route("**/api/v1/founder-ai/runtime-environments", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(runtime) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();

  await expect(page.getByLabel("Founder Navigation")).toHaveCount(0);
  const settings = page.getByRole("main", { name: "Founder AI 功能页面" });
  const inspector = page.getByLabel("功能页详情");
  await expect(settings).toBeVisible();
  await expect(inspector).toBeVisible();
  expect((await settings.boundingBox()).x).toBeLessThan(4);
  const initialMain = await settings.boundingBox();
  const initialInspector = await inspector.boundingBox();
  expect(initialMain.x + initialMain.width).toBeLessThanOrEqual(initialInspector.x);
  await expect(page.getByText("Model Capabilities")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "运行环境" })).toBeVisible();
  await expect(page.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "我的模型" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table", { name: "模型状态列表" })).toBeVisible();
  await expect(page.getByText("Sino Founder AI 系统配置")).toBeVisible();
  for (const section of ["模型", "连接状态", "可用模型", "连接配置", "连接测试"]) await expect(inspector.getByRole("heading", { name: section, exact: true })).toBeVisible();
  await expect(inspector).toHaveCSS("position", "relative");
  await expect(inspector).toHaveCSS("scrollbar-width", "none");
  await expect(inspector.locator(".sino-settings-context")).toHaveCSS("overflow-y", "auto");
  await expect(inspector.locator(".sino-settings-context")).toHaveCSS("scrollbar-width", "none");
  await page.screenshot({ path: `${evidenceDirectory}/settings-models-two-zone.png`, fullPage: true });

  const handle = page.getByRole("separator", { name: "调整系统配置面板宽度" });
  await expect(handle).toHaveCSS("cursor", "col-resize");
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + 4, handleBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y + 80, { steps: 6 });
  await page.mouse.up();
  const widerInspector = await inspector.boundingBox();
  expect(widerInspector.width).toBeGreaterThan(initialInspector.width + 100);
  const narrowerMain = await settings.boundingBox();
  expect(narrowerMain.width).toBeLessThan(initialMain.width - 100);
  expect(narrowerMain.x + narrowerMain.width).toBeLessThanOrEqual(widerInspector.x);
  await page.screenshot({ path: `${evidenceDirectory}/settings-inspector-wider.png`, fullPage: true });

  const availableModels = page.locator(".sino-settings-context .sino-model-choices");
  await expect(availableModels).toHaveCSS("overflow-y", "auto");
  await expect(availableModels).toHaveCSS("scrollbar-width", "none");
  await availableModels.evaluate((element) => { element.scrollTop = 120; });
  expect(await availableModels.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "模型能力" }).click();
  await expect(page.getByRole("table", { name: "模型状态列表" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型能力" })).toBeVisible();
  await expect(inspector).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-capabilities.png`, fullPage: true });

  await page.getByRole("button", { name: "模型路由策略" }).click();
  await expect(page.getByRole("region", { name: "模型能力" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型路由策略" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-routing.png`, fullPage: true });

  await page.getByRole("button", { name: "关闭设置并返回 Sino 首页" }).click();
  await expect(page.getByLabel("Founder Navigation")).toBeVisible();
  await expect(page.getByRole("main", { name: "Sino Natural Conversation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "执行中心" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-return-sino.png`, fullPage: true });
});
