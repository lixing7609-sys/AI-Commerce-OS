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
    const usageSummaryBox = await page.getByLabel("已分配模型摘要").boundingBox();
    const modelTitleBox = await page.getByRole("heading", { name: "模型", exact: true }).boundingBox();
    const modelSummaryBox = await page.getByLabel("模型摘要", { exact: true }).boundingBox();
    for (const box of [usageBox, modelBox]) {
      expect(Math.abs(box.x - 100)).toBeLessThanOrEqual(2);
      expect(Math.abs(viewport.width - box.x - box.width - 100)).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(usageBox.x - modelBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x - sinoBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(viewport.width - systemBox.x - systemBox.width - 100)).toBeLessThanOrEqual(2);
    expect(Math.abs(sinoBox.width - systemBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(systemBox.x - sinoBox.x - sinoBox.width - 18)).toBeLessThanOrEqual(2);
    expect(Math.abs(sinoBox.y - systemBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x - homeBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.x + usageBox.width - titleBox.x - titleBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageBox.width - modelBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(usageTitleBox.y + usageTitleBox.height - usageSummaryBox.y - usageSummaryBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(modelTitleBox.y + modelTitleBox.height - modelSummaryBox.y - modelSummaryBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(usageSummaryBox.x - usageTitleBox.x - usageTitleBox.width - 16)).toBeLessThanOrEqual(2);
    expect(Math.abs(modelSummaryBox.x - modelTitleBox.x - modelTitleBox.width - 16)).toBeLessThanOrEqual(2);
    expect(modelBox.y).toBeLessThan(sinoBox.y);
    expect(sinoBox.y).toBeLessThan(usageBox.y);
    const modelCardLayout = await page.getByRole("list", { name: "已接入模型列表" }).locator("article").evaluateAll((items) => {
      const rows = [...new Set(items.map((item) => Math.round(item.getBoundingClientRect().top)))];
      return { rows, firstRowCount: items.filter((item) => Math.round(item.getBoundingClientRect().top) === rows[0]).length };
    });
    expect(modelCardLayout.firstRowCount).toBe(5);
    expect(modelCardLayout.rows.length).toBeGreaterThanOrEqual(2);
    expect(modelCardLayout.rows.length).toBeLessThanOrEqual(3);
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
  expect(Math.abs(initialInspectorBox.width - 1100)).toBeLessThanOrEqual(2);
  expect(Math.abs(initialInspectorBox.height - 700)).toBeLessThanOrEqual(2);
  expect(Math.abs(initialInspectorBox.x + initialInspectorBox.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(Math.abs(initialInspectorBox.y + initialInspectorBox.height / 2 - 450)).toBeLessThanOrEqual(2);
  const showAllModels = inspector.getByRole("button", { name: /查看全部 \d+ 个模型/ });
  if (await showAllModels.count()) {
    await showAllModels.click();
    expect(await inspector.boundingBox()).toMatchObject({ width: 1100, height: 700 });
    await expect(inspector.locator(".sino-provider-model-management .sino-model-choices")).toHaveCSS("overflow-y", "auto");
  }
  await page.screenshot({ path: `${evidence}/settings-provider-inspector-1440x900.png`, fullPage: true });
  for (const viewport of [{ width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    const inspectorBox = await inspector.boundingBox();
    expect(Math.abs(inspectorBox.width - 1100)).toBeLessThanOrEqual(2);
    expect(Math.abs(inspectorBox.height - 700)).toBeLessThanOrEqual(2);
    expect(Math.abs(inspectorBox.x + inspectorBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(inspectorBox.y + inspectorBox.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-provider-inspector-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1000, height: 680 });
  const compactInspectorBox = await inspector.boundingBox();
  expect(Math.abs(compactInspectorBox.width - 952)).toBeLessThanOrEqual(2);
  expect(Math.abs(compactInspectorBox.height - 632)).toBeLessThanOrEqual(2);
  expect(await inspector.locator(":scope > article").evaluate((body) => getComputedStyle(body).overflowY)).toBe("hidden");
  expect(await inspector.locator(".sino-provider-model-management .sino-model-choices").evaluate((list) => getComputedStyle(list).overflowY)).toBe("auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await inspector.getByRole("button", { name: "关闭 Provider 技术配置" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const providerName of [/ Claude$/, / DeepSeek Official$/, / GPT$/, / OfoxAI$/]) {
    await page.getByRole("list", { name: "已接入模型列表" }).getByRole("button", { name: providerName }).first().click();
    const providerModal = page.getByRole("dialog", { name: "Provider 技术配置" });
    await expect(providerModal.getByRole("heading", { name: "概览与连接控制" })).toBeVisible();
    await expect(providerModal.getByRole("heading", { name: "模型管理" })).toBeVisible();
    await expect(providerModal.locator(".sino-settings-provider-inspector > section")).toHaveCount(2);
    await expect(providerModal.locator(".sino-settings-inspector-card")).toHaveCount(0);
    const providerModelGrid = providerModal.locator(".sino-provider-model-card-grid");
    await expect(providerModelGrid).toHaveCSS("display", "grid");
    expect((await providerModelGrid.evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length))).toBe(4);
    await expect(providerModelGrid.getByText("Sino 对话", { exact: true })).toHaveCount(0);
    await expect(providerModelGrid.getByText("项目分析", { exact: true })).toHaveCount(0);
    await expect(providerModelGrid.getByText("系统构建", { exact: true })).toHaveCount(0);
    await expect(providerModal.locator(".sino-provider-summary-row")).toHaveCount(2);
    const currentModelRow = providerModal.locator(".sino-provider-summary-row--identity");
    await expect(currentModelRow.getByText("Provider", { exact: true })).toBeVisible();
    await expect(currentModelRow.getByText("Base URL", { exact: true })).toBeVisible();
    const baseUrlValue = currentModelRow.locator(".sino-provider-endpoint-summary > span").last();
    const refreshModelsButton = providerModal.getByRole("button", { name: "刷新模型" });
    expect(Math.abs((await baseUrlValue.boundingBox()).x + (await baseUrlValue.boundingBox()).width - ((await refreshModelsButton.boundingBox()).x + (await refreshModelsButton.boundingBox()).width))).toBeLessThanOrEqual(2);
    await expect(currentModelRow.locator("small, em")).toHaveCount(0);
    await expect(providerModal.locator(".sino-provider-model-management em").first()).toBeVisible();
    await expect(providerModal.getByText("状态", { exact: true })).toHaveCount(0);
    const actionRow = providerModal.locator(".sino-provider-summary-row--actions");
    await expect(actionRow.getByRole("button", { name: "更新 API Key" })).toBeVisible();
    await expect(actionRow.getByRole("button", { name: "测试连接" })).toBeVisible();
    await providerModal.getByRole("button", { name: "关闭 Provider 技术配置" }).click();
  }

  await page.getByRole("button", { name: "打开Sino AI" }).click();
  await expect(page.getByRole("dialog", { name: "Sino AI" })).toBeVisible();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByRole("region", { name: "模型分配" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Primary" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sino 主对话 Fallback" })).toBeVisible();
  const conversationFallback = page.getByRole("combobox", { name: "Sino 主对话 Fallback" });
  if ((await conversationFallback.inputValue()) === "") {
    await expect(page.getByLabel("Sino 主对话 Fallback 状态")).toHaveText("● 未配置");
    await expect(page.getByLabel("Sino 主对话 Assignment 状态")).toHaveText("● 正常");
  }
  const visionPrimary = page.getByRole("combobox", { name: "Vision Primary" });
  const selectedVisionOption = visionPrimary.locator("option:checked");
  if ((await visionPrimary.inputValue()) === "gpt::gpt-5-pro") {
    await expect(selectedVisionOption).toContainText("能力不匹配");
    expect(await selectedVisionOption.getAttribute("disabled")).not.toBeNull();
    await expect(page.getByLabel("Vision Primary 状态")).toHaveText("● 配置错误");
  }
  await expectMinimumVisibleFont(page.getByRole("dialog", { name: "Sino AI" }));
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1512, height: 982 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: `${evidence}/settings-sino-ai-${viewport.width}x${viewport.height}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let index = 1; index <= 5; index += 1) {
    await expect(page.getByRole("combobox", { name: `讨论模型 ${index} Primary` })).toBeVisible();
    await expect(page.getByLabel(`讨论模型 ${index} Fallback 状态`)).toBeVisible();
    await expect(page.getByLabel(`讨论模型 ${index} Assignment 状态`)).toBeVisible();
  }
  await expect(page.locator(".sino-discussion-chips")).toHaveCount(0);
  await page.screenshot({ path: `${evidence}/settings-model-assignment-slots-1440x900.png`, fullPage: true });
  await page.getByRole("button", { name: "关闭Sino AI" }).click();
  await page.getByRole("button", { name: "打开系统" }).click();
  await expect(page.getByRole("dialog", { name: "系统" })).toBeVisible();
  await expectMinimumVisibleFont(page.getByRole("dialog", { name: "系统" }));
  await expect(inspector).toHaveCount(0);
  await expect(page.getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.getByText(/services healthy/)).toBeVisible();
  await page.screenshot({ path: `${evidence}/settings-system-1440x900.png`, fullPage: true });
});
