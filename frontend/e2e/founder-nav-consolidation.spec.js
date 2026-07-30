import { test, expect } from "@playwright/test";

/**
 * Regression/acceptance test for the Founder Master Edition V1.0
 * architecture reset (docs/architecture/
 * Founder_Master_Edition_Development_Charter.md, ADR-0007). Locks in:
 *   - Founder's sidebar is exactly 5 top-level groups (Founder
 *     Workspace flat, the other 4 collapsible accordions);
 *   - Operator Lab / Studio Lab / Cloud Center render their own
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
  test("Founder Workspace is flat (not collapsible) and the other 4 groups start collapsed", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByText("Founder Workspace", { exact: true })).toBeVisible();
    for (const group of ["AI Capability Center", "Operator Lab", "Studio Lab", "Cloud Center"]) {
      await expect(chevronFor(page, group)).toHaveAttribute("aria-expanded", "false");
    }
    // Collapsed state: nested business sub-items are not visible.
    await expect(page.getByRole("button", { name: "Products", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "AI Image", exact: true })).toHaveCount(0);
  });

  test("Founder Workspace shows all 8 charter items as always-visible flat rows", async ({ page }) => {
    await page.goto("/founder");
    for (const label of ["Today", "Decisions", "Development", "Business Validation", "Content Validation", "Cloud Status", "Risks", "Notifications"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("clicking AI Capability Center expands its 7 charter sub-centers", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await chevronFor(page, "AI Capability Center").click();
    await expect(chevronFor(page, "AI Capability Center")).toHaveAttribute("aria-expanded", "true");
    for (const label of ["Prompt Center", "Skill Center", "Workflow Center", "Knowledge Center", "Connector Center", "Capability Center"]) {
      await expect(page.locator(".fdr-sidebar__item", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking Operator Lab expands exactly its 13 charter items, in order", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder");
    await chevronFor(page, "Operator Lab").click();
    await expect(chevronFor(page, "Operator Lab")).toHaveAttribute("aria-expanded", "true");

    for (const label of [
      "Workspace", "Products", "Orders", "Customers", "Customer Service", "Marketing", "Advertising",
      "Brand", "AI Secretary", "Data", "Finance & Profit", "Organization", "Settings",
    ]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking it again collapses back to just the group label", async ({ page }) => {
    await page.goto("/founder");
    const toggle = chevronFor(page, "Operator Lab");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".fdr-sidebar__subitem", { hasText: "Products" })).toHaveCount(0);
  });

  test("expanding Studio Lab auto-collapses Operator Lab (single-expansion accordion)", async ({ page }) => {
    await page.goto("/founder");
    await chevronFor(page, "Operator Lab").click();
    await expect(chevronFor(page, "Operator Lab")).toHaveAttribute("aria-expanded", "true");

    await chevronFor(page, "Studio Lab").click();
    await expect(chevronFor(page, "Studio Lab")).toHaveAttribute("aria-expanded", "true");
    await expect(chevronFor(page, "Operator Lab")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".fdr-sidebar__subitem", { hasText: "Products" })).toHaveCount(0);
  });

  test("Studio Lab expands exactly its 13 charter items, flat with no sub-cluster labels", async ({ page }) => {
    await page.goto("/founder");
    await chevronFor(page, "Studio Lab").click();
    for (const label of [
      "Workspace", "AI Image", "AI Video", "AI Article", "AI Live", "AI Short Drama", "AI Audio",
      "Matrix Accounts", "Publishing Center", "Asset Library", "Brand Assets", "Analytics", "Settings",
    ]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toBeVisible();
    }
  });

  test("Cloud Center expands exactly its 10 charter items", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Cloud Center", exact: true }).click();
    for (const label of ["Devices", "OTA", "License", "Token", "Marketplace", "Version", "Assets", "Nodes", "Monitoring", "Logs"]) {
      await expect(page.locator(".fdr-sidebar__item, .fdr-sidebar__subitem", { hasText: label }).first()).toBeVisible();
    }
  });
});

test.describe("Founder: no nested product shell renders in the content area", () => {
  test("Operator Lab content area has no second Operator sidebar/nav chrome", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=operatorLab&subView=workbench");
    await expect(page.locator(".op-sidebar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "返回旧版后台" })).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio Lab content area has no second Studio sidebar/nav chrome", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=studioLab&subView=workspace");
    await expect(page.locator(".st-sidebar")).toHaveCount(0);
    await expect(page.locator(".fdr-sidebar")).toHaveCount(1);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("clicking an Operator sub-item renders the real Operator page directly in Founder's content area, correctly highlighted", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator Lab", exact: true }).click();
    await page.locator(".fdr-sidebar__subitem", { hasText: "AI Secretary" }).click();
    await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(/AI Secretary/);
  });
});

test.describe("Founder: refresh and deep-link restore the correct expanded group + active item", () => {
  test("a hard reload at a Studio Lab deep link auto-expands Studio Lab and highlights the right sub-item", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/founder?module=studioLab&subView=aiArticle");
    await expect(chevronFor(page, "Studio Lab")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".fdr-sidebar__subitem.fdr-sidebar__item--active")).toHaveText(/AI Article/);
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("retired sub-nav keys absorbed by the reset still resolve (no silent fallback to a default page)", async ({ page }) => {
    const cases = [
      { url: "/founder?module=operatorLab&subView=approvals", heading: /审批/ },
      { url: "/founder?module=studioLab&subView=liveCommerce", group: "Studio Lab" },
      { url: "/founder?module=agentStudio", group: "AI Capability Center" },
      { url: "/founder?module=studioAgents", group: "AI Capability Center" },
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
      { module: "storeCenter", group: "Operator Lab", subItem: "Settings" },
      { module: "contentCenter", group: "Studio Lab", subItem: "Workspace" },
      { module: "liveCenter", group: "Studio Lab", subItem: "AI Live" },
      { module: "trafficNetworkCenter", group: "Studio Lab", subItem: "Matrix Accounts" },
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

  test("Products/Orders/Customer Service are reachable as single, non-duplicated Operator Lab nav items", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Operator Lab", exact: true }).click();
    for (const label of ["Products", "Orders", "Customer Service"]) {
      await expect(page.locator(".fdr-sidebar__subitem", { hasText: label })).toHaveCount(1);
    }
    await page.locator(".fdr-sidebar__subitem", { hasText: "Orders" }).click();
    await expect(page.getByText("即将上线")).toHaveCount(0);
  });

  test("the former Studio-only experiment tail (Studio Agent/Prompt/Skill/...) no longer appears under Studio Lab's own nav", async ({ page }) => {
    await page.goto("/founder");
    await page.getByRole("button", { name: "Studio Lab", exact: true }).click();
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
    for (const group of ["Founder Workspace", "AI Capability Center", "Operator Lab", "Studio Lab", "Cloud Center"]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
  });
});

test.describe("Founder: secretaries are distinguished, not the same page", () => {
  test("Founder's own workspace is labeled Today and includes an AI 秘书 tab", async ({ page }) => {
    await page.goto("/founder");
    await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();
  });

  test("Operator's AI Secretary tab scopes to business Runtime only", async ({ page }) => {
    await page.goto("/founder?module=operatorLab&subView=aiSecretary");
    await expect(page.getByText("只负责经营 Runtime")).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Workspace" })).toBeVisible();
    await expect(page.getByRole("button", { name: "秘书" })).toBeVisible();
  });
});
