import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";
const EVIDENCE = "../.runtime/visual-evidence/sidebar-information-architecture";

test("Founder sidebar presents Sino AI, Projects, Recent Conversations, and Settings", async ({ page, request }) => {
  mkdirSync(EVIDENCE, { recursive: true });
  const created = [];
  try {
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
    await page.screenshot({ path: `${EVIDENCE}/sidebar-expanded.png`, fullPage: true });
  } finally {
    for (const conversation of created) await request.delete(`${API}/conversations/${conversation.id}`);
  }
});
