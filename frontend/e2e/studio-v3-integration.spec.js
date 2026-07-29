import { test, expect } from "@playwright/test";

/**
 * Studio V3 Integration（阶段：AI Content Company Operating System）。
 * 覆盖本轮验收清单里最容易回归的部分：独立 Studio 的六分组手风琴
 * 侧边栏、AI图文作为一级内容形态、AI导演工作台三栏结构与真实的
 * 增删镜头交互、Founder Studio 实验室展开后的分组导航与实验控制层、
 * 三类秘书的区分未被破坏。
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test.describe("独立 Studio：六分组手风琴侧边栏", () => {
  test("总控分组始终展开，其余分组默认折叠", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("button", { name: "Studio秘书", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "AI创作中心", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "AI短剧", exact: true })).toHaveCount(0);
  });

  test("展开 AI创作中心 显示 AI图文，与 AI短剧/AI视频/AI直播 同组", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "AI创作中心", exact: true }).click();
    for (const label of ["AI短剧", "AI视频", "AI图文", "AI直播", "剧本 / 脚本 / 分镜", "角色与场景", "图片 / 视频生成", "AI剪辑", "配音 / 字幕 / BGM", "内容审核"]) {
      await expect(page.locator(".st-nav-link", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("展开另一个分组会自动收起前一个（单一展开手风琴）", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "AI创作中心", exact: true }).click();
    await expect(page.getByRole("button", { name: "AI创作中心", exact: true })).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "商业经营", exact: true }).click();
    await expect(page.getByRole("button", { name: "AI创作中心", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".st-nav-link", { hasText: "AI短剧" })).toHaveCount(0);
  });
});

test.describe("独立 Studio：Studio秘书作为内容经营总控台", () => {
  test("首页包含经营简报、关键指标、热点建议、Agent状态、重点项目与快捷操作", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "Studio秘书", exact: true }).click();
    await expect(page.getByText("今日经营简报")).toBeVisible();
    await expect(page.getByText("Agent 工作状态")).toBeVisible();
    await expect(page.getByText("重点内容项目")).toBeVisible();
    await expect(page.getByText("快速操作")).toBeVisible();
    await expect(page.getByRole("button", { name: "创建 AI图文" })).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("点击某条热点的创建项目按钮进入 AI导演工作台新建流程", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "Studio秘书", exact: true }).click();
    await page.locator("button", { hasText: "创建项目" }).first().click();
    await expect(page.getByText("新建内容项目")).toBeVisible();
  });
});

test.describe("独立 Studio：AI导演工作台三栏结构", () => {
  test("从内容项目列表进入旗舰演示项目，三栏均可见且分镜阶段渲染镜头网格", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "内容策划", exact: true }).click();
    await page.locator(".st-nav-link", { hasText: "内容项目" }).click();
    await page.locator("tr", { hasText: "红果短剧" }).first().click();
    await expect(page.getByRole("heading", { name: "AI导演工作台", exact: true })).toBeVisible();
    await expect(page.getByText("项目素材库")).toBeVisible();
    await expect(page.getByText("十阶段生产流程")).toBeVisible();
    await expect(page.getByText(/镜头预览/).first()).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("可以新增一个镜头，镜头数量增加", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "内容策划", exact: true }).click();
    await page.locator(".st-nav-link", { hasText: "内容项目" }).click();
    await page.locator("tr", { hasText: "红果短剧" }).first().click();
    const before = await page.getByText(/镜头预览/).count();
    await page.getByText("＋ 新增镜头").click();
    await expect(page.getByText(/镜头预览/)).toHaveCount(before + 1);
  });

  test("点击某个镜头后，右侧检查器显示可编辑字段", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "内容策划", exact: true }).click();
    await page.locator(".st-nav-link", { hasText: "内容项目" }).click();
    await page.locator("tr", { hasText: "红果短剧" }).first().click();
    await page.getByText(/镜头预览 02/).click();
    await expect(page.getByText("镜头类型")).toBeVisible();
    await expect(page.getByText("成本与质量")).toBeVisible();
  });
});

test.describe("独立 Studio：AI图文作为一级内容形态", () => {
  test("AI图文列表展示真实项目，非占位页面", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "AI创作中心", exact: true }).click();
    await page.locator(".st-nav-link", { hasText: "AI图文" }).click();
    await expect(page.getByText("《普通人如何用 AI 建立一人公司》")).toBeVisible();
    await expect(page.getByText("《出租屋氛围灯改造指南》")).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("进入图文编辑器显示三栏结构与14阶段流程，正文由结构化内容块组成", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "AI创作中心", exact: true }).click();
    await page.locator(".st-nav-link", { hasText: "AI图文" }).click();
    await page.locator("tr", { hasText: "普通人如何用" }).first().click();
    await expect(page.getByRole("heading", { name: "AI图文编辑器", exact: true })).toBeVisible();
    await expect(page.getByText("14 阶段生产流程")).toBeVisible();
    await expect(page.getByText("当前内容块检查器")).toBeVisible();
    await expect(page.getByText("平台版本")).toBeVisible();
  });

  test("可以在图文编辑器生成一个新的平台版本", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "AI创作中心", exact: true }).click();
    await page.locator(".st-nav-link", { hasText: "AI图文" }).click();
    await page.locator("tr", { hasText: "普通人如何用" }).first().click();
    await page.getByRole("button", { name: "平台版本" }).click();
    const before = await page.locator("table tbody tr").count();
    await page.getByRole("button", { name: /生成知乎版本/ }).click();
    await expect(page.locator("table tbody tr")).toHaveCount(before + 1);
  });
});

test.describe("Founder Studio 实验室：展开后接入 Studio 完整业务 + 实验控制层", () => {
  test("展开后按分组显示 Studio 完整导航，末尾追加 Founder 专属实验控制层", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    for (const label of ["Studio秘书", "AI图文", "内容项目", "商业变现"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
    await expect(page.getByText("Studio 实验控制层")).toBeVisible();
    for (const label of ["Studio Agent", "Studio Prompt", "Studio Skill", "Studio Workflow", "Studio 模型路由", "Prompt测试台", "真实任务回放", "A/B评测", "运行日志", "成本分析", "版本与发布"]) {
      await expect(page.locator(".fdr-sidebar__item", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("点击 Studio Agent 进入 Founder 专属实验控制层页面，显示模式标识与27个Agent", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__item", { hasText: "Studio Agent" }).click();
    await expect(page.getByText("Founder · Studio 实验室")).toBeVisible();
    await expect(page.getByText(/共 27 个角色化 Agent/)).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Founder 内嵌 Studio 实验室没有第二套 Studio 侧边栏", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Studio秘书" }).click();
    await expect(page.locator(".st-sidebar")).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
  });

  test("Founder Studio 实验室的 Studio秘书与独立 Studio 秘书是同一实现，标签正确区分于 AI秘书处/Operator秘书", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByRole("button", { name: "AI 秘书处" })).toBeVisible();
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Studio秘书" }).click();
    await expect(page.getByText("Studio 秘书 · 内容公司经营总控")).toBeVisible();
  });
});
