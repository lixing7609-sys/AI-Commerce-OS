import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidenceDirectory = "../.runtime/visual-evidence/settings-workspace";
const provider = {
  provider_key: "deepseek", provider_type: "deepseek", display_name: "DeepSeek", installed: true,
  enabled: true, health_status: "healthy", api_key_mask: "****1234", base_url: "https://api.deepseek.com/v1",
  available_models: [{ model_id: "deepseek-chat", display_name: "deepseek-chat", recommendation_score: 90 }],
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
    routing_policies: [],
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
  await expect(page.getByText("Sino Founder AI 系统配置")).toBeVisible();
  await expect(page.getByRole("heading", { name: "模型能力" })).toBeVisible();
  await expect(page.getByText("Model Capabilities")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "运行环境" })).toBeVisible();
  await expect(page.getByText("deepseek-chat", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/settings-expanded.png`, fullPage: true });

  await page.getByRole("button", { name: "关闭设置" }).click();
  await expect(page.getByLabel("Founder Navigation")).toBeVisible();
  await expect(page.getByRole("main", { name: "Sino Natural Conversation" })).toBeVisible();
});
