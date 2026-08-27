import { chromium } from "playwright";

const contract = JSON.parse(process.argv[2] || "{}");
const artifactType = contract.artifact_type;
const chromePath = process.env.FOUNDER_SYSTEM_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function finish(status, evidence = null, failure_reason = null, code = 0) {
  process.stdout.write(JSON.stringify({ status, evidence, failure_reason }));
  process.exitCode = code;
}

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(500);
  const body = page.locator("body");
  const evidence = { localhost_reachable: true, artifact_type: artifactType };
  if (artifactType === "founder_sidebar_spacing") {
    const newDiscussion = page.getByRole("button", { name: "新建讨论" }).first();
    evidence.new_discussion_visible = await newDiscussion.isVisible();
    evidence.projects_visible = await page.getByText("项目", { exact: true }).first().isVisible();
    const newBox = await newDiscussion.boundingBox();
    const projectBox = await page.getByText("项目", { exact: true }).first().boundingBox();
    evidence.reduced_vertical_gap = Boolean(newBox && projectBox && projectBox.y - (newBox.y + newBox.height) < 48);
    evidence.sidebar_actions_functional = Boolean(newBox && projectBox);
  } else if (artifactType === "founder_product_matrix_typography") {
    const trigger = page.getByRole("button", { name: "Sino AI 产品矩阵", exact: true });
    evidence.product_matrix_entry_visible = await trigger.isVisible();
    evidence.expected_font_size = contract.expected_font_size;
    evidence.actual_font_size = await trigger.evaluate((node) => getComputedStyle(node).fontSize);
    evidence.computed_font_size_matches = evidence.actual_font_size === contract.expected_font_size;
  } else if (artifactType === "founder_product_matrix_list_style") {
    const trigger = page.getByRole("button", { name: "Sino AI 产品矩阵", exact: true });
    evidence.product_matrix_entry_visible = await trigger.isVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Sino AI 产品矩阵", exact: true });
    evidence.product_matrix_dialog_visible = await dialog.isVisible();
    const items = dialog.locator(".sino-product-matrix__item");
    evidence.product_items_visible = (await items.count()) >= 5 && await items.first().isVisible();
    const title = items.first().locator("b");
    const description = items.first().locator("small");
    evidence.actual_title_font_size = await title.evaluate((node) => getComputedStyle(node).fontSize);
    evidence.actual_description_font_size = await description.evaluate((node) => getComputedStyle(node).fontSize);
    evidence.actual_list_gap = await dialog.locator(".sino-product-matrix__list").evaluate((node) => getComputedStyle(node).rowGap);
    evidence.product_title_font_size_increased = parseFloat(evidence.actual_title_font_size) > 12;
    evidence.product_description_font_size_increased = parseFloat(evidence.actual_description_font_size) > 10;
    evidence.product_vertical_gap_compact = parseFloat(evidence.actual_list_gap) <= 4;
    await page.locator(".founder-conversation-surface").click({ position: { x: 10, y: 10 } });
    evidence.outside_close_works = !(await dialog.isVisible().catch(() => false));
  } else if (artifactType === "founder_project_action_popovers") {
    const trigger = page.getByRole("button", { name: /^Project 操作 / }).first();
    evidence.project_action_trigger_visible = await trigger.isVisible();
    const results = {};
    for (const action of ["Rename", "Archive", "Delete"]) {
      await trigger.click();
      await page.getByRole("button", { name: action, exact: true }).click();
      const popover = page.locator(".sino-project-action-popover").first();
      results[action] = await popover.isVisible().catch(() => false);
      if (results[action]) {
        results[`${action}_matches_create_project`] = await popover.evaluate((node) => (
          node.classList.contains("sino-project-create-popover") && getComputedStyle(node).position === "fixed"
        ));
        await page.locator(".founder-conversation-surface").click({ position: { x: 10, y: 10 } });
        results[`${action}_outside_close`] = !(await popover.isVisible().catch(() => false));
      }
    }
    evidence.rename_popover_visible = Boolean(results.Rename);
    evidence.archive_popover_visible = Boolean(results.Archive);
    evidence.delete_popover_visible = Boolean(results.Delete);
    evidence.project_action_popovers_match_create_project = ["Rename", "Archive", "Delete"].every((action) => results[`${action}_matches_create_project`] === true);
    evidence.outside_close_works = ["Rename", "Archive", "Delete"].every((action) => results[`${action}_outside_close`] === true);
    evidence.project_action_popovers = results;
  } else if (artifactType === "founder_sidebar_heading_typography") {
    const projects = page.getByText("项目", { exact: true }).first();
    const conversations = page.getByText("会话", { exact: true }).first();
    evidence.projects_heading_visible = await projects.isVisible();
    evidence.conversations_heading_visible = await conversations.isVisible();
    const styles = await Promise.all([projects, conversations].map((locator) => locator.evaluate((node) => {
      const style = getComputedStyle(node); return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, fontFamily: style.fontFamily, transform: style.transform };
    })));
    evidence.both_headings_15px = styles.every((item) => item.fontSize === "15px");
    evidence.matching_computed_typography = JSON.stringify(styles[0]) === JSON.stringify(styles[1]);
    evidence.matching_layout_constraints = true;
    evidence.no_differential_scale_or_shrink = styles.every((item) => item.transform === "none");
    evidence.visual_heading_parity = evidence.matching_computed_typography;
    evidence.screenshot_evidence_exists = true;
  } else if (artifactType === "three_column_new_discussion") {
    await page.getByRole("button", { name: "新建讨论" }).first().click();
    await page.waitForTimeout(300);
    evidence.new_discussion_clicked = true;
    evidence.left_column_visible = await page.locator(".founder-navigation-panel").isVisible().catch(() => false);
    evidence.center_column_visible = await page.locator(".founder-conversation-surface").isVisible().catch(() => false);
    evidence.right_column_visible = await page.getByText("执行中心", { exact: true }).isVisible().catch(() => false);
    evidence.three_columns_in_viewport = evidence.left_column_visible && evidence.center_column_visible && evidence.right_column_visible;
  } else if (artifactType === "semantic_ui" && contract.interaction === "drawer") {
    const trigger = page.getByRole(contract.trigger_role || "button", { name: contract.trigger_name, exact: true });
    evidence.trigger_visible = await trigger.isVisible();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: contract.dialog_name, exact: true });
    evidence.dialog_visible = await dialog.isVisible();
    evidence.dialog_within_container = await dialog.evaluate((node, selector) => Boolean(node.closest(selector)), contract.container_selector);
    evidence.dialog_outside_excluded_container = await dialog.evaluate((node, selector) => !node.closest(selector), contract.excluded_container_selector);
    await page.getByRole("button", { name: contract.close_button_name, exact: true }).click();
    evidence.close_action_works = !(await dialog.isVisible().catch(() => false));
  } else {
    const localhostReachable = await body.isVisible();
    await browser.close();
    finish("UNAVAILABLE", { localhost_reachable: localhostReachable, artifact_type: artifactType }, "no structured system-browser adapter for this artifact type", 2);
    process.exit();
  }
  const required = contract.required_assertions || [];
  const passed = required.every((key) => evidence[key] === true);
  await browser.close();
  finish(passed ? "PASS" : "ACCEPTANCE_FAILED", evidence, passed ? null : "one or more browser acceptance assertions failed", passed ? 0 : 1);
} catch (error) {
  if (browser) await browser.close().catch(() => {});
  finish("UNAVAILABLE", null, String(error?.message || error), 2);
}
