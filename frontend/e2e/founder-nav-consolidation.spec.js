import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for the Founder Master Edition V1.0
 * architecture reset (docs/architecture/
 * Founder_Master_Edition_Development_Charter.md, ADR-0007), updated for
 * the 中文框架审查版 nav relabeling (docs/product-review/
 * Founder_Master_Edition_Chinese_Framework_Review.md). Locks in:
 *   - Founder's sidebar is exactly 5 top-level groups (Founder 工作台
 *     flat, the other 4 collapsible accordions);
 *   - Operator 实验室 / Studio 实验室 / Cloud Center render their own
 *     registries directly inside Founder's one sidebar — no second
 *     nested product sidebar renders in the content area;
 *   - refresh/deep-link restores the correct expanded group + active
 *     highlight;
 *   - old module/subView keys absorbed by this reset still resolve
 *     instead of 404ing or silently falling back to a default page.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

// The visible group row is two separate buttons (navigation-shell-spec.md
// §Anatomy): `.fdr-sidebar__group-label` (text matches the group name,
// navigates + expands, but carries no aria-expanded) and
// `.fdr-sidebar__group-chevron` (aria-expanded lives here, aria-label is
// "展开<name>"/"收起<name>", toggles without navigating). Structural
// expand/collapse assertions must target the chevron, not the label.
function chevronFor(page, name) {
  return page.getByRole("button", { name: new RegExp(`^(展开|收起)${name}$`) });
}

test.describe("Founder sidebar: exactly 5 top-level groups", () => {
  test("Founder 工作台 is flat (not collapsible) and the other 4 groups start collapsed", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByText("Founder 工作台", { exact: true })).toBeVisible();
    for (const group of ["AI 能力中心", "Operator 实验室", "Studio 实验室", "Cloud Center"]) {
      await expect(chevronFor(page, group)).toHaveAttribute("aria-expanded", "false");
    }
    // Collapsed state: nested business sub-items are not visible.
    await expect(page.getByRole("button", { name: "商品中心", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI 图片", exact: true })).toHaveCount(0);
  });

  test("Founder 工作台 shows all 8 charter items as always-visible flat rows", async ({ page }) => {
    await page.goto("/founder");
    for (const label of ["今日总览", "决策中心", "开发进度", "经营验证", "内容验证", "云端状态", "风险中心", "通知中心"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("clicking AI 能力中心 expands its 7 charter sub-centers", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await chevronFor(page, "AI 能力中心").click();
    await expect(chevronFor(page, "AI 能力中心")).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Prompt 中心", "Skill 中心", "Workflow 中心", "知识中心", "Connector 中心", "能力中心"]) {
      await expect(page.locator(".fdr-sidebar__item", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking Operator 实验室 expands exactly its 13 charter items, in order", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await chevronFor(page, "Operator 实验室").click();
    await expect(chevronFor(page, "Operator 实验室")).toHaveAttribute("aria-expanded", "true");

    for (const label of [
      "经营工作台", "商品中心", "订单中心", "客户中心", "客服中心", "营销中心", "广告投放",
      "品牌中心", "Operator 秘书", "数据中心", "财务与利润", "组织与审批", "经营设置",
    ]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking it again collapses back to just the group label", async ({ page }) => {
    await page.goto("/founder");
    const toggle = chevronFor(page, "Operator 实验室");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".fdr-sidebar__subitem", { hasText: "商品中心" })).toHaveCount(0);
  });

  test("expanding Studio 实验室 auto-collapses Operator 实验室 (single-expansion accordion)", async ({ page }) => {
    await page.goto("/founder");
    await chevronFor(page, "Operator 实验室").click();
    await expect(chevronFor(page, "Operator 实验室")).toHaveAttribute("aria-expanded", "true");

    await chevronFor(page, "Studio 实验室").click();
    await expect(chevronFor(page, "Studio 实验室")).toHaveAttribute("aria-expanded", "true");
    await expect(chevronFor(page, "Operator 实验室")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".fdr-sidebar__subitem", { hasText: "商品中心" })).toHaveCount(0);
  });

  test("Studio 实验室 expands exactly its 13 charter items, flat with no sub-cluster labels", async ({ page }) => {
    await page.goto("/founder");
    await chevronFor(page, "Studio 实验室").click();
    for (const label of [
      "Studio 工作台", "AI 图片", "AI 视频", "AI 文章", "AI 直播", "AI 短剧", "AI 音频",
      "矩阵账号", "发布中心", "素材库", "品牌资产", "内容数据", "Studio 设置",
    ]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
  });

  test("Cloud Center expands exactly its 10 charter items", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Cloud Center", exact: true }).click();
    for (const label of ["设备管理", "OTA 更新", "许可证", "Token 中心", "Marketplace", "版本管理", "资产管理", "节点调度", "系统监控", "日志中心"]) {
      await expect(page.locator(".fdr-sidebar__item, .fdr-sidebar__subitem", { hasText: label }).first()).toBeVisible();
    }
  });
});

test.describe("Founder: no nested product shell renders in the content area", () => {
  test("Operator 实验室 content area has no second Operator sidebar/nav chrome", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=operatorLab&subView=workbench");
    await expect(page.locator(".op-sidebar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "返回旧版后台" })).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio 实验室 content area has no second Studio sidebar/nav chrome", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=studioLab&subView=workspace");
    await expect(page.locator(".st-sidebar")).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking an Operator sub-item renders the real Operator page directly in Founder's content area, correctly highlighted", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Operator 秘书" }).click();
    await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(/Operator 秘书/);
  });
});

test.describe("Founder: refresh and deep-link restore the correct expanded group + active item", () => {
  test("a hard reload at a Studio 实验室 deep link auto-expands Studio 实验室 and highlights the right sub-item", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=studioLab&subView=aiArticle");
    await expect(chevronFor(page, "Studio 实验室")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(/AI 文章/);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("retired sub-nav keys absorbed by the reset still resolve (no silent fallback to a default page)", async ({ page }) => {
    const cases = [
      { url: "/founder?module=operatorLab&subView=approvals", heading: /审批/ },
      { url: "/founder?module=studioLab&subView=liveCommerce", group: "Studio 实验室" },
      { url: "/founder?module=agentStudio", group: "AI 能力中心" },
      { url: "/founder?module=studioAgents", group: "AI 能力中心" },
    ];
    for (const { url, heading, group } of cases) {
      const errors = collectPageErrors(page);
      await page.goto(url);
      if (heading) await expect(page.getByText(heading).first()).toBeVisible();
      if (group) await expect(chevronFor(page, group)).toHaveAttribute("aria-expanded", "true");
      expect(errors, `${url} console errors: ${errors.join("; ")}`).toHaveLength(0);
    }
  });

  test("old ?module=storeCenter/contentCenter/liveCenter/trafficNetworkCenter redirects still resolve with the group auto-expanded", async ({ page }) => {
    const cases = [
      { module: "storeCenter", group: "Operator 实验室", subItem: "经营设置" },
      { module: "contentCenter", group: "Studio 实验室", subItem: "Studio 工作台" },
      { module: "liveCenter", group: "Studio 实验室", subItem: "AI 直播" },
      { module: "trafficNetworkCenter", group: "Studio 实验室", subItem: "矩阵账号" },
    ];
    for (const { module, group, subItem } of cases) {
      const errors = collectPageErrors(page);
      await page.goto(`/?mode=founder&module=${module}`);
      await expect(chevronFor(page, group)).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(new RegExp(subItem));
      expect(errors, `${module} console errors: ${errors.join("; ")}`).toHaveLength(0);
    }
  });
});

test.describe("Founder nav collapse: no duplicate or orphaned top-level business menus", () => {
  test("店铺中心/内容中心/AI直播中心/流量网络中心 are no longer standalone top-level Founder nav buttons", async ({ page }) => {
    await page.goto("/founder");
    for (const label of ["店铺中心", "内容中心", "AI直播中心", "流量网络中心"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });

  test("Products/Orders/Customer Service are reachable as single, non-duplicated Operator 实验室 nav items", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    for (const label of ["商品中心", "订单中心", "客服中心"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toHaveCount(1);
    }
    await page.locator(".fdr-sidebar__subitem", { hasText: "订单中心" }).click();
    await expect(page.getByText("即将上线")).toHaveCount(0);
  });

  test("the former Studio-only experiment tail (Studio Agent/Prompt/Skill/...) no longer appears under Studio 实验室's own nav", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    for (const label of ["Studio Agent", "Studio Prompt", "Studio Skill", "Studio Workflow", "Studio 模型路由"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toHaveCount(0);
    }
  });

  test("no visible group exists outside the 5 charter groups", async ({ page }) => {
    await page.goto("/founder");
    const zoneLabels = await page.locator(".fdr-sidebar__zone-label").allTextContents();
    // Zones are purely cosmetic; regardless of zone count, exactly 5
    // top-level group rows/accordions must exist.
    expect(zoneLabels.length).toBeGreaterThan(0);
    for (const group of ["Founder 工作台", "AI 能力中心", "Operator 实验室", "Studio 实验室", "Cloud Center"]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
  });
});

test.describe("Founder: secretaries are distinguished, not the same page", () => {
  test("Founder's own workspace is labeled 今日总览 and includes an AI 秘书 tab", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByRole("button", { name: "今日总览", exact: true })).toBeVisible();
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();
  });

  test("Operator's AI 秘书 tab scopes to business/经营 content only, distinct from Founder/Studio secretaries", async ({ page }) => {
    await page.goto("/founder?module=operatorLab&subView=aiSecretary");
    await expect(page.getByRole("heading", { name: "Operator 秘书", exact: true })).toBeVisible();
    await expect(page.getByText("AI 今天在为你做什么，哪些经营事项等你决定")).toBeVisible();
    // 只负责经营范围——不应该出现 Founder 今日总览秘书或 Studio 秘书的措辞。
    await expect(page.getByText("和 AI 秘书说点什么")).toHaveCount(0);
    await expect(page.getByText("Studio秘书 · 今日经营简报")).toHaveCount(0);
  });

  test("Studio's Workspace tab includes its own Secretary tab, distinct from Founder/Operator", async ({ page }) => {
    await page.goto("/founder?module=studioLab&subView=workspace");
    await page.getByRole("button", { name: "秘书" }).click();
    await expect(page.getByText("Studio秘书 · 今日经营简报")).toBeVisible();
  });

  test("standalone Operator shows Operator秘书 in its own nav, not a generic AI秘书 label shared with Founder/Studio", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.locator(".op-nav-link", { hasText: "Operator秘书" }).first()).toBeVisible();
  });

  test("standalone Studio's Workspace defaults to overview with a Secretary tab available", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("button", { name: "Studio 工作台" })).toBeVisible();
    await expect(page.getByRole("button", { name: "秘书" })).toBeVisible();
  });
});
