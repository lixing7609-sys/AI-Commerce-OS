import { test, expect } from "@playwright/test";

/**
 * Founder Master Edition V1.0 中文框架审查版 —— 全部 51 个可见页面的
 * 浏览器逐页检查（原本 Founder v3 full crawl 的中文命名重写版，见
 * docs/product-review/Founder_Master_Edition_Chinese_Framework_Review.md）。
 *
 * 断言：点击成功、无控制台/页面错误、内容非空、无占位文案
 * （"即将上线"/"Coming Soon"等）、无明显未翻译英文残留、顶部有
 * "演示框架"标识。这是本轮审查要求（六、七、八节）里"浏览器逐页
 * 检查"和"不出现明显未翻译界面文案测试"的落地。
 */

const PLACEHOLDER_STRINGS = ["即将上线", "敬请期待", "尚未开放", "建设中", "Coming Soon", "coming soon"];

// 产品要求明确保留的英文品牌名/技术缩写/术语。
const ALLOWED_ENGLISH_TOKENS = [
  "AI", "Commerce", "OS", "Founder", "Operator", "Studio", "Cloud", "Center",
  "API", "OTA", "Token", "NAS", "SKU", "GMV", "ROI",
  "Agent", "Agents", "Prompt", "Skill", "Workflow", "Connector", "Marketplace", "IP",
];

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

function chevronFor(page, name) {
  return page.getByRole("button", { name: new RegExp(`^(展开|收起)${name}$`) });
}

async function assertNoLeftoverEnglish(page, label) {
  const bodyText = await page.locator(".fdr-content").innerText();
  let stripped = bodyText;
  for (const token of ALLOWED_ENGLISH_TOKENS) {
    stripped = stripped.replaceAll(token, "");
  }
  // 大段拉丁字母连续出现（如整句英文）判定为遗留英文；不逐字符扫描
  // 避免误伤演示数据里可能出现的英文人名/店铺名/域名片段（比如
  // 一个海外风格的演示店铺名"Chenxing Home US"只有 3 个词，要求至少
  // 5 个连续词才判定为"疑似整句英文 UI 文案"）。
  const match = stripped.match(/[A-Za-z]{4,}(\s+[A-Za-z]{2,}){4,}/);
  expect(match, `"${label}" 内容区疑似有大段遗留英文: ${match?.[0]}`).toBeNull();
}

async function assertDemoBanner(page, label) {
  await expect(page.getByText("演示数据").first(), `"${label}" 缺少演示状态标识`).toBeVisible();
}

test.describe("Founder Master Edition V1.0 中文框架审查版 — 51 页浏览器逐页检查", () => {
  test("Founder 工作台：8 个页面渲染真实内容、无控制台错误、无占位文案、有演示标识", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    for (const label of FOUNDER_WORKSPACE_ITEMS) {
      await page.locator(".fdr-sidebar__item", { hasText: label }).first().click();
      await expect(page.locator(".fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
      await assertDemoBanner(page, label);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("AI 能力中心：7 个页面渲染真实内容、无控制台错误、无占位文案、有演示标识", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await page.getByRole("button", { name: "AI 能力中心", exact: true }).click();
    await expect(page.locator(".fdr-content")).not.toBeEmpty();
    for (const placeholder of PLACEHOLDER_STRINGS) {
      await expect(page.getByText(placeholder)).toHaveCount(0);
    }
    await assertDemoBanner(page, "Agent 中心");

    for (const label of AI_CAPABILITY_CENTER_ITEMS) {
      await page.locator(".fdr-sidebar__item", { hasText: label }).click();
      await expect(page.locator(".fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
      await assertDemoBanner(page, label);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Operator 实验室：13 个页面渲染真实内容、无控制台错误、无占位文案、有演示标识", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await chevronFor(page, "Operator 实验室").click();
    for (const label of OPERATOR_LAB_ITEMS) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
      await assertDemoBanner(page, label);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio 实验室：13 个页面渲染真实内容、无控制台错误、无占位文案、有演示标识", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await chevronFor(page, "Studio 实验室").click();
    for (const label of STUDIO_LAB_ITEMS) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
      await assertDemoBanner(page, label);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Cloud Center：10 个页面渲染真实内容、无控制台错误、无占位文案、有演示标识", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await page.getByRole("button", { name: "Cloud Center", exact: true }).click();
    for (const label of CLOUD_CENTER_ITEMS) {
      await page.locator(".fdr-sidebar__item, .fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
      await assertDemoBanner(page, label);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("无明显未翻译英文残留抽查：Founder 工作台/Operator 实验室/Studio 实验室各抽一页", async ({ page }) => {
    await page.goto("/founder");
    await page.locator(".fdr-sidebar__item", { hasText: "今日总览" }).first().click();
    await assertNoLeftoverEnglish(page, "今日总览");

    await chevronFor(page, "Operator 实验室").click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "经营工作台" }).first().click();
    await page.waitForTimeout(150);
    await assertNoLeftoverEnglish(page, "经营工作台");

    await chevronFor(page, "Studio 实验室").click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Studio 工作台" }).first().click();
    await page.waitForTimeout(150);
    await assertNoLeftoverEnglish(page, "Studio 工作台");
  });
});
