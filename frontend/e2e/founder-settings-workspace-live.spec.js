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

test("Settings exposes model control and system health with the real Provider inspector", async ({ page }) => {
  mkdirSync(evidenceDirectory, { recursive: true });
  let liveCenter = structuredClone(center);
  await page.route("**/api/v1/founder-ai/model-center", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveCenter) }));
  await page.route("**/api/v1/founder-ai/model-center/capabilities/*", async (route) => {
    const capability = route.request().url().split("/").at(-1);
    const body = route.request().postDataJSON();
    liveCenter = { ...liveCenter, roles: liveCenter.roles.map((item) => item.role_key === capability ? { ...item, provider_key: body.provider_key, model: body.model, fallbacks: body.fallbacks || [] } : item) };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveCenter) });
  });
  await page.route("**/api/v1/founder-ai/model-center/capabilities/multi-model-discussion", async (route) => {
    const slots = route.request().postDataJSON().slots;
    const models = slots.flatMap((slot) => slot.primary ? [slot.primary] : []);
    liveCenter = { ...liveCenter, roles: liveCenter.roles.map((item) => item.role_key === "multi_model_discussion" ? { ...item, slots, models } : item) };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(liveCenter) });
  });
  await page.route("**/api/v1/founder-ai/runtime-environments", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(runtime) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();

  await expect(page.getByLabel("Founder Navigation")).toHaveCount(0);
  const settings = page.getByRole("main", { name: "Founder AI 功能页面" });
  await expect(settings).toBeVisible();
  await expect(page.getByLabel("功能页详情")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Provider 技术配置" })).toHaveCount(0);
  expect((await settings.boundingBox()).x).toBeLessThan(4);
  expect((await settings.boundingBox()).width).toBeGreaterThan(1430);
  await expect(page.getByText("Model Capabilities")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "设置分类" })).toHaveCount(0);
  await expect(page.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "模型", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "已接入模型列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "模型分配" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "用量与成本" })).toBeVisible();
  expect((await page.getByRole("region", { name: "用量与成本" }).boundingBox()).y).toBeLessThan((await page.getByRole("list", { name: "已接入模型列表" }).boundingBox()).y);
  await expect(page.getByText(/10 个模型 · 10 正常/)).toBeVisible();
  await expect(page.getByRole("list", { name: "已接入模型列表" }).locator("button[aria-pressed]")).toHaveCount(10);
  await expect(page.getByRole("list", { name: "已接入模型列表" }).locator('[role="listitem"]').last().getByRole("button", { name: "＋ 添加模型" })).toBeVisible();
  const sinoEntry = page.getByRole("button", { name: "打开Sino AI" });
  const systemEntry = page.getByRole("button", { name: "打开系统" });
  await expect(sinoEntry).toBeVisible();
  await expect(systemEntry).toBeVisible();
  expect((await sinoEntry.boundingBox()).y).toBeGreaterThan((await page.getByRole("list", { name: "已接入模型列表" }).boundingBox()).y);
  expect(Math.abs((await systemEntry.boundingBox()).y - (await sinoEntry.boundingBox()).y)).toBeLessThanOrEqual(1);
  expect(Math.abs((await systemEntry.boundingBox()).width - (await sinoEntry.boundingBox()).width)).toBeLessThanOrEqual(1);
  expect(Math.abs((await systemEntry.boundingBox()).height - (await sinoEntry.boundingBox()).height)).toBeLessThanOrEqual(1);
  await expect(page.locator(".sino-model-list-heading").getByRole("button", { name: "＋ 添加模型" })).toHaveCount(0);
  await page.getByRole("button", { name: "＋ 添加模型" }).click();
  await expect(page.getByRole("dialog", { name: "添加 AI 模型" })).toBeVisible();
  expect(await page.getByRole("dialog", { name: "添加 AI 模型" }).boundingBox()).toMatchObject({ width: 1100, height: 700 });
  expect(await page.getByRole("dialog", { name: "添加 AI 模型" }).locator("nav").evaluate((nav) => parseFloat(getComputedStyle(nav).fontSize))).toBeGreaterThanOrEqual(14);
  await expect(page.getByRole("dialog", { name: "Provider 技术配置" })).toHaveCount(0);
  await page.getByRole("button", { name: "关闭添加 AI 模型" }).click();
  await expect(page.getByRole("dialog", { name: "添加 AI 模型" })).toHaveCount(0);
  await page.screenshot({ path: `${evidenceDirectory}/settings-models-full-width.png`, fullPage: true });
  const settingsScroll = page.locator(".sino-settings");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    expect(await settingsScroll.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "deepseek-chat DeepSeek" }).click();
  let providerDialog = page.getByRole("dialog", { name: "Provider 技术配置" });
  await expect(providerDialog).toBeVisible();
  expect(await providerDialog.boundingBox()).toMatchObject({ width: 1100, height: 700 });
  await expect(page.getByRole("dialog", { name: "添加 AI 模型" })).toHaveCount(0);
  await expect(providerDialog.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  for (const section of ["当前模型", "Provider 连接", "Provider 模型管理", "Provider 端点", "连接测试"]) await expect(providerDialog.getByRole("heading", { name: section, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(providerDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "deepseek-chat DeepSeek" })).toBeFocused();
  await page.getByRole("button", { name: "Claude Sonnet 5 Claude" }).click();
  providerDialog = page.getByRole("dialog", { name: "Provider 技术配置" });
  await expect(providerDialog.getByText("Claude Sonnet 5", { exact: true }).first()).toBeVisible();
  await providerDialog.getByRole("button", { name: "关闭 Provider 技术配置" }).click();
  await page.getByRole("button", { name: "GPT 5 Pro GPT" }).click();
  providerDialog = page.getByRole("dialog", { name: "Provider 技术配置" });
  await expect(providerDialog.getByText("GPT 5 Pro", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-model-inspector-selected.png`, fullPage: true });
  await providerDialog.getByRole("button", { name: "关闭 Provider 技术配置" }).click();

  await sinoEntry.click();
  await expect(page.getByRole("dialog", { name: "Sino AI" })).toBeVisible();
  expect(await page.getByRole("dialog", { name: "Sino AI" }).boundingBox()).toMatchObject({ width: 1100, height: 700 });
  await expect(page.getByRole("dialog", { name: "Provider 技术配置" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型分配" })).toBeVisible();
  await expect(page.getByRole("list", { name: "已接入模型列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "用量与成本" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Primary" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Fallback" })).toBeVisible();
  await page.getByRole("combobox", { name: "Sino 主对话 Fallback" }).selectOption("claude::claude-sonnet-5");
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Fallback" })).toHaveValue("claude::claude-sonnet-5");
  await page.reload();
  await page.getByRole("button", { name: "打开Sino AI" }).click();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Fallback" })).toHaveValue("claude::claude-sonnet-5");
  await expect(page.getByRole("combobox", { name: "Vision Primary" }).locator("xpath=ancestor::div[contains(@class,'sino-model-assignment-row')]")).toContainText("未配置");
  const codingRow = page.getByRole("combobox", { name: "Coding Primary" }).locator("xpath=ancestor::div[contains(@class,'sino-model-assignment-row')]");
  await expect(codingRow).not.toContainText("Codex");
  for (let index = 1; index <= 5; index += 1) await expect(page.getByRole("combobox", { name: `讨论模型 ${index} Primary` })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "讨论模型 1 Primary" })).toHaveValue("deepseek::deepseek-chat");
  await page.getByRole("combobox", { name: "讨论模型 2 Primary" }).selectOption("claude::claude-sonnet-5");
  await page.getByRole("combobox", { name: "讨论模型 2 Fallback" }).selectOption("gpt::gpt-5-pro");
  await page.reload();
  await page.getByRole("button", { name: "打开Sino AI" }).click();
  await expect(page.getByRole("combobox", { name: "讨论模型 2 Primary" })).toHaveValue("claude::claude-sonnet-5");
  await expect(page.getByRole("combobox", { name: "讨论模型 2 Fallback" })).toHaveValue("gpt::gpt-5-pro");
  await page.screenshot({ path: `${evidenceDirectory}/settings-sino-ai-assignment.png`, fullPage: true });

  await page.getByRole("button", { name: "关闭Sino AI" }).click();
  await page.getByRole("button", { name: "打开系统" }).click();
  await expect(page.getByRole("dialog", { name: "系统" })).toBeVisible();
  expect(await page.getByRole("dialog", { name: "系统" }).boundingBox()).toMatchObject({ width: 1100, height: 700 });
  await expect(page.getByRole("region", { name: "执行器" })).toBeVisible();
  await expect(page.getByRole("region", { name: "运行环境" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Provider 技术配置" })).toHaveCount(0);
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "执行引擎" })).toHaveCount(0);
  await expect(page.getByText("5/5 services healthy")).toBeVisible();
  await expect(page.getByText("http://127.0.0.1:5173")).toHaveCount(0);
  await page.getByRole("button", { name: "查看详情" }).click();
  await expect(page.getByText("http://127.0.0.1:5173")).toBeVisible();
  await expect(page.getByText("NAS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("商业云", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/执行系统模型尚未接入 Runtime/)).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-execution-runtime.png`, fullPage: true });

  await page.getByRole("button", { name: "关闭系统" }).click();
  await page.getByRole("button", { name: "← 返回首页" }).click();
  await expect(page.getByLabel("Founder Navigation")).toBeVisible();
  await expect(page.getByRole("main", { name: "Sino Natural Conversation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "执行中心" })).toBeVisible();
  await expect(page.getByText("新讨论", { exact: true })).toHaveCount(0);
});
