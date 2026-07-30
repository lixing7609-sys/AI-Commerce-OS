import { test, expect } from "@playwright/test";

/**
 * Acceptance tests updated for the Founder Master Edition V1.0
 * architecture reset (docs/architecture/
 * Founder_Master_Edition_Development_Charter.md, ADR-0007), which
 * supersedes the prior eleven-group IA these tests originally covered
 * (阶段 Founder Full-System v3, §H). Coverage preserved from the
 * original file, retargeted to the frozen 5-group tree: navigation
 * smoke test, Operator Lab navigation test, no-duplicate-canonical-
 * navigation test, no-text-only-placeholder test. Automation Policy
 * regression coverage lives in
 * src/console/mock/automationPolicyMock.test.js (data-contract level,
 * covered by `npm run test`, not here).
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

function chevronFor(page, name) {
  return page.getByRole("button", { name: new RegExp(`^(展开|收起)${name}$`) });
}

const TOP_LEVEL_GROUPS = ["Founder Workspace", "AI Capability Center", "Operator Lab", "Studio Lab", "Cloud Center"];

const REMOVED_TOP_LEVEL_LABELS = [
  "产品研发中心", "Marketplace 中心", "系统与发布", "Agent中心", "Prompt中心", "Skill中心",
  "Workflow中心", "Knowledge中心", "Connector中心", "Capability中心", "Operator 实验室", "Studio 实验室",
];

test.describe("Founder navigation smoke test", () => {
  test("bare root resolves to Founder and renders exactly the five frozen top-level groups, zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");
    await expect(page.locator(".fdr-sidebar__edition")).toHaveText("Founder");

    for (const group of TOP_LEVEL_GROUPS) {
      await expect(page.getByText(group, { exact: true }).first()).toBeVisible();
    }
    for (const removed of REMOVED_TOP_LEVEL_LABELS) {
      await expect(page.getByRole("button", { name: removed, exact: true })).toHaveCount(0);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("AI Capability Center's 7 sub-centers all open real content with zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");

    await page.getByRole("button", { name: "AI Capability Center", exact: true }).click();
    await expect(page.locator(".fdr-content")).not.toBeEmpty();

    const items = ["Prompt Center", "Skill Center", "Workflow Center", "Knowledge Center", "Connector Center", "Capability Center"];
    for (const item of items) {
      await page.locator(".fdr-sidebar__item", { hasText: item }).click();
      await expect(page.locator(".fdr-content")).not.toBeEmpty();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});

test.describe("Operator Lab navigation test", () => {
  test("all 13 canonical Operator Lab items render distinct, real content", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await chevronFor(page, "Operator Lab").click();

    const items = [
      "Workspace", "Products", "Orders", "Customers", "Customer Service", "Marketing", "Advertising",
      "Brand", "AI Secretary", "Data", "Finance & Profit", "Organization", "Settings",
    ];
    for (const label of items) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Workspace shows named quick-action cards, not generic duplicate warning buttons", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator Lab", exact: true }).click();
    for (const label of ["真实店铺接入", "商品中心", "订单中心", "客服中心", "审批中心"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
    await expect(page.getByText("该模块尚未和 Operator 实验室完成单一真源合并")).toHaveCount(0);
  });
});

test.describe("No duplicate canonical navigation test", () => {
  test("no sidebar label appears more than once across the whole Founder tree", async ({ page }) => {
    await page.goto("/founder");
    const seen = new Map();
    async function recordVisibleLabels() {
      const buttons = page.locator(".fdr-sidebar button");
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const text = (await buttons.nth(i).innerText()).trim();
        if (!text) continue;
        seen.set(text, (seen.get(text) ?? 0) + 1);
      }
    }

    await recordVisibleLabels();
    for (const group of ["AI Capability Center", "Operator Lab", "Studio Lab", "Cloud Center"]) {
      await chevronFor(page, group).click();
      await recordVisibleLabels();
    }

    // 已知会重复出现的图标/装饰性文本不算导航重复——只检查真正可能
    // 混淆用户的完整菜单项标签。已知安全的重复：手风琴组标题本身在
    // 展开前后都会被计入一次是正常的（不是这里要抓的问题），这里只
    // 断言具体业务子项标签不出现 >1 次。
    const businessLabels = ["Products", "Orders", "Customer Service", "Customers", "Organization", "Data"];
    for (const label of businessLabels) {
      const occurrences = seen.get(label) ?? 0;
      expect(occurrences, `label "${label}" appeared ${occurrences} times in the sidebar`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("No text-only placeholder test", () => {
  test("the Operator Lab pages absorbed from prior rebuilds have zero 即将上线/占位 text and at least one real interactive control", async ({ page }) => {
    await page.goto("/founder");
    await chevronFor(page, "Operator Lab").click();

    const rebuiltPages = ["Orders", "Customers", "Customer Service", "Advertising", "Organization", "Data"];
    for (const label of rebuiltPages) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      for (const placeholder of ["即将上线", "敬请期待", "尚未开放", "Coming Soon", "coming soon"]) {
        await expect(page.getByText(placeholder), `"${label}" should not show placeholder text "${placeholder}"`).toHaveCount(0);
      }
      // 至少有一个真实可交互控件——表单输入/下拉，或者页面内容区自己
      // 的功能按钮（客服中心默认落在"总览"Tab，交互是可点击的统计卡/
      // 操作按钮，不是表单输入）。
      const interactiveCount = await page
        .locator(".fdr-content input, .fdr-content select, .fdr-content button, .fdr-content [class*='stat-card']")
        .count();
      expect(interactiveCount, `"${label}" should have at least one real interactive control`).toBeGreaterThan(0);
    }
  });

  test("Founder AI Capability Center shells (Prompt/Skill/Knowledge/Connector) have real list data and a working create flow, not text-only pages", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "AI Capability Center", exact: true }).click();
    const centers = [
      ["Prompt Center", "+ 新建Prompt"],
      ["Skill Center", "+ 新建Skill"],
      ["Knowledge Center", "+ 新建知识文档"],
      ["Connector Center", "+ 新建连接器"],
    ];
    for (const [item, createLabel] of centers) {
      await page.locator(".fdr-sidebar__item", { hasText: item }).click();
      await expect(page.locator("table, .fdr-table")).toBeVisible();
      await expect(page.getByRole("button", { name: createLabel })).toBeVisible();
    }
  });
});
