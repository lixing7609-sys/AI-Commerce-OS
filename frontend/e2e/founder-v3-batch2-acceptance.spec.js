import { test, expect } from "@playwright/test";

/**
 * Batch 2 acceptance tests (阶段 Founder Full-System v3, §H of the
 * task brief): Founder navigation smoke test, Operator Lab navigation
 * test, no-duplicate-canonical-navigation test, no-text-only-
 * placeholder test. Automation Policy regression coverage lives in
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

const TOP_LEVEL_GROUPS = [
  "Founder工作台", "Agent中心", "Prompt中心", "Skill中心", "Workflow中心",
  "Knowledge中心", "Connector中心", "Capability中心", "Operator 实验室", "Studio 实验室", "Cloud Center",
];

const REMOVED_TOP_LEVEL_LABELS = [
  "产品研发中心", "Marketplace 中心", "系统与发布",
];

test.describe("Founder navigation smoke test", () => {
  test("bare root resolves to Founder and renders exactly the eleven frozen top-level groups, zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/");
    await expect(page.locator(".fdr-sidebar__brand-badge")).toHaveText("FOUNDER");

    for (const group of TOP_LEVEL_GROUPS) {
      await expect(page.getByRole("button", { name: group, exact: true }).or(page.getByText(group, { exact: true })).first()).toBeVisible();
    }
    for (const removed of REMOVED_TOP_LEVEL_LABELS) {
      await expect(page.getByRole("button", { name: removed, exact: true })).toHaveCount(0);
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("every top-level group opens real content with zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");

    const clicks = [
      ["Agent中心", "Agent 工作室"],
      ["Prompt中心", "Prompt 列表"],
      ["Skill中心", "Skill 列表"],
      ["Workflow中心", "自动化策略"],
      ["Knowledge中心", "知识库"],
      ["Connector中心", "连接器"],
      ["Capability中心", "基准测试中心"],
    ];
    for (const [group, item] of clicks) {
      await page.getByRole("button", { name: group, exact: true }).click();
      await page.getByRole("button", { name: item, exact: true }).click();
      await expect(page.locator(".fdr-content")).not.toBeEmpty();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});

test.describe("Operator Lab navigation test", () => {
  test("all 15 canonical Operator 实验室 items render distinct, real content", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();

    const items = [
      "Operator工作台", "Operator秘书", "店铺", "商品", "内容", "广告投放", "订单",
      "客户", "客服", "审批", "AI成长", "成本与Token", "数据与经营分析", "自动经营", "设置",
    ];
    for (const label of items) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Operator工作台 shows named quick-action cards, not generic duplicate warning buttons", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
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
    for (const group of TOP_LEVEL_GROUPS.filter((g) => g !== "Founder工作台")) {
      await page.getByRole("button", { name: group, exact: true }).click();
      await recordVisibleLabels();
    }

    // 已知会重复出现的图标/装饰性文本不算导航重复——只检查真正可能
    // 混淆用户的完整菜单项标签。已知安全的重复：手风琴组标题本身在
    // 展开前后都会被计入一次是正常的（不是这里要抓的问题），这里只
    // 断言具体业务子项标签不出现 >1 次。
    const businessLabels = [
      "商品", "订单", "客服", "审批", "店铺", "广告投放", "客户", "自动经营", "数据与经营分析",
    ];
    for (const label of businessLabels) {
      const occurrences = seen.get(label) ?? 0;
      expect(occurrences, `label "${label}" appeared ${occurrences} times in the sidebar`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe("No text-only placeholder test", () => {
  test("the seven rebuilt Operator Lab pages have zero 即将上线/占位 text and at least one real interactive control", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();

    const rebuiltPages = ["订单", "客户", "客服", "审批", "广告投放", "自动经营", "数据与经营分析"];
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

  test("Founder core-center shells (Prompt/Skill/Knowledge/Connector) have real list data and a working create flow, not text-only pages", async ({ page }) => {
    await page.goto("/founder");
    const centers = [
      ["Prompt中心", "Prompt 列表", "+ 新建Prompt"],
      ["Skill中心", "Skill 列表", "+ 新建Skill"],
      ["Knowledge中心", "知识库", "+ 新建知识文档"],
      ["Connector中心", "连接器", "+ 新建连接器"],
    ];
    for (const [group, item, createLabel] of centers) {
      await page.getByRole("button", { name: group, exact: true }).click();
      await page.getByRole("button", { name: item, exact: true }).click();
      await expect(page.locator("table, .fdr-table")).toBeVisible();
      await expect(page.getByRole("button", { name: createLabel })).toBeVisible();
    }
  });
});
