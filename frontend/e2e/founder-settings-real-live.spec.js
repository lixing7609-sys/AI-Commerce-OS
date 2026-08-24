import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidence = "../.runtime/visual-evidence/settings-resilience";

test("real Settings keeps model control, Provider inspector, and compact system health", async ({ page }) => {
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const tabs = page.getByRole("navigation", { name: "设置分类" });
  await expect(tabs.getByRole("button")).toHaveCount(1);
  await expect(tabs.getByRole("button", { name: "模型" })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "Sino AI" })).toHaveCount(0);
  await expect(tabs.getByRole("button", { name: "系统" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型分配" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Usage 与成本" })).toBeVisible();
  await expect(page.getByLabel("功能页详情")).toHaveCount(0);
  const firstModel = page.getByRole("list", { name: "已接入模型列表" }).locator("button[aria-pressed]").first();
  await expect(firstModel).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-model-control-1440x900.png`, fullPage: true });
  for (const viewport of [{ width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("list", { name: "已接入模型列表" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-model-control-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await firstModel.click();
  const inspector = page.getByRole("dialog", { name: "Provider 技术配置" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "测试连接" })).toBeVisible();
  const initialInspectorBox = await inspector.boundingBox();
  expect(initialInspectorBox.width).toBeLessThanOrEqual(820);
  expect(Math.abs(initialInspectorBox.x + initialInspectorBox.width / 2 - 720)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${evidence}/settings-provider-inspector-1440x900.png`, fullPage: true });
  for (const viewport of [{ width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    const inspectorBox = await inspector.boundingBox();
    expect(inspectorBox.width).toBeLessThanOrEqual(820);
    expect(Math.abs(inspectorBox.x + inspectorBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-provider-inspector-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await inspector.getByRole("button", { name: "关闭 Provider 技术配置" }).click();

  await page.getByRole("button", { name: "打开Sino AI" }).click();
  await expect(page.getByRole("dialog", { name: "Sino AI" })).toBeVisible();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型分配" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Primary" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Fallback" })).toBeVisible();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-sino-ai-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "选择参与模型" }).click();
  await expect(page.getByRole("group", { name: "参与模型选项" })).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-model-assignment-multiselect-1440x900.png`, fullPage: true });
  await page.getByRole("button", { name: "选择参与模型" }).click();
  await page.getByRole("button", { name: "关闭Sino AI" }).click();
  await page.getByRole("button", { name: "打开系统" }).click();
  await expect(page.getByRole("dialog", { name: "系统" })).toBeVisible();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByText(/services healthy/)).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-system-1440x900.png`, fullPage: true });
});
