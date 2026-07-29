import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Design DNA v1.1 (Founder Navigation Shell) acceptance screenshots —
 * one-off capture, same convention as the v1.0 screenshot specs.
 * Every shot is fullPage so the complete shell (sidebar + workspace)
 * is visible, never cropped.
 */
const OUT_DIR = path.join("..", "docs", "11-review", "design-dna-v1.1-screenshots");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

test("Design DNA v1.1 navigation shell screenshots", async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  // 1. Expanded sidebar — 1440px
  await shot(page, "01-founder-sidebar-expanded-1440");

  // 2. Collapsed sidebar — 1440px
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await shot(page, "02-founder-sidebar-collapsed-1440");

  // expand back for the next shots
  await page.getByRole("button", { name: "展开侧边栏" }).click();

  // 3. Operator实验室 expanded — 1440px
  await page.getByRole("button", { name: "Operator 实验室", exact: true }).click();
  await shot(page, "03-operator-lab-expanded-1440");

  // 4. Studio实验室 expanded — 1440px
  await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
  await shot(page, "04-studio-lab-expanded-1440");

  // 5. Sidebar — 1280px
  await page.setViewportSize({ width: 1280, height: 900 });
  await shot(page, "05-founder-sidebar-1280");

  // 6. Sidebar — 1024px (forced collapse)
  await page.setViewportSize({ width: 1024, height: 900 });
  await shot(page, "06-founder-sidebar-1024-forced-collapse");

  // 7. Collapsed flyout
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await page.getByRole("button", { name: "Studio 实验室", exact: true }).click();
  await shot(page, "07-collapsed-flyout");

  // 8. Keyboard focus state
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await page.keyboard.press("Tab"); // collapse toggle
  await page.keyboard.press("Tab"); // store scope select
  await page.keyboard.press("Tab"); // first nav item
  await shot(page, "08-keyboard-focus-state");

  // 9. Design DNA navigation showcase
  await page.goto("/?module=designDna");
  await page.getByRole("button", { name: "Navigation & Application Shell", exact: true }).click();
  await shot(page, "09-design-dna-navigation-showcase");

  // 10. Founder工作台 with redesigned full shell
  await page.goto("/");
  await shot(page, "10-founder-workbench-full-shell");

  fs.writeFileSync(path.join(OUT_DIR, "console-errors.json"), JSON.stringify(errors, null, 2));
  console.log("SCREENSHOTS_DONE", "errors:", errors.length);
});
