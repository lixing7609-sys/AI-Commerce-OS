import { test, expect } from "@playwright/test";

/**
 * Founder Master Edition V1.0 full leaf-page crawl (docs/architecture/
 * Founder_Master_Edition_Development_Charter.md, ADR-0007). Replaces the
 * prior one-off audit crawl (阶段 Founder full-system v3 Phase 2), which
 * targeted an even older pre-11-group IA and swallowed every navigation
 * failure into a report instead of asserting — it passed vacuously
 * regardless of what actually rendered. This version visits every visible
 * leaf across all 5 frozen groups and asserts: the click succeeds, no
 * console/page errors, content actually renders, and no placeholder text
 * ("即将上线"/"敬请期待"/"Coming Soon"/etc.) is shown — the Workbench
 * Principle (Charter §6).
 */

const PLACEHOLDER_STRINGS = ["即将上线", "敬请期待", "尚未开放", "建设中", "Coming Soon", "coming soon"];

const FOUNDER_WORKSPACE_ITEMS = [
  "Today", "Decisions", "Development", "Business Validation", "Content Validation", "Cloud Status", "Risks", "Notifications",
];

const AI_CAPABILITY_CENTER_ITEMS = [
  "Prompt Center", "Skill Center", "Workflow Center", "Knowledge Center", "Connector Center", "Capability Center",
];

const OPERATOR_LAB_ITEMS = [
  "Workspace", "Products", "Orders", "Customers", "Customer Service", "Marketing", "Advertising",
  "Brand", "AI Secretary", "Data", "Finance & Profit", "Organization", "Settings",
];

const STUDIO_LAB_ITEMS = [
  "Workspace", "AI Image", "AI Video", "AI Article", "AI Live", "AI Short Drama", "AI Audio",
  "Matrix Accounts", "Publishing Center", "Asset Library", "Brand Assets", "Analytics", "Settings",
];

const CLOUD_CENTER_ITEMS = ["Devices", "OTA", "License", "Token", "Marketplace", "Version", "Assets", "Nodes", "Monitoring", "Logs"];

function chevronFor(page, name) {
  return page.getByRole("button", { name: new RegExp(`^(展开|收起)${name}$`) });
}

test.describe("Founder v3 full crawl (Founder Master Edition Charter §3 — every visible leaf page)", () => {
  test("Founder Workspace: all 8 flat items render real content with zero console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    for (const label of FOUNDER_WORKSPACE_ITEMS) {
      await page.locator(".fdr-sidebar__item", { hasText: label }).first().click();
      await expect(page.locator(".fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("AI Capability Center: all 7 sub-centers render real content with zero console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await page.getByRole("button", { name: "AI Capability Center", exact: true }).click();
    await expect(page.locator(".fdr-content")).not.toBeEmpty();
    for (const placeholder of PLACEHOLDER_STRINGS) {
      await expect(page.getByText(placeholder)).toHaveCount(0);
    }

    for (const label of AI_CAPABILITY_CENTER_ITEMS) {
      await page.locator(".fdr-sidebar__item", { hasText: label }).click();
      await expect(page.locator(".fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Operator Lab: all 13 leaf items render real content with zero console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await chevronFor(page, "Operator Lab").click();
    for (const label of OPERATOR_LAB_ITEMS) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Studio Lab: all 13 leaf items render real content with zero console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await chevronFor(page, "Studio Lab").click();
    for (const label of STUDIO_LAB_ITEMS) {
      await page.locator(".fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Cloud Center: all 10 leaf items render real content with zero console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.goto("/founder");
    await page.getByRole("button", { name: "Cloud Center", exact: true }).click();
    for (const label of CLOUD_CENTER_ITEMS) {
      await page.locator(".fdr-sidebar__item, .fdr-sidebar__subitem", { hasText: label }).first().click();
      await page.waitForTimeout(150);
      await expect(page.locator("main, .fdr-content")).not.toBeEmpty();
      for (const placeholder of PLACEHOLDER_STRINGS) {
        await expect(page.getByText(placeholder), `"${label}" shows placeholder text "${placeholder}"`).toHaveCount(0);
      }
    }
    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});
