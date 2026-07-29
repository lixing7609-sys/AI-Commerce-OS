import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * One-off screenshot capture for Batch 2 acceptance (Phase H of the
 * Founder full-system v3 audit). Not part of the regular regression
 * suite.
 */
const OUT_DIR = path.join("..", "docs", "11-review", "screenshots-batch2");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

async function expandGroup(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(200);
}

async function clickSub(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(300);
}

test("Batch 2 acceptance screenshots", async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto("/");
  await shot(page, "01-founder-sidebar-bare-root");

  await expandGroup(page, "Operator 实验室");
  await shot(page, "02-operator-workbench");

  await clickSub(page, "订单");
  await shot(page, "03-operator-orders");

  await clickSub(page, "广告投放");
  await shot(page, "04-operator-adops");

  await clickSub(page, "自动经营");
  await shot(page, "05-operator-autoops");

  await clickSub(page, "客户");
  await shot(page, "05b-operator-customers");

  await expandGroup(page, "Agent中心");
  await clickSub(page, "Agent 工作室");
  await shot(page, "06-agent-center");

  await expandGroup(page, "Workflow中心");
  await clickSub(page, "自动化策略");
  await shot(page, "07-workflow-center");

  await expandGroup(page, "Cloud Center");
  await clickSub(page, "总览");
  await shot(page, "08-cloud-center");

  fs.writeFileSync(path.join(OUT_DIR, "console-errors.json"), JSON.stringify(errors, null, 2));
  console.log("SCREENSHOTS_DONE", "errors:", errors.length);
});
