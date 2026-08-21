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
  await expect(settings).toBeVisible();
  expect((await settings.boundingBox()).x).toBeLessThan(4);
  expect((await settings.boundingBox()).width).toBeGreaterThan(1430);
  await expect(page.getByLabel("功能页详情")).toHaveCount(0);
  await expect(page.getByText("Model Capabilities")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "运行环境" })).toBeVisible();
  await expect(page.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "我的模型" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table", { name: "模型状态列表" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-models-inspector-closed.png`, fullPage: true });

  const table = page.getByRole("table", { name: "模型状态列表" });
  const tableWidthClosed = (await table.boundingBox()).width;
  await page.getByRole("button", { name: /deepseek-chat DeepSeek/ }).click();
  const inspector = page.getByLabel("功能页详情");
  await expect(page.getByText("Sino Founder AI 系统配置")).toBeVisible();
  await expect(inspector).toHaveCSS("position", "fixed");
  await expect(inspector).toHaveCSS("scrollbar-width", "none");
  await expect(inspector.locator(".sino-settings-context")).toHaveCSS("overflow-y", "auto");
  await expect(inspector.locator(".sino-settings-context")).toHaveCSS("scrollbar-width", "none");
  const mainWidth = (await settings.boundingBox()).width;
  const initialInspector = await inspector.boundingBox();
  const handle = page.getByRole("separator", { name: "调整系统配置面板宽度" });
  await expect(handle).toHaveCSS("cursor", "col-resize");
  const tableWithInspector = await table.boundingBox();
  expect(tableWithInspector.x + tableWithInspector.width).toBeLessThanOrEqual(initialInspector.x - 6);
  expect(tableWithInspector.width).toBeLessThan(tableWidthClosed - 300);
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + 4, handleBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 120, handleBox.y + 80, { steps: 6 });
  await page.mouse.up();
  const widerInspector = await inspector.boundingBox();
  expect(widerInspector.width).toBeGreaterThan(initialInspector.width + 100);
  expect(Math.abs(widerInspector.x + widerInspector.width - (initialInspector.x + initialInspector.width))).toBeLessThan(2);
  expect(Math.abs((await settings.boundingBox()).width - mainWidth)).toBeLessThan(2);
  const narrowerTable = await table.boundingBox();
  expect(narrowerTable.x + narrowerTable.width).toBeLessThanOrEqual(widerInspector.x - 6);
  expect(narrowerTable.width).toBeLessThan(tableWithInspector.width - 100);

  const availableModels = page.locator(".sino-settings-context .sino-model-choices");
  await expect(availableModels).toHaveCSS("overflow-y", "auto");
  await expect(availableModels).toHaveCSS("scrollbar-width", "none");
  await availableModels.evaluate((element) => { element.scrollTop = 120; });
  expect(await availableModels.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: `${evidenceDirectory}/settings-models-inspector-open.png`, fullPage: true });

  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.getByLabel("功能页详情")).toHaveCount(0);
  await expect(page.getByRole("main", { name: "Founder AI 功能页面" })).toBeVisible();
  expect((await table.boundingBox()).width).toBeGreaterThan(narrowerTable.width + 400);

  await page.getByRole("button", { name: "模型能力" }).click();
  await expect(page.getByRole("table", { name: "模型状态列表" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型能力" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-capabilities.png`, fullPage: true });

  await page.getByRole("button", { name: "模型路由策略" }).click();
  await expect(page.getByRole("region", { name: "模型能力" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型路由策略" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-routing.png`, fullPage: true });
});
