import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidenceDirectory = "../.runtime/visual-evidence/library-workspace";
const updatedAt = "2026-08-21T08:00:00Z";

const lifecycleAssets = [
  ["agent-1", "agent", "Sino AI Secretary", "协调 Founder 讨论与行动"],
  ["skill-1", "skill", "Capability Search", "查找可复用能力"],
  ["workflow-1", "workflow", "Founder Delivery Flow", "组织交付阶段"],
  ["prompt-1", "prompt", "Founder Discussion Prompt", "支持自然讨论"],
  ["capability-1", "capability", "Conversation Intelligence", "理解讨论上下文"],
].map(([asset_id, asset_type, name, purpose]) => ({ asset_id, asset_type, name, purpose, version: 1, updated_at: updatedAt }));

const artifacts = [
  { artifact_id: "image-1", artifact_type: "image/png", title: "Founder Workspace Preview", summary: "Workspace 视觉成果", version: 1, updated_at: updatedAt },
  { artifact_id: "document-1", artifact_type: "document", title: "Runtime Environment Proposal v3", summary: "运行环境提案", version: 3, updated_at: updatedAt },
];

async function installIsolatedLibraryFixtures(page) {
  await page.route("**/api/v1/founder-ai/asset-lifecycle/assets*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ assets: lifecycleAssets }),
  }));
  await page.route("**/api/v1/founder-ai/asset-memory-center", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ artifacts, memories: [], executions: [] }),
  }));
}

test("Library browses and filters real asset shapes without occupying the execution column", async ({ page }) => {
  mkdirSync(evidenceDirectory, { recursive: true });
  await installIsolatedLibraryFixtures(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "库", exact: true }).click();
  const library = page.getByRole("main", { name: "Sino Library Workspace" });
  await expect(library).toBeVisible();
  await expect(page.getByRole("complementary", { name: "执行中心" })).toHaveCount(0);
  await expect(page.locator(".sino-global-composer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sino AI · 选择模型/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "库资产分类" }).getByRole("button")).toHaveText([
    "全部", "Agent", "Skill", "Workflow", "Prompt", "Capability", "图片", "文档",
  ]);
  await expect(page.locator(".sino-library-card")).toHaveCount(7);
  const libraryBox = await library.boundingBox();
  expect(libraryBox.x + libraryBox.width).toBeGreaterThan(1420);
  await page.screenshot({ path: `${evidenceDirectory}/library-all.png`, fullPage: true });

  await page.getByRole("button", { name: "Agent", exact: true }).click();
  await expect(page.locator(".sino-library-card")).toHaveCount(1);
  await expect(page.locator(".sino-library-card")).toHaveAttribute("data-asset-type", "agent");
  await page.screenshot({ path: `${evidenceDirectory}/library-agent.png`, fullPage: true });

  await page.getByRole("button", { name: "Sino AI", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "执行中心" })).toBeVisible();
  await expect(page.locator(".sino-global-composer")).toBeVisible();
  await page.screenshot({ path: `${evidenceDirectory}/library-return-sino.png`, fullPage: true });
});
