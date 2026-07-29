import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * One-off audit crawl for docs/11-review/founder-v3-runtime-error-report.md
 * (Phase 2 of the Founder full-system v3 audit). Not part of the regular
 * regression suite — walks every sidebar entry reachable from /founder,
 * capturing console errors, pageerrors, and a screenshot per page. Safe to
 * delete once the audit report is written; not wired into CI.
 */

const SCREEN_DIR = path.join("e2e-report", "founder-v3-crawl");
fs.mkdirSync(SCREEN_DIR, { recursive: true });

const OVERVIEW_ITEMS = ["AI 秘书处", "今日经营"];
const GROUPS = ["产品研发中心", "Operator 实验室", "Studio 实验室", "Marketplace 中心", "系统与发布"];

function slug(s, i) {
  return `${String(i).padStart(2, "0")}_${s.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}`;
}

test("Founder v3 full crawl", async ({ page }) => {
  test.setTimeout(600000);
  const report = [];

  async function visitCurrentSubitems(groupLabel) {
    const subitems = page.locator(".fdr-sidebar__subitem");
    const count = await subitems.count();
    const labels = [];
    for (let i = 0; i < count; i++) {
      labels.push((await subitems.nth(i).innerText()).trim());
    }
    for (let i = 0; i < labels.length; i++) {
      const errors = [];
      const onErr = (err) => errors.push(String(err));
      const onConsole = (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      };
      page.on("pageerror", onErr);
      page.on("console", onConsole);

      let clickError = null;
      try {
        // Re-query each time: clicking can re-render the subitem list.
        const items = page.locator(".fdr-sidebar__subitem");
        await items.nth(i).click({ timeout: 10000 });
        await page.waitForTimeout(400);
      } catch (e) {
        clickError = String(e).slice(0, 300);
      }

      const shotName = `${slug(groupLabel, report.length)}__${slug(labels[i], i)}.png`;
      let bodyText;
      try {
        bodyText = (await page.locator("main").innerText({ timeout: 3000 })).slice(0, 200);
      } catch {
        bodyText = "(no <main> text captured)";
      }
      try {
        await page.screenshot({ path: path.join(SCREEN_DIR, shotName), fullPage: true });
      } catch {
        // ignore screenshot failures, still record the row
      }

      page.off("pageerror", onErr);
      page.off("console", onConsole);

      report.push({
        group: groupLabel,
        label: labels[i],
        index: i,
        clickError,
        consoleErrors: errors,
        bodyPreview: bodyText,
        screenshot: shotName,
      });
    }
  }

  await page.goto("/founder");
  await page.waitForTimeout(500);

  // Founder 总览 (always expanded, not collapsible)
  await visitCurrentSubitemsForOverview();

  async function visitCurrentSubitemsForOverview() {
    for (const label of OVERVIEW_ITEMS) {
      const errors = [];
      const onErr = (err) => errors.push(String(err));
      const onConsole = (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      };
      page.on("pageerror", onErr);
      page.on("console", onConsole);
      let clickError = null;
      try {
        await page.getByRole("button", { name: label, exact: true }).click({ timeout: 10000 });
        await page.waitForTimeout(400);
      } catch (e) {
        clickError = String(e).slice(0, 300);
      }
      const shotName = `${slug("overview", report.length)}__${slug(label, 0)}.png`;
      let bodyText;
      try {
        bodyText = (await page.locator("main").innerText({ timeout: 3000 })).slice(0, 200);
      } catch {
        bodyText = "(no <main> text captured)";
      }
      try {
        await page.screenshot({ path: path.join(SCREEN_DIR, shotName), fullPage: true });
      } catch {
        // ignore screenshot failures, still record the row
      }
      page.off("pageerror", onErr);
      page.off("console", onConsole);
      report.push({ group: "Founder 总览", label, index: 0, clickError, consoleErrors: errors, bodyPreview: bodyText, screenshot: shotName });
    }
  }

  for (const groupLabel of GROUPS) {
    try {
      await page.getByRole("button", { name: groupLabel, exact: true }).click({ timeout: 10000 });
      await page.waitForTimeout(400);
    } catch (e) {
      report.push({ group: groupLabel, label: "(failed to expand group)", clickError: String(e).slice(0, 300), consoleErrors: [], bodyPreview: "", screenshot: "" });
      continue;
    }
    await visitCurrentSubitems(groupLabel);
  }

  fs.writeFileSync(path.join(SCREEN_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log("CRAWL_DONE", report.length, "entries");
});
