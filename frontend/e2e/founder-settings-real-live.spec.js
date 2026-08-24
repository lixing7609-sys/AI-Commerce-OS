import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidence = "../.runtime/visual-evidence/settings-resilience";

async function expectMinimumVisibleFont(locator) {
  const undersized = await locator.evaluate((root) => [...root.querySelectorAll("*")].filter((element) => {
    const style = getComputedStyle(element);
    const hasDirectText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    return hasDirectText && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length && parseFloat(style.fontSize) < 14;
  }).map((element) => ({ text: element.textContent.trim().slice(0, 80), size: getComputedStyle(element).fontSize })));
  expect(undersized).toEqual([]);
}

test("real Settings keeps model control, Provider inspector, and compact system health", async ({ page }) => {
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "设置分类" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型分配" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "用量与成本" })).toBeVisible();
  await expect(page.getByLabel("功能页详情")).toHaveCount(0);
  const firstModel = page.getByRole("list", { name: "已接入模型列表" }).locator("button[aria-pressed]").first();
  await expect(firstModel).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-model-control-1440x900.png`, fullPage: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    const usageBox = await page.getByRole("region", { name: "用量与成本" }).boundingBox();
    const modelBox = await page.getByRole("list", { name: "已接入模型列表" }).boundingBox();
    const sinoBox = await page.getByRole("region", { name: "Sino AI" }).boundingBox();
    const systemBox = await page.getByRole("region", { name: "系统" }).boundingBox();
    const homeBox = await page.getByRole("button", { name: "← 返回首页" }).boundingBox();
    const titleBox = await page.getByRole("heading", { name: "设置" }).boundingBox();
    const usageTitleBox = await page.getByRole("heading", { name: "用量与成本" }).boundingBox();
    const usageSummaryBox = await page.getByText("部分 Provider 已接入统计", { exact: true }).boundingBox();
    const modelTitleBox = await page.getByRole("heading", { name: "模型", exact: true }).boundingBox();
    const modelSummaryBox = await page.getByLabel("模型摘要").boundingBox();
    for (const box of [usageBox, modelBox, sinoBox, systemBox]) {
      expect(Math.abs(box.x - 100)).toBeLessThanOrEqual(2);
      expect(Math.abs(viewport.width - box.x - box.width - 100)).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(usageBox.x - modelBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x - sinoBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x - systemBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x - homeBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x + usageBox.width - titleBox.x - titleBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.width - modelBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.width - sinoBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.width - systemBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageTitleBox.y + usageTitleBox.height - usageSummaryBox.y - usageSummaryBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(modelTitleBox.y + modelTitleBox.height - modelSummaryBox.y - modelSummaryBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(usageSummaryBox.x - usageTitleBox.x - usageTitleBox.width - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(modelSummaryBox.x - modelTitleBox.x - modelTitleBox.width - 16)).toBeLessThanOrEqual(2);
    const modelCardRows = await page.getByRole("list", { name: "已接入模型列表" }).locator("article").evaluateAll((items) => [...new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)))]);
    expect(modelCardRows).toHaveLength(2);
    await expectMinimumVisibleFont(page.locator(".sino-settings-workspace"));
    const featureHeights = await page.locator(".sino-settings-feature-section > button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(featureHeights.every((height) => height <= 60)).toBe(true);
    await expect(page.getByRole("button", { name: "打开Sino AI" }).getByText("Sino AI", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "打开系统" }).getByText("系统", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-model-control-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await firstModel.click();
  const inspector = page.getByRole("dialog", { name: "Provider 技术配置" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("button", { name: "测试连接" })).toBeVisible();
  await expectMinimumVisibleFont(inspector);
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
  await expectMinimumVisibleFont(page.getByRole("dialog", { name: "Sino AI" }));
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
  await expectMinimumVisibleFont(page.getByRole("dialog", { name: "系统" }));
  await expect(inspector).toHaveCount(0);
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByText(/services healthy/)).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-system-1440x900.png`, fullPage: true });
});
