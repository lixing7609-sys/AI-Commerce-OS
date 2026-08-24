import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidence = "../.runtime/visual-evidence/settings-resilience";

test("real Settings keeps model control, Provider inspector, and compact system health", async ({ page }) => {
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const tabs = page.getByRole("navigation", { name: "设置分类" });
  await expect(tabs.getByRole("button")).toHaveCount(3);
  await expect(tabs.getByRole("button", { name: "模型" })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "Sino AI" })).toBeVisible();
  await expect(tabs.getByRole("button", { name: "系统" })).toBeVisible();
  await expect(page.getByRole("region", { name: "模型分配" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Usage 与成本" })).toBeVisible();
  const inspector = page.getByLabel("功能页详情");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("请选择一个模型")).toBeVisible();
  await expect(inspector.getByRole("button", { name: "关闭设置并返回 Sino 首页" })).toHaveCount(0);
  const firstModel = page.getByRole("list", { name: "已接入模型列表" }).locator("button").first();
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
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("Provider 技术配置")).toBeVisible();
  await expect(inspector.getByRole("button", { name: "测试连接" })).toBeVisible();
  const initialInspectorBox = await inspector.boundingBox();
  expect(initialInspectorBox.width).toBeGreaterThanOrEqual(431);
  expect(initialInspectorBox.width).toBeLessThanOrEqual(433);
  await page.screenshot({ path: `${evidence}/settings-provider-inspector-1440x900.png`, fullPage: true });
  for (const viewport of [{ width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    const inspectorBox = await inspector.boundingBox();
    const mainBox = await page.getByRole("main", { name: "Founder AI 功能页面" }).boundingBox();
    const expectedWidth = Math.min(500, Math.max(360, viewport.width * .3));
    expect(Math.abs(inspectorBox.width - expectedWidth)).toBeLessThanOrEqual(2);
    expect(inspectorBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-provider-inspector-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }

  await tabs.getByRole("button", { name: "Sino AI" }).click();
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
  await tabs.getByRole("button", { name: "系统" }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByText(/services healthy/)).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-system-1440x900.png`, fullPage: true });
});
