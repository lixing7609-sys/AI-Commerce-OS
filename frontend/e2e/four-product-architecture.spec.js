import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for the "AI Commerce OS Four-Product
 * Architecture V1" freeze (阶段：四端产品体系 V1). Covers:
 *   - all four entry points (path alias + legacy query) load with
 *     real content and survive a hard refresh without blanking
 *   - Studio's full navigation is clickable and its content scrolls
 *   - Cloud's new 分布式调度 page opens and shows distributedCompute
 *     disabled
 *   - Operator's new 设备资源 card is visible with plain-language copy
 *   - Operator's AI 广告投放 (advertising) remains a first-class nav
 *     item — the previous task's work must not have been lost
 *   - Founder's core navigation is intact
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

const ENTRIES = [
  { path: "/cloud", legacyQuery: "/", label: "Operator Cloud", brandingText: "AI Commerce Operator Cloud" },
  { path: "/founder", legacyQuery: "/?mode=founder&module=secretary", label: "Founder", brandingText: "FOUNDER" },
  { path: "/operator", legacyQuery: "/?mode=operator-preview", label: "Operator", brandingText: "OPERATOR" },
  { path: "/studio", legacyQuery: "/?mode=studio", label: "Studio", brandingText: "STUDIO" },
];

test.describe("Four-product architecture: all four entries", () => {
  for (const entry of ENTRIES) {
    test(`${entry.label}: path alias ${entry.path} loads with real branding and zero console errors`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto(entry.path);
      await expect(page.locator("main")).not.toBeEmpty();
      await expect(page.getByText(entry.brandingText).first()).toBeVisible();
      expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
    });

    test(`${entry.label}: legacy query route ${entry.legacyQuery} still resolves to the same product`, async ({ page }) => {
      await page.goto(entry.legacyQuery);
      await expect(page.locator("main")).not.toBeEmpty();
      await expect(page.getByText(entry.brandingText).first()).toBeVisible();
    });

    test(`${entry.label}: hard refresh at ${entry.path} does not blank the page`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto(entry.path);
      await page.reload();
      await expect(page.locator("main")).not.toBeEmpty();
      await expect(page.getByText(entry.brandingText).first()).toBeVisible();
      expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
    });
  }
});

test.describe("Studio: full navigation and scrolling", () => {
  test("every Studio nav item opens real content with zero console errors", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/studio");

    const navLabels = [
      "Studio 概览", "内容项目", "AI 短剧", "AI 视频", "AI 直播",
      "矩阵账号", "内容资产", "流量池", "广告资源", "广告订单",
      "算力任务", "数据分析", "设置",
    ];

    for (const label of navLabels) {
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByRole("heading", { name: label, level: 1 })).toBeVisible();
      await expect(page.locator(".st-content")).not.toBeEmpty();
    }

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio content panel actually scrolls to the bottom via mouse wheel", async ({ page }) => {
    await page.goto("/studio");
    // AI 短剧页面堆叠了 4 张卡片（项目/角色/分镜进度/发行数据），在
    // Playwright 默认 1280x720 视口下必然超出一屏，比"内容项目"页面
    // （只有一张表格，可能恰好一屏放得下）更适合验证真实滚动。
    await page.getByRole("button", { name: "AI 短剧" }).click();

    const before = await page.evaluate(() => {
      const el = document.querySelector(".st-content");
      return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
    expect(before.scrollTop).toBe(0);

    await page.mouse.move(900, 400);
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => document.querySelector(".st-content").scrollTop);
    expect(after).toBeGreaterThan(0);
  });

  test("Studio does not expose the old detached advertising-connector-style global panel and uses account-safe language", async ({ page }) => {
    await page.goto("/studio");
    await page.getByRole("button", { name: "矩阵账号" }).click();
    await expect(page.getByRole("heading", { name: "矩阵账号", level: 1 })).toBeVisible();
    // 面向用户的文案不应该出现裸的 Connector 字样
    await expect(page.getByText(/Connector/i)).toHaveCount(0);
  });
});

test.describe("Cloud: distributed scheduling page", () => {
  test("分布式调度 opens and clearly shows distributedCompute is disabled", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/cloud");
    await page.getByRole("button", { name: "分布式调度" }).click();
    await expect(page.getByRole("heading", { name: "分布式调度", level: 1 })).toBeVisible();
    await expect(page.getByText("distributedCompute.enabled = false")).toBeVisible();
    await expect(page.getByRole("heading", { name: "算力总览" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "设备资源池" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "资源策略" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "异常与暂停" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "成本节省统计" })).toBeVisible();
    // 预计节省成本必须诚实地显示为 0，不能编造
    await expect(page.getByText("预计节省云端算力成本：¥0")).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});

test.describe("Operator: device resource card and advertising", () => {
  test("设备与更新 shows a plain-language 设备资源 card with distributed compute disabled", async ({ page }) => {
    await page.goto("/operator");
    await page.getByRole("button", { name: "设备与更新" }).click();
    await expect(page.getByRole("heading", { name: "设备资源" })).toBeVisible();
    await expect(page.getByText("平台算力协同尚未启用。")).toBeVisible();
    await expect(page.getByText("当前分布式调度功能")).toBeVisible();
    // 面向经营者的卡片不能出现技术内部词
    await expect(page.getByText("ComputeAssignment")).toHaveCount(0);
    await expect(page.getByText("Sandbox Runtime")).toHaveCount(0);
    await expect(page.getByText("CPU Time Slice")).toHaveCount(0);
  });

  test("AI 广告投放 remains a first-class Operator nav item (not lost by this task)", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.getByRole("button", { name: /广告投放/ })).toBeVisible();
    await page.getByRole("button", { name: /广告投放/ }).click();
    await expect(page.getByRole("heading", { name: "广告投放" })).toBeVisible();
  });
});

test.describe("Founder: core navigation intact", () => {
  test("Founder's Secretary and Store Center are still reachable", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();
    await expect(page.getByRole("button", { name: "店铺中心" })).toBeVisible();
  });
});
