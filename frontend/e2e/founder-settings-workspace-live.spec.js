import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidenceDirectory = "../.runtime/visual-evidence/settings-workspace";
const provider = {
  provider_key: "deepseek", provider_type: "deepseek", display_name: "DeepSeek", installed: true,
  enabled: true, health_status: "healthy", api_key_mask: "****1234", base_url: "https://api.deepseek.com/v1",
  available_models: Array.from({ length: 18 }, (_, index) => ({ model_id: index ? `deepseek-model-${index + 1}` : "deepseek-chat", display_name: index ? `DeepSeek Model ${index + 1}` : "deepseek-chat", recommendation_score: 90 })),
  selected_models: Array.from({ length: 8 }, (_, index) => index ? `deepseek-model-${index + 1}` : "deepseek-chat"),
};
const claudeProvider = { provider_key: "claude", provider_type: "anthropic", display_name: "Claude", installed: true, enabled: true, health_status: "healthy", api_key_mask: "****5678", base_url: "https://api.anthropic.com/v1", available_models: [{ model_id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }], selected_models: ["claude-sonnet-5"] };
const gptProvider = { provider_key: "gpt", provider_type: "openai", display_name: "GPT", installed: true, enabled: true, health_status: "healthy", api_key_mask: "****9012", base_url: "https://api.openai.com/v1", available_models: [{ model_id: "gpt-5-pro", display_name: "GPT 5 Pro" }], selected_models: ["gpt-5-pro"] };
const center = {
  provider_catalog: [], providers: [provider, claudeProvider, gptProvider], roles: [
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

test("Settings consolidates into three domains and keeps the real model inspector", async ({ page }) => {
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
  await expect(inspector).toHaveCount(0);
  expect((await settings.boundingBox()).x).toBeLessThan(4);
  const initialMain = await settings.boundingBox();
  expect(initialMain.width).toBeGreaterThan(1430);
  await expect(page.getByText("Model Capabilities")).toHaveCount(0);
  const settingsTabs = page.getByRole("navigation", { name: "设置分类" });
  await expect(settingsTabs.getByRole("button")).toHaveCount(3);
  for (const name of ["模型", "Sino AI", "执行与运行"]) await expect(settingsTabs.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of ["模型与 API", "模型能力", "模型路由策略", "执行器", "讨论配置", "运行环境"]) await expect(settingsTabs.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  await expect(settingsTabs.getByRole("button", { name: "模型" })).toHaveClass(/is-active/);
  await expect(page.getByRole("table", { name: "模型状态列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "模型能力", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "模型路由策略", exact: true })).toBeVisible();
  const modelSummary = page.getByRole("complementary", { name: "模型概览" });
  await expect(modelSummary).toBeVisible();
  await expect(modelSummary.locator("dl > div")).toHaveCount(7);
  const summaryBox = await modelSummary.boundingBox();
  const listBox = await page.locator(".sino-model-list-pane").boundingBox();
  expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(listBox.y);
  expect(listBox.width).toBeGreaterThan(1300);
  await expect(page.getByRole("table", { name: "模型状态列表" }).locator("button[aria-pressed]")).toHaveCount(10);
  await page.screenshot({ path: `${evidenceDirectory}/settings-models-full-width.png`, fullPage: true });
  const settingsScroll = page.locator(".sino-settings");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    expect(await settingsScroll.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "deepseek-chat DeepSeek" }).click();
  await expect(inspector).toBeVisible();
  const settingsPageBox = await page.locator(".sino-founder-asset-page").boundingBox();
  const inspectorBox = await inspector.boundingBox();
  expect(settingsPageBox.x + settingsPageBox.width).toBeLessThanOrEqual(inspectorBox.x);
  await expect(inspector.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  for (const section of ["当前模型", "Provider 连接", "Provider 模型管理", "Provider 端点", "连接测试"]) await expect(inspector.getByRole("heading", { name: section, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Claude Sonnet 5 Claude" }).click();
  await expect(inspector.getByText("Claude Sonnet 5", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "GPT 5 Pro GPT" }).click();
  await expect(inspector.getByText("GPT 5 Pro", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-inspector-selected.png`, fullPage: true });

  await page.getByRole("button", { name: "Sino AI" }).click();
  await expect(inspector).toHaveCount(0);
  await settingsTabs.getByRole("button", { name: "模型" }).click();
  await expect(inspector).toHaveCount(0);

  await settingsTabs.getByRole("button", { name: "Sino AI" }).click();
  await expect(page.getByRole("region", { name: "Sino AI" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Sino 核心" })).toBeVisible();
  await expect(page.getByRole("region", { name: "多模型讨论" })).toBeVisible();
  await expect(page.getByText("自动多轮", { exact: true })).toHaveCount(0);
  await expect(inspector).toHaveCount(0);
  await expect(page.getByText("设置上下文")).toHaveCount(0);
  await page.getByRole("region", { name: "Sino 核心" }).getByRole("button").click();
  await expect(inspector).toBeVisible();
  expect(await settingsScroll.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  await page.screenshot({ path: `${evidenceDirectory}/settings-sino-ai.png`, fullPage: true });

  await settingsTabs.getByRole("button", { name: "执行与运行" }).click();
  await expect(page.getByRole("region", { name: "执行与运行" })).toBeVisible();
  await expect(page.getByRole("region", { name: "执行器" })).toBeVisible();
  await expect(page.getByRole("region", { name: "运行环境" })).toBeVisible();
  await expect(inspector).toHaveCount(0);
  await page.getByRole("region", { name: "执行器" }).getByRole("button").click();
  await expect(inspector).toBeVisible();
  await expect(page.getByText("NAS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("商业云", { exact: true })).toHaveCount(0);
  await expect(page.getByText("未接入 Runtime", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-execution-runtime.png`, fullPage: true });

  await page.getByRole("button", { name: "⬅️ 返回首页" }).click();
  await expect(page.getByLabel("Founder Navigation")).toBeVisible();
  await expect(page.getByRole("main", { name: "Sino Natural Conversation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "执行中心" })).toBeVisible();
  await expect(page.getByText("新讨论", { exact: true })).toHaveCount(0);
});
