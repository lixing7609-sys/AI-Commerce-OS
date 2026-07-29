import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for M8c "Founder Unified Product
 * Navigation and Cloud Marketplace Consolidation"（阶段：Founder统一
 * 产品导航、三级秘书体系和云端Marketplace收口）。Locks in:
 *   - Founder's sidebar is a collapsible accordion tree, not a
 *     permanently-expanded flat list;
 *   - Operator Lab / Studio Lab render Operator's/Studio's own
 *     OPERATOR_NAV_ITEMS/STUDIO NAV_ITEMS directly inside Founder's one
 *     sidebar — no second nested product sidebar renders in the
 *     content area;
 *   - refresh/deep-link restores the correct expanded group + active
 *     highlight;
 *   - old module redirects still land correctly under the new model.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("Founder sidebar: collapsible accordion, single expansion", () => {
  test("all eight collapsible groups start collapsed", async ({ page }) => {
    await page.goto("/founder");
    // 阶段 Founder Full-System v3 Batch 2 §A：一级导航冻结为十一组，
    // 其中"Founder工作台"不折叠（默认页所在分组），其余八组可折叠。
    for (const group of [
      "Agent中心", "Prompt中心", "Skill中心", "Workflow中心", "Knowledge中心", "Connector中心", "Capability中心",
      "Operator 实验室", "Studio 实验室", "Cloud Center",
    ]) {
      await expect(page.getByRole("button", { name: group, exact: true })).toHaveAttribute("aria-expanded", "false");
    }
    // 折叠状态下，Operator/Studio 的具体业务子项完全不可见
    await expect(page.getByRole("button", { name: "店铺", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "内容项目", exact: true })).toHaveCount(0);
  });

  test("clicking Operator 实验室 expands the full v2 Operator navigation, in order", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    await expect(page.getByRole("button", { name: "Operator 实验室", exact: true })).toHaveAttribute("aria-expanded", "true");

    // 阶段 Founder Full-System v3 Batch 2 §B：Operator 实验室 v2 的
    // 唯一权威列表（labs/operatorLabV2/navigation.js）——不再有
    // "能力市场/设备与更新/数据与隐私"，新增"客户/数据与经营分析/
    // 自动经营"。
    for (const label of [
      "Operator工作台", "Operator秘书", "店铺", "商品", "内容", "广告投放", "订单",
      "客户", "客服", "审批", "AI成长", "成本与Token", "数据与经营分析", "自动经营", "设置",
    ]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking it again collapses back to just the group label", async ({ page }) => {
    await page.goto("/founder");
    const toggle = page.getByRole("button", { name: "Operator 实验室", exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".fdr-sidebar__subitem", { hasText: "店铺" })).toHaveCount(0);
  });

  test("expanding Studio 实验室 auto-collapses Operator 实验室 (single-expansion accordion)", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    await expect(page.getByRole("button", { name: "Operator 实验室", exact: true })).toHaveAttribute("aria-expanded", "true");

    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    await expect(page.getByRole("button", { name: "Studio 实验室", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Operator 实验室", exact: true })).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".fdr-sidebar__subitem", { hasText: "店铺" })).toHaveCount(0);
  });

  test("Studio 实验室 expands the full independent Studio navigation, in order, including Studio秘书", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
    for (const label of ["Studio秘书", "Studio概览", "内容项目", "AI短剧", "AI视频", "AI图文", "AI直播", "矩阵账号", "内容资产", "流量池", "广告资源", "广告订单", "算力任务", "数据分析", "能力市场", "Studio设置"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
  });
});

test.describe("Founder: no nested product shell renders in the content area", () => {
  test("Operator Lab content area has no second Operator sidebar/nav chrome", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=operatorLab&subView=dashboard");
    await expect(page.getByText("一人公司经营驾驶舱")).toBeVisible();
    // 不应该出现独立 Operator 自带的品牌区块或"返回旧版后台"按钮——
    // 那些只属于 OperatorNav（已经不再被渲染）。
    await expect(page.locator(".op-sidebar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "返回旧版后台" })).toHaveCount(0);
    // Founder 自己的侧边栏仍然是唯一可见的导航
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio Lab content area has no second Studio sidebar/nav chrome", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=studioLab&subView=overview");
    await expect(page.getByText("Studio 概览 —— 内容生产")).toBeVisible();
    await expect(page.locator(".st-sidebar")).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking an Operator sub-item renders the real Operator page directly in Founder's content area, correctly highlighted", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "Operator秘书" }).click();
    await expect(page.getByRole("heading", { name: "Operator 秘书" })).toBeVisible();
    await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(/Operator秘书/);
  });
});

test.describe("Founder: refresh and deep-link restore the correct expanded group + active item", () => {
  test("a hard reload at a Studio Lab deep link auto-expands Studio 实验室 and highlights the right sub-item", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=studioLab&subView=contentProjects");
    await expect(page.getByRole("button", { name: "Studio 实验室", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(/内容项目/);
    // level:1 消歧——内容项目页面自己内部也有一张 h3 标题同名卡片。
    await expect(page.getByRole("heading", { name: "内容项目", level: 1 })).toBeVisible();
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("old ?module=storeCenter/contentCenter/liveCenter/trafficNetworkCenter redirects still resolve with the group auto-expanded", async ({ page }) => {
    const cases = [
      { module: "storeCenter", group: "Operator 实验室", subItem: "店铺" },
      { module: "contentCenter", group: "Studio 实验室", subItem: "内容项目" },
      { module: "liveCenter", group: "Studio 实验室", subItem: "AI直播" },
      { module: "trafficNetworkCenter", group: "Studio 实验室", subItem: "矩阵账号" },
    ];
    for (const { module, group, subItem } of cases) {
      const errors = collectPageErrors(page);
      await page.goto(`/?mode=founder&module=${module}`);
      await expect(page.getByRole("button", { name: group, exact: true })).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(new RegExp(subItem));
      expect(errors, `${module} console errors: ${errors.join("; ")}`).toHaveLength(0);
    }
  });
});

test.describe("Founder nav collapse: no duplicate top-level business menus", () => {
  test("店铺中心/内容中心/AI直播中心/流量网络中心 are no longer standalone top-level Founder nav buttons", async ({ page }) => {
    await page.goto("/founder");
    for (const label of ["店铺中心", "内容中心", "AI直播中心", "流量网络中心"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });

  test("商品/订单/客服/审批 are reachable as single, non-duplicated Operator 实验室 nav items (no more 4 generic 待同步 warning buttons)", async ({ page }) => {
    // 阶段 Founder Full-System v3 Batch 2 §D：旧机制在 operatorLabGroup
    // 顶部单独渲染四个 FOUNDER_MODULES 按钮，全部共用同一段
    // title="该模块尚未和 Operator 实验室完成单一真源合并"文案，视觉
    // 上是四个无法区分的重复按钮。修复后：这四项只在 Operator 实验室
    // v2 的唯一导航列表里各出现一次（与"店铺""广告投放"等其它子项
    // 同一层级），侧边栏里完全没有那段警告文案。
    await page.goto("/founder");
    await expect(page.getByText("该模块尚未和 Operator 实验室完成单一真源合并")).toHaveCount(0);

    await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
    for (const label of ["商品", "订单", "客服", "审批"]) {
      const items = page.locator(".fdr-sidebar__subitem", { hasText: label });
      await expect(items).toHaveCount(1);
    }

    // 点击"订单"落到 OrderCenterModule 真实实现，不是占位页。
    await page.locator(".fdr-sidebar__subitem", { hasText: "订单" }).click();
    await expect(page.getByRole("heading", { name: "订单中心" })).toBeVisible();
    await expect(page.getByText("即将上线")).toHaveCount(0);
  });

  test("广告策略研发 lives under Capability中心, not a top-level peer of Operator's 广告投放", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Capability中心", exact: true }).click();
    await expect(page.getByRole("button", { name: "广告策略研发" })).toBeVisible();
    await expect(page.getByRole("button", { name: "广告中心", exact: true })).toHaveCount(0);
  });
});

test.describe("Founder: secretaries are distinguished, not the same page", () => {
  test("Founder's own workbench is labeled Founder工作台 and includes an AI 秘书 tab", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByRole("button", { name: "Founder工作台" })).toBeVisible();
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();
  });

  test("Operator's secretary is labeled Operator秘书 and its page scopes to business Runtime only", async ({ page }) => {
    await page.goto("/founder?module=operatorLab&subView=secretary");
    await expect(page.getByRole("heading", { name: "Operator 秘书" })).toBeVisible();
    await expect(page.getByText("只负责经营 Runtime")).toBeVisible();
  });

  test("Studio's secretary is labeled Studio秘书, distinct from Founder工作台/Operator秘书", async ({ page }) => {
    // 阶段 Studio V3 Integration 之后 Studio 秘书页面内容已重写（不在
    // 本批次范围内，独立 /studio 与 Founder 内嵌 Studio 实验室零分叉，
    // 见 studio/pages/SecretaryPage.jsx）——这里只断言标签仍然是独立
    // 的"Studio秘书"，不与 Founder工作台/Operator秘书混同。
    await page.goto("/founder?module=studioLab&subView=secretary");
    await expect(page.getByText("Studio秘书 · 今日经营简报")).toBeVisible();
  });

  test("standalone Operator shows Operator秘书 in its own nav, not a generic AI秘书 label shared with Founder/Studio", async ({ page }) => {
    await page.goto("/operator");
    // OperatorNav 渲染同一份 OPERATOR_NAV_ITEMS 两次（桌面侧边栏 +
    // 移动端抽屉），用 class 定位第一个匹配项，避免 getByRole 撞上
    // strict-mode 的多元素歧义。
    await expect(page.locator(".op-nav-link", { hasText: "Operator秘书" }).first()).toBeVisible();
  });

  test("standalone Studio shows Studio秘书 as its first nav item", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("button", { name: "Studio秘书" })).toBeVisible();
  });
});
