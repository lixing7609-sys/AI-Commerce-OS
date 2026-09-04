import { expect, test } from "@playwright/test";

const goldenConversation = globalThis.process?.env.GOLDEN_CONVERSATION_ID;
const reuseConversation = globalThis.process?.env.REUSE_CONVERSATION_ID;

test.describe("Capability Repository live Golden Path", () => {
  test.skip(!goldenConversation, "Set GOLDEN_CONVERSATION_ID for an explicit live-data acceptance run.");

  test("restores the real lifecycle conversation and repository target", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /构建一个AI驱动的商品详情页生成工具/ }).click();

    await expect(page.getByRole("heading", { name: "商品分镜生成 Skill" }).first()).toBeVisible();
    await expect(page.getByText("可引用 · V1")).toBeVisible();
    await expect(page.getByText("object-21247b37c8a643eeb906").first()).toBeVisible();
    await expect(page.getByText("Brain Discussion Completed · Conversation Active").first()).toBeVisible();
    await expect(page.getByRole("textbox", { name: "讨论内容" })).toBeVisible();

    await page.getByRole("button", { name: "能力仓库", exact: true }).click();
    await expect(page.getByRole("heading", { name: "能力仓库" })).toBeVisible();
    await page.getByText("商品分镜生成 Skill", { exact: true }).first().click();
    await expect(page.getByText("可引用")).toBeVisible();
    await expect(page.getByText("object-21247b37c8a643eeb906")).toBeVisible();
  });
});

test.describe("Capability reuse live feedback", () => {
  test.skip(!reuseConversation, "Set REUSE_CONVERSATION_ID for an explicit persisted reuse acceptance run.");

  test("restores the persisted reference as a Conversation lifecycle event", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((id) => window.localStorage.setItem("sino-founder-active-conversation", id), reuseConversation);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "讨论内容" })).toBeVisible();
    await expect(page.getByLabel("能力状态更新")).toContainText("已引用");
    await expect(page.getByLabel("能力状态更新")).toContainText("商品分镜生成 Skill");
  });
});
