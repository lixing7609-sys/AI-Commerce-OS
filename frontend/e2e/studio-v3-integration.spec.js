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

test.describe("独立 Studio：13 项扁平侧边栏（Founder Master Edition Charter §3.4）", () => {
  test("侧边栏是单一扁平分组，所有 13 个顶级子项始终可见，不需要展开任何手风琴", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.locator(".st-sidebar-accordion")).toHaveCount(0);
    for (const label of [
      "Workspace", "AI Image", "AI Video", "AI Article", "AI Live", "AI Short Drama", "AI Audio",
      "Matrix Accounts", "Publishing Center", "Asset Library", "Brand Assets", "Analytics", "Settings",
    ]) {
      await expect(page.locator(".st-nav-link", { hasText: label })).toBeVisible();
    }
  });

  test("默认落地页是 Workspace，秘书/项目队列/选题与热点都是它的 Tab", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await expect(page.locator(".st-nav-link.active", { hasText: "Workspace" })).toBeVisible();
    for (const tab of ["总览", "秘书", "项目队列", "选题与热点"]) {
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});

test.describe("独立 Studio：Studio秘书作为内容经营总控台", () => {
  test("首页包含经营简报、关键指标、热点建议、Agent状态、重点项目与快捷操作", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "秘书", exact: true }).click();
    await expect(page.getByText("今日经营简报")).toBeVisible();
    await expect(page.getByText("Agent 工作状态")).toBeVisible();
    await expect(page.getByText("重点内容项目")).toBeVisible();
    await expect(page.getByText("快速操作")).toBeVisible();
    await expect(page.getByRole("button", { name: "创建 AI图文" })).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("点击某条热点的创建项目按钮进入 AI导演工作台新建流程", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "秘书", exact: true }).click();
    await page.locator("button", { hasText: "创建项目" }).first().click();
    await expect(page.getByRole("heading", { name: "AI导演工作台", exact: true })).toBeVisible();
  });
});

test.describe("独立 Studio：AI导演工作台三栏结构", () => {
  test("从内容项目列表进入旗舰演示项目，三栏均可见且分镜阶段渲染镜头网格", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");
    await page.getByRole("button", { name: "项目队列", exact: true }).click();
    await page.locator("tr", { hasText: "红果短剧" }).first().click();
    await expect(page.getByRole("heading", { name: "AI导演工作台", exact: true })).toBeVisible();
    await expect(page.getByText("项目素材库")).toBeVisible();
    await expect(page.getByText("十阶段生产流程")).toBeVisible();
    await expect(page.getByText(/镜头预览/).first()).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("可以新增一个镜头，镜头数量增加", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "项目队列", exact: true }).click();
    await page.locator("tr", { hasText: "红果短剧" }).first().click();
    const before = await page.getByText(/镜头预览/).count();
    await page.getByText("＋ 新增镜头").click();
    await expect(page.getByText(/镜头预览/)).toHaveCount(before + 1);
  });

  test("点击某个镜头后，右侧检查器显示可编辑字段", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "项目队列", exact: true }).click();
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
    await page.locator(".st-nav-link", { hasText: "AI Image" }).click();
    await expect(page.getByText("《普通人如何用 AI 建立一人公司》")).toBeVisible();
    await expect(page.getByText("《出租屋氛围灯改造指南》")).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("进入图文编辑器显示三栏结构与14阶段流程，正文由结构化内容块组成", async ({ page }) => {
    await page.goto("/studio");
    await page.locator(".st-nav-link", { hasText: "AI Image" }).click();
    await page.locator("tr", { hasText: "普通人如何用" }).first().click();
    await expect(page.getByText("AI图文编辑器", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("14 阶段生产流程")).toBeVisible();
    await expect(page.getByText("当前内容块检查器")).toBeVisible();
    await expect(page.getByText("平台版本")).toBeVisible();
  });

  test("可以在图文编辑器生成一个新的平台版本", async ({ page }) => {
    await page.goto("/studio");
    await page.locator(".st-nav-link", { hasText: "AI Image" }).click();
    await page.locator("tr", { hasText: "普通人如何用" }).first().click();
    await page.getByRole("button", { name: "平台版本" }).click();
    const before = await page.locator("table tbody tr").count();
    await page.getByRole("button", { name: /生成知乎版本/ }).click();
    await expect(page.locator("table tbody tr")).toHaveCount(before + 1);
  });
});

test.describe("Founder Studio Lab：展开后接入 Studio 完整业务；实验控制层已迁入 AI Capability Center", () => {
  test("展开后按 Charter §3.4 显示 Studio 完整的 13 项扁平导航，不再带 Founder 专属实验控制层尾部", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio Lab", exact: true }).click();
    for (const label of ["Workspace", "AI Image", "Publishing Center"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
    // Charter §3.4: 原"Studio 实验控制层"尾部条目已吸收进 AI Capability
    // Center 对应子中心的 Studio 作用域 Tab，不再挂在 Studio Lab 自己的
    // 导航树下。
    await expect(page.getByText("Studio 实验控制层")).toHaveCount(0);
    for (const label of ["Studio Agent", "Studio Prompt", "Studio Skill", "Studio Workflow", "Studio 模型路由"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toHaveCount(0);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio Agent 现在挂在 AI Capability Center · Agent Center 的 Studio Agents Tab 下，显示模式标识与27个Agent", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "AI Capability Center", exact: true }).click();
    await expect(page.getByRole("button", { name: "Studio Agents", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Studio Agents", exact: true }).click();
    await expect(page.getByText("Founder · Studio 实验室")).toBeVisible();
    await expect(page.getByText(/共 27 个角色化 Agent/)).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Founder 内嵌 Studio Lab 没有第二套 Studio 侧边栏", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio Lab", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Workspace" }).click();
    await expect(page.locator(".st-sidebar")).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
  });

  test("Founder Studio Lab 的 Studio秘书与独立 Studio 秘书是同一实现，标签正确区分于 Today/Operator秘书", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Studio Lab", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Workspace" }).click();
    await page.getByRole("button", { name: "秘书", exact: true }).click();
    await expect(page.getByText("Studio秘书 · 今日经营简报")).toBeVisible();
  });
});
