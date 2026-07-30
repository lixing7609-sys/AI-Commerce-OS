import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Design DNA v1.0 acceptance screenshots (docs/01-foundation/design/).
 * Not part of the regular regression suite — one-off capture, same
 * convention as founder-v3-batch2-screenshots.spec.js. The Founder工作台
 * pilot is captured at all three required viewports (1440/1280/1024)
 * to prove responsive behavior; the remaining shots are captured once
 * at 1440 as representative documentation.
 */
const OUT_DIR = path.join("..", "docs", "11-review", "design-dna-v1-screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

test("Design DNA v1.0 acceptance screenshots", async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // 1. Founder工作台 pilot at all three required viewports.
  for (const [name, size] of [["1440", { width: 1440, height: 900 }], ["1280", { width: 1280, height: 900 }], ["1024", { width: 1024, height: 900 }]]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await shot(page, `01-founder-pilot-secretary-${name}`);
    await page.getByRole("button", { name: "今日经营", exact: true }).click();
    await shot(page, `01-founder-pilot-dashboard-${name}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  // 2. Design DNA showcase — all four tabs.
  await page.goto("/?module=designDna");
  await shot(page, "02-showcase-foundations");
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await shot(page, "02-showcase-components");
  await page.getByRole("button", { name: "AI Interaction Language", exact: true }).click();
  await shot(page, "02-showcase-ai-interaction-language");
  await page.getByRole("button", { name: "Product Examples", exact: true }).click();
  await shot(page, "02-showcase-product-examples");

  // 3. Expanded vs collapsed sidebar nav group (Founder Workspace's own
  // group is pinned non-collapsible, so AI Capability Center
  // demonstrates both states of the accordion pattern). The chevron
  // toggles expand/collapse; the group label itself only navigates.
  await page.goto("/");
  const capabilityChevron = page.getByRole("button", { name: /展开AI Capability Center|收起AI Capability Center/ });
  await capabilityChevron.click();
  await shot(page, "03-sidebar-group-expanded");
  await capabilityChevron.click();
  await shot(page, "04-sidebar-group-collapsed");

  // 4. AI recommendation flow (live, real component instances on the
  // pilot page, not just the showcase demo).
  await page.goto("/");
  await shot(page, "05-ai-recommendation-flow");

  // 5. Form components and 6. data components (showcase Components tab).
  await page.goto("/?module=designDna");
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await shot(page, "06-form-and-data-components");

  fs.writeFileSync(path.join(OUT_DIR, "console-errors.json"), JSON.stringify(errors, null, 2));
  console.log("SCREENSHOTS_DONE", "errors:", errors.length);
});
