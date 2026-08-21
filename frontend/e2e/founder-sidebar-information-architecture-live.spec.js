import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";
const EVIDENCE = "../.runtime/visual-evidence/sidebar-information-architecture";

test("Founder sidebar presents Sino AI, Projects, Recent Conversations, and Settings", async ({ page, request }) => {
  mkdirSync(EVIDENCE, { recursive: true });
  const created = [];
  const createdProjects = [];
  try {
    const projectsResponse = await request.get(`${API}/founder-ai/projects`);
    expect(projectsResponse.ok()).toBeTruthy();
    const projects = await projectsResponse.json();
    const commerceProject = projects.find((item) => item.name === "AI Commerce OS");
    expect(commerceProject).toBeTruthy();
    for (const name of ["Sidebar Visual Fixture A", "Sidebar Visual Fixture B"]) {
      const response = await request.post(`${API}/founder-ai/projects`, { data: { name, description: "Isolated sidebar visual fixture" } });
      expect(response.ok()).toBeTruthy();
      createdProjects.push(await response.json());
    }
    for (const [index, title] of ["Codex 终端操作建议", "API 接入是否需要 VPN", "今日广告平台解析"].entries()) {
      const response = await request.post(`${API}/conversations`, { data: {
        title,
        conversation_type: "USER_CONVERSATION",
        created_by: "VERIFICATION",
      }});
      expect(response.ok()).toBeTruthy();
      created.push(await response.json());
      await page.waitForTimeout(index * 5);
    }
    const scopedResponse = await request.post(`${API}/conversations`, { data: {
      title: "AI Commerce OS 项目讨论",
      project_id: commerceProject.id,
      conversation_type: "PROJECT_CONVERSATION",
      created_by: "VERIFICATION",
    }});
    expect(scopedResponse.ok()).toBeTruthy();
    created.push(await scopedResponse.json());

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const navigation = page.getByLabel("Founder Navigation");
    await expect(navigation.getByRole("button", { name: "收起侧边栏" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "新建讨论" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Sino AI" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "库" })).toBeVisible();
    await expect(navigation.getByText("项目", { exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "新建项目" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "新建项目" }).locator("svg")).toBeVisible();
    await expect(navigation.getByRole("button", { name: "新建项目" })).not.toContainText("＋");
    await expect(navigation.getByText("AI Commerce OS", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Sino Operator AI", { exact: true })).toBeVisible();
    const projectBounds = await navigation.getByText("AI Commerce OS", { exact: true }).boundingBox();
    const navigationBounds = await navigation.boundingBox();
    expect(projectBounds.y).toBeGreaterThan(navigationBounds.y);
    expect(projectBounds.y + projectBounds.height).toBeLessThan(navigationBounds.y + navigationBounds.height);
    await expect(navigation.getByText("最近", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Codex 终端操作建议", { exact: true })).toBeVisible();
    await expect(navigation.getByText("API 接入是否需要 VPN", { exact: true })).toBeVisible();
    await expect(navigation.getByText("今日广告平台解析", { exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "设置" })).toBeVisible();
    await expect(navigation.getByText(/Conversations|Ready|Candidate/)).toHaveCount(0);
    const topbar = page.getByRole("banner", { name: "Workspace top bar" });
    const conversationSurface = page.getByRole("main", { name: "Sino Natural Conversation" });
    const executionCenter = page.getByRole("complementary", { name: "执行中心" });
    await expect(topbar).toBeVisible();
    await expect(topbar.getByRole("button", { name: /Sino AI/ })).toBeVisible();
    const [topbarBounds, navigationPanelBounds, conversationBounds, executionBounds] = await Promise.all([
      topbar.boundingBox(), navigation.boundingBox(), conversationSurface.boundingBox(), executionCenter.boundingBox(),
    ]);
    expect(topbarBounds.x).toBe(0);
    expect(topbarBounds.x + topbarBounds.width).toBe(1440);
    expect(topbarBounds.y + topbarBounds.height).toBeLessThanOrEqual(conversationBounds.y);
    expect(navigationPanelBounds.x).toBe(8);
    expect(executionBounds.x + executionBounds.width).toBe(1432);
    expect(executionBounds.y).toBe(navigationPanelBounds.y);
    expect(executionBounds.height).toBe(navigationPanelBounds.height);
    expect(navigationPanelBounds.y).toBe(8);
    expect(navigationPanelBounds.y + navigationPanelBounds.height).toBe(892);
    const [leftHeaderBounds, executionHeaderBounds] = await Promise.all([
      navigation.locator(".sino-sidebar-top-actions").boundingBox(),
      executionCenter.locator(".sino-work-queue-heading").boundingBox(),
    ]);
    const topbarBaseline = topbarBounds.y + topbarBounds.height;
    expect(leftHeaderBounds.y + leftHeaderBounds.height).toBe(topbarBaseline);
    expect(executionHeaderBounds.y + executionHeaderBounds.height).toBe(topbarBaseline);
    const searchBounds = await navigation.locator(".sino-sidebar-search").boundingBox();
    expect(searchBounds.y - topbarBaseline).toBe(8);
    const headingTypography = await page.evaluate(() => {
      const section = getComputedStyle(document.querySelector(".sino-sidebar-primary-title__label"));
      const execution = getComputedStyle(document.querySelector(".founder-execution-center .sino-work-queue-heading h2"));
      return {
        section: [section.fontSize, section.fontWeight, section.lineHeight],
        execution: [execution.fontSize, execution.fontWeight, execution.lineHeight],
      };
    });
    expect(headingTypography.execution).toEqual(headingTypography.section);
    const modelTrigger = topbar.getByRole("button", { name: /Sino AI/ });
    await expect(modelTrigger.locator(".sino-model-selector__chevron-right")).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/model-selector-closed.png`, fullPage: true });
    await modelTrigger.click();
    const modelPopover = page.getByRole("menu", { name: "Conversation Models" });
    await expect(modelPopover).toBeVisible();
    await expect(modelPopover.getByRole("menuitemradio")).not.toHaveCount(0);
    const [triggerBounds, popoverBounds] = await Promise.all([modelTrigger.boundingBox(), modelPopover.boundingBox()]);
    expect(Math.abs((triggerBounds.x + triggerBounds.width / 2) - (popoverBounds.x + popoverBounds.width / 2))).toBeLessThanOrEqual(1);
    expect(popoverBounds.x).toBeLessThan(navigationPanelBounds.x + navigationPanelBounds.width);
    const popoverZ = await modelPopover.evaluate((element) => Number(getComputedStyle(element).zIndex));
    const sidebarZ = await navigation.evaluate((element) => Number(getComputedStyle(element).zIndex));
    expect(popoverZ).toBeGreaterThan(sidebarZ);
    await page.screenshot({ path: `${EVIDENCE}/model-selector-open.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await expect(modelPopover).toHaveCount(0);
    await expect(topbar.getByRole("button", { name: "重置执行中心宽度" })).toHaveCount(0);
    await expect(page.getByText("和 Sino 讨论任何想法、问题或计划……", { exact: true })).toHaveCount(0);
    await expect(navigation.locator(".sino-project-item")).toHaveCount(4);
    await expect(navigation.getByRole("button", { name: "展开显示" })).toBeVisible();
    await expect(navigation.locator(".sino-conversation-item__open > span")).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCE}/sidebar-expanded.png`, fullPage: true });
    await page.screenshot({ path: `${EVIDENCE}/workspace-topbar.png`, fullPage: true });

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(topbar.getByRole("button", { name: /Sino AI/ })).toBeVisible();
    const responsiveTopbarBounds = await topbar.boundingBox();
    expect(responsiveTopbarBounds.x + responsiveTopbarBounds.width).toBeLessThanOrEqual(1024);
    await page.setViewportSize({ width: 1440, height: 900 });

    await navigation.getByRole("button", { name: "展开显示" }).click();
    await expect(navigation.locator(".sino-project-item")).toHaveCount(projects.length + createdProjects.length);
    await expect(navigation.getByRole("button", { name: "收起显示" })).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/sidebar-projects-expanded.png`, fullPage: true });

    const search = navigation.getByPlaceholder("搜索");
    await expect(search).toBeVisible();
    await search.fill("Commerce");
    await expect(navigation.getByText("AI Commerce OS", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Sino Operator AI", { exact: true })).toHaveCount(0);
    await expect(navigation.getByRole("button", { name: "新建项目" })).toBeVisible();
    await page.screenshot({ path: `${EVIDENCE}/sidebar-search-commerce.png`, fullPage: true });
    await search.fill("");
    await expect(navigation.getByText("Sino Operator AI", { exact: true })).toBeVisible();

    await navigation.getByRole("button", { name: "AI Commerce OS", exact: true }).click();
    const projectWorkspace = page.getByRole("region", { name: "项目工作区" });
    await expect(projectWorkspace.getByRole("heading", { name: "AI Commerce OS" })).toBeVisible();
    await expect(projectWorkspace.getByRole("button", { name: "聊天" })).toBeVisible();
    await expect(projectWorkspace.getByRole("button", { name: "数据源" })).toBeVisible();
    await expect(projectWorkspace.getByText("AI Commerce OS 项目讨论", { exact: true })).toBeVisible();
    await expect(projectWorkspace.getByLabel("当前项目")).toContainText("AI Commerce OS");
    await page.screenshot({ path: `${EVIDENCE}/project-workspace.png`, fullPage: true });

    await navigation.getByRole("button", { name: "Sino AI" }).click();
    await expect(page.getByRole("region", { name: "项目工作区" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
  } finally {
    for (const conversation of created) await request.delete(`${API}/conversations/${conversation.id}`);
    for (const project of createdProjects) await request.delete(`${API}/founder-ai/projects/${project.id}`);
  }
});
