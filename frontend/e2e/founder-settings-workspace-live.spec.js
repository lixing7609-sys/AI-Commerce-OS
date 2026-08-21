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
  provider_catalog: [], providers: [provider], roles: [
    { role_key: "sino_conversation", label: "Sino 对话", provider_key: "deepseek", model: "deepseek-chat" },
    { role_key: "deep_thinking", label: "深度思考", provider_key: "deepseek", model: "deepseek-chat" },
    { role_key: "goal_reasoning", label: "目标推理", provider_key: "deepseek", model: "deepseek-chat" },
    { role_key: "project_analysis", label: "项目分析", provider_key: "deepseek", model: "deepseek-chat" },
    { role_key: "system_builder", label: "系统构建", provider_key: "deepseek", model: "deepseek-chat" },
    { role_key: "solution_review", label: "方案评审", provider_key: "deepseek", model: "deepseek-chat" },
    { role_key: "multi_model_discussion", label: "多模型讨论", models: [{ provider_key: "deepseek", model: "deepseek-chat" }] },
    { role_key: "code_execution", label: "代码执行", provider_key: "deepseek", model: "deepseek-chat", execution_engine_id: "codex" },
  ], agents: [], skills: [], applications: [], execution_engines: [{ engine_id: "codex", display_name: "Codex", status: "available" }],
  health_cost: [{ ...provider, usage: { calls: 3, tokens: 1200, cost: 0.03, average_latency_ms: 280, quota: null } }],
  model_capability_registry: {
    models: [{ provider_id: "deepseek", model_id: "deepseek-chat", display_name: "deepseek-chat", enabled: true, selected: true, healthy: true, capabilities: {
      supports_text_reasoning: { status: "VERIFIED" }, supports_vision_understanding: { status: "UNVERIFIED" },
      supports_image_generation: { status: "UNSUPPORTED" }, supports_tool_use: { status: "VERIFIED" }, supports_structured_output: { status: "VERIFIED" },
    } }],
    routing_policies: [{ capability: "TEXT_REASONING", preferred_primary: { provider_id: "deepseek", model_id: "deepseek-chat" }, active_primary: { provider_id: "deepseek", model_id: "deepseek-chat", display_name: "deepseek-chat" }, configured_fallback: null, status: "ACTIVE", preferred_status: "VERIFIED" }],
  },
};
const runtime = { environments: [{ environment_type: "LOCAL", status: "ACTIVE", services: [{ service_id: "founder_frontend", protocol: "http", host: "127.0.0.1", port: 5173, status: "ACTIVE", health: "healthy" }, { service_id: "founder_backend", protocol: "http", host: "127.0.0.1", port: 8000, status: "ACTIVE", health: "healthy" }], database: { type: "PostgreSQL", connectivity_status: "verified", health_status: "healthy", credential_reference_exists: true }, iam: { type: "HTTP Bearer RBAC", verification_status: "verified" }, network: { boundary: "loopback", verification_status: "verified" } }, { environment_type: "NAS", status: "PLANNED" }, { environment_type: "COMMERCIAL_CLOUD", status: "NOT_CONFIGURED" }] };

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
  await expect(inspector.locator(".sino-settings-inspector-card")).toHaveCount(5);
  const availableModels = inspector.locator(".sino-model-choices");
  await expect(availableModels.locator("label")).toHaveCount(3);
  await expect(inspector.getByRole("button", { name: "查看全部 18 个模型" })).toBeVisible();
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

  await inspector.getByRole("button", { name: "查看全部 18 个模型" }).click();
  await expect(availableModels.locator("label")).toHaveCount(18);
  const inspectorScroll = inspector.locator(".sino-settings-context");
  await inspectorScroll.evaluate((element) => { element.scrollTop = 120; });
  expect(await inspectorScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: `${evidenceDirectory}/settings-models-expanded.png`, fullPage: true });
  await page.getByRole("button", { name: "模型能力" }).click();
  await expect(page.getByRole("table", { name: "模型状态列表" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型能力" })).toBeVisible();
  await expect(inspector).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-capabilities.png`, fullPage: true });

  await page.getByRole("button", { name: "模型路由策略" }).click();
  await expect(page.getByRole("region", { name: "模型能力" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型路由策略" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-routing.png`, fullPage: true });

  await page.getByRole("button", { name: "Sino AI" }).click();
  await expect(page.getByRole("region", { name: "Sino AI" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-sino-ai.png`, fullPage: true });

  await page.getByRole("button", { name: "执行器" }).click();
  await expect(page.getByRole("region", { name: "执行器" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-executor.png`, fullPage: true });

  await page.getByRole("button", { name: "讨论配置" }).click();
  await expect(page.getByRole("region", { name: "讨论配置" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-discussion.png`, fullPage: true });

  await page.getByRole("button", { name: "运行环境" }).click();
  await expect(page.getByRole("region", { name: "运行环境" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-runtime.png`, fullPage: true });

  await page.getByRole("button", { name: "关闭设置并返回 Sino 首页" }).click();
  await expect(page.getByLabel("Founder Navigation")).toBeVisible();
  await expect(page.getByRole("main", { name: "Sino Natural Conversation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "执行中心" })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-return-sino.png`, fullPage: true });
});
