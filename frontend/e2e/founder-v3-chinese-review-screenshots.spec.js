import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Founder Master Edition V1.0 中文框架审查版 —— 全部 51 个可见页面的
 * 逐页截图存档，供产品负责人离线核对（docs/product-review/§七
 * "浏览器逐页检查"的截图目录部分）。一次性截图工具，不是常规回归
 * 测试，同 founder-v3-batch2-screenshots.spec.js 一个惯例。
 */
const OUT_DIR = path.join("..", "docs", "product-review", "screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

function chevronFor(page, name) {
  return page.getByRole("button", { name: new RegExp(`^(展开|收起)${name}$`) });
}

const FOUNDER_WORKSPACE_ITEMS = ["今日总览", "决策中心", "开发进度", "经营验证", "内容验证", "云端状态", "风险中心", "通知中心"];
const AI_CAPABILITY_CENTER_ITEMS = ["Prompt 中心", "Skill 中心", "Workflow 中心", "知识中心", "Connector 中心", "能力中心"];
const OPERATOR_LAB_ITEMS = [
  "经营工作台", "商品中心", "订单中心", "客户中心", "客服中心", "营销中心", "广告投放",
  "品牌中心", "Operator 秘书", "数据中心", "财务与利润", "组织与审批", "经营设置",
];
const STUDIO_LAB_ITEMS = [
  "Studio 工作台", "AI 短剧", "AI 视频", "AI 图片", "AI 文章", "AI 直播", "AI 音频",
  "矩阵账号", "发布中心", "素材库", "品牌资产", "内容数据", "Studio 设置",
];
const CLOUD_CENTER_ITEMS = ["设备管理", "OTA 更新", "许可证", "Token 中心", "Marketplace", "版本管理", "资产管理", "节点调度", "系统监控", "日志中心"];

test("Founder Master Edition V1.0 中文框架审查版 — 51 页截图存档", async ({ page }) => {
  test.setTimeout(180000);
  let n = 1;

  await page.goto("/founder");
  for (const label of FOUNDER_WORKSPACE_ITEMS) {
    await page.locator(".fdr-sidebar__item", { hasText: label }).first().click();
    await shot(page, `${String(n++).padStart(2, "0")}-founder工作台-${label}`);
  }

  await page.getByRole("button", { name: "AI 能力中心", exact: true }).click();
  await shot(page, `${String(n++).padStart(2, "0")}-AI能力中心-Agent中心`);
  for (const label of AI_CAPABILITY_CENTER_ITEMS) {
    await page.locator(".fdr-sidebar__item", { hasText: label }).click();
    await shot(page, `${String(n++).padStart(2, "0")}-AI能力中心-${label}`);
  }

  await chevronFor(page, "Operator 实验室").click();
  for (const label of OPERATOR_LAB_ITEMS) {
    await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
    await page.waitForTimeout(150);
    await shot(page, `${String(n++).padStart(2, "0")}-Operator实验室-${label}`);
  }

  await chevronFor(page, "Studio 实验室").click();
  for (const label of STUDIO_LAB_ITEMS) {
    await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
    await page.waitForTimeout(150);
    await shot(page, `${String(n++).padStart(2, "0")}-Studio实验室-${label}`);
  }

  await page.getByRole("button", { name: "Cloud Center", exact: true }).click();
  for (const label of CLOUD_CENTER_ITEMS) {
    await page.locator(".fdr-sidebar__item, .fdr-sidebar__subitem", { hasText: label }).first().click();
    await page.waitForTimeout(150);
    await shot(page, `${String(n++).padStart(2, "0")}-CloudCenter-${label}`);
  }

  await page.goto("/founder?module=productReview");
  await shot(page, `${String(n++).padStart(2, "0")}-产品审查`);

  console.log("SCREENSHOTS_DONE", n - 1, "pages captured");
});
