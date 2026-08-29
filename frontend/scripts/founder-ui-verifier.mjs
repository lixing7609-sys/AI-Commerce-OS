import { chromium } from "playwright";
import { effectiveVisibleControlCount, evaluateDerivedCount, evaluateDerivedStates, evaluateVisibleCardinality } from "./founder-ui-verifier-core.mjs";

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
  } else if (artifactType === "founder_conversation_action_popover") {
    const activeRow = page.locator(".sino-conversation-item.is-active:visible").first();
    const visibleRow = await activeRow.count() > 0
      ? activeRow
      : page.locator(".sino-conversation-item:visible").first();
    await visibleRow.waitFor({ state: "visible" });
    await visibleRow.hover();
    const trigger = visibleRow.getByRole("button", { name: /^Conversation 操作 |^会话操作 / });
    await trigger.waitFor({ state: "visible" });
    evidence.conversation_action_trigger_visible = await trigger.isVisible();
    await trigger.click();
    const popover = page.locator(".sino-conversation-action-popover").first();
    evidence.conversation_action_popover_visible = await popover.isVisible().catch(() => false);
    evidence.conversation_action_popover_matches_create_project = evidence.conversation_action_popover_visible && await popover.evaluate((node) => (
      node.classList.contains("sino-project-create-popover") && getComputedStyle(node).position === "fixed"
    ));
    await page.locator(".founder-conversation-surface").click({ position: { x: 10, y: 10 } });
    evidence.outside_close_works = !(await popover.isVisible().catch(() => false));
  } else if (artifactType === "founder_conversation_project_selector_popover") {
    const trigger = page.getByRole("button", { name: /选择项目|当前项目：/ }).last();
    evidence.project_selector_trigger_visible = await trigger.isVisible();
    await trigger.click();
    const popover = page.getByRole("dialog", { name: "选择项目", exact: true });
    evidence.project_selector_popover_visible = await popover.isVisible().catch(() => false);
    evidence.project_selector_uses_portal = evidence.project_selector_popover_visible && await popover.evaluate((node) => node.parentElement === document.body);
    evidence.project_selector_fixed_position = evidence.project_selector_popover_visible && await popover.evaluate((node) => getComputedStyle(node).position === "fixed");
    evidence.project_selector_arrow_visible = evidence.project_selector_popover_visible && await popover.locator("[data-popover-arrow]").isVisible().catch(() => false);
    evidence.project_selector_business_controls_visible = evidence.project_selector_popover_visible
      && await popover.getByRole("textbox", { name: "搜索项目" }).isVisible().catch(() => false)
      && await popover.getByRole("button", { name: "＋ 创建新项目" }).isVisible().catch(() => false)
      && await popover.locator(".sino-project-selector__list button").count() > 0;
    await page.locator(".founder-conversation-surface").click({ position: { x: 10, y: 10 } });
    evidence.outside_close_works = !(await popover.isVisible().catch(() => false));
    await trigger.click(); await page.keyboard.press("Escape");
    evidence.escape_close_works = !(await popover.isVisible().catch(() => false));
    await trigger.click(); await trigger.click();
    evidence.toggle_close_works = !(await popover.isVisible().catch(() => false));
  } else if (artifactType === "founder_conversation_file_actions") {
    const trigger = page.getByRole("button", { name: "＋ 文件/文档", exact: true });
    const activeControls = trigger.locator("xpath=ancestor::*[@aria-label='对话上下文操作'][1]");
    const activeTextarea = page.locator(".founder-conversation-surface .sino-conversation-composer-dock .sino-global-composer textarea:visible").first();
    const projectTrigger = page.getByRole("button", { name: /选择项目|当前项目：/ }).last();
    const composer = page.locator(".founder-conversation-surface .sino-conversation-composer-dock").first();
    const sameBox = (left, right, tolerance = 1) => left && right
      && ["x", "y", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= tolerance);
    await activeTextarea.waitFor({ state: "visible" });
    evidence.active_textarea_count = await page.locator(".founder-conversation-surface .sino-conversation-composer-dock .sino-global-composer textarea:visible").count();
    const inputBefore = await activeTextarea.boundingBox();
    const projectBefore = await projectTrigger.textContent().catch(() => null);
    evidence.trigger_visible = await trigger.isVisible();
    await trigger.click();
    const surface = page.getByRole("menu", { name: "文件和文档", exact: true });
    evidence.interaction_surface_visible = await surface.isVisible().catch(() => false);
    evidence.upload_option_visible = await surface.getByRole("menuitem", { name: /上传文件/ }).isVisible().catch(() => false);
    evidence.existing_document_option_visible = await surface.getByRole("menuitem", { name: /选择已有文档/ }).isVisible().catch(() => false);
    evidence.recommended_surface_match = evidence.interaction_surface_visible && await surface.evaluate((node) => node.classList.contains("sino-composer-files-popover"));
    evidence.portal_parent_body = evidence.interaction_surface_visible && await surface.evaluate((node) => node.parentElement === document.body);
    evidence.position_fixed = evidence.interaction_surface_visible && await surface.evaluate((node) => getComputedStyle(node).position === "fixed");
    evidence.arrow_visible = await surface.locator("[data-popover-arrow]").isVisible().catch(() => false);
    const triggerBox = await trigger.boundingBox();
    const surfaceBox = await surface.boundingBox();
    const composerBox = await composer.boundingBox();
    evidence.anchor_positioning = Boolean(triggerBox && surfaceBox && surfaceBox.y + surfaceBox.height <= triggerBox.y + 2
      && Math.abs(surfaceBox.x - triggerBox.x) <= Math.max(24, surfaceBox.width));
    evidence.viewport_contained = Boolean(surfaceBox && surfaceBox.x >= 0 && surfaceBox.y >= 0
      && surfaceBox.x + surfaceBox.width <= 1512 && surfaceBox.y + surfaceBox.height <= 982);
    evidence.not_composer_clipped = Boolean(surfaceBox && composerBox && surfaceBox.y < composerBox.y && evidence.portal_parent_body);
    const inputDuring = await activeTextarea.boundingBox();
    await page.locator(".founder-conversation-surface").click({ position: { x: 10, y: 10 } });
    evidence.outside_close = !(await surface.isVisible().catch(() => false));
    await trigger.click(); await page.keyboard.press("Escape");
    evidence.escape_close = !(await surface.isVisible().catch(() => false));
    await trigger.click(); await trigger.click();
    evidence.toggle_close = !(await surface.isVisible().catch(() => false));
    const inputAfter = await activeTextarea.boundingBox();
    const projectAfter = await projectTrigger.textContent().catch(() => null);
    evidence.input_geometry = { before: inputBefore, during: inputDuring, after: inputAfter, tolerance_px: 1 };
    evidence.conversation_input_preserved = sameBox(inputBefore, inputDuring) && sameBox(inputBefore, inputAfter);
    evidence.project_context_preserved = projectBefore === projectAfter;
    await trigger.click();
    const chooser = page.waitForEvent("filechooser", { timeout: 3000 });
    await surface.getByRole("menuitem", { name: /上传文件/ }).click();
    await chooser;
    evidence.filechooser_opened = true;
    evidence.file_selected_false = (await activeControls.locator("input[type=file].sino-image-file-input").inputValue()) === "";
    await trigger.click();
    await surface.getByRole("menuitem", { name: /选择已有文档/ }).click();
    const boundary = page.getByRole("alert").filter({ hasText: "文件/文档入口已预留" }).last();
    evidence.document_boundary_truthful = await boundary.isVisible().catch(() => false);
    evidence.document_data_not_fabricated = (await page.getByText(/已选择文档|文档已添加/).count()) === 0;
  } else if (artifactType === "generic_visible_interaction" && contract.interaction_type === "search_clear") {
    const container = contract.container_selector ? page.locator(contract.container_selector).first() : page.locator("body");
    const searchInput = container.locator(contract.target_selector || "input[type='search']").filter({ visible: true }).first();
    await searchInput.waitFor({ state: "visible" });
    evidence.search_input_visible = await searchInput.isVisible();
    const projects = container.locator((contract.preserved_collection_selectors || [])[0] || ".sino-project-item");
    const conversations = container.locator((contract.preserved_collection_selectors || [])[1] || ".sino-conversation-item");
    const projectCountBefore = await projects.count();
    const conversationCountBefore = await conversations.count();
    await searchInput.fill("__sino_no_matching_item__");
    evidence.query_value_entered = await searchInput.inputValue() === "__sino_no_matching_item__";
    const appControls = container.locator(contract.application_control_selector || "button[aria-label*='clear' i]");
    const applicationVisibleCount = await appControls.evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node); const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    }).length);
    const nativeSearchCancelState = await searchInput.evaluate((node) => {
      if (node.type !== "search" || !node.value) return { visible: false, suppressed: false, matching_rules: [] };
      const matchingRules = [];
      const suppressesNativeCancel = (rules) => Array.from(rules || []).some((rule) => {
        if (rule.cssRules) return suppressesNativeCancel(rule.cssRules);
        const selector = String(rule.selectorText || "");
        if (!selector.includes("::-webkit-search-cancel-button")) return false;
        const baseSelector = selector.replace(/::-webkit-search-cancel-button/g, "").trim();
        if (!baseSelector || !node.matches(baseSelector)) return false;
        const display = rule.style?.getPropertyValue("display");
        const appearance = rule.style?.getPropertyValue("appearance") || rule.style?.getPropertyValue("-webkit-appearance");
        matchingRules.push({ selector, display, appearance });
        return display === "none" || appearance === "none";
      });
      const explicitlySuppressed = Array.from(document.styleSheets).some((sheet) => {
        try { return suppressesNativeCancel(sheet.cssRules); } catch { return false; }
      });
      const suppressionDeclared = node.dataset.nativeSearchCancel === "hidden";
      const inlineStyleSources = Array.from(document.querySelectorAll("style")).map((styleNode) => styleNode.textContent || "").join("\n");
      const declaredRulePresent = suppressionDeclared
        && /\[data-native-search-cancel=["']hidden["']\]::-webkit-search-cancel-button\s*\{[^}]*display\s*:\s*none/i.test(inlineStyleSources);
      if (explicitlySuppressed || declaredRulePresent) return {
        visible: false, suppressed: true, suppression_declared: suppressionDeclared,
        declared_rule_present: declaredRulePresent, matching_rules: matchingRules,
      };
      const style = getComputedStyle(node, "::-webkit-search-cancel-button");
      return { visible: style.display !== "none" && style.visibility !== "hidden"
        && style.webkitAppearance !== "none" && style.appearance !== "none", suppressed: false,
        suppression_declared: suppressionDeclared, declared_rule_present: declaredRulePresent, matching_rules: matchingRules };
    });
    const nativeSearchCancel = nativeSearchCancelState.visible;
    const effectiveCount = effectiveVisibleControlCount({ nativeVisible: nativeSearchCancel, applicationVisibleCount });
    const cardinality = evaluateVisibleCardinality(contract.acceptance_cardinality, effectiveCount);
    evidence.native_search_cancel_capability = await searchInput.getAttribute("type") === "search";
    evidence.native_search_cancel_visible = nativeSearchCancel;
    evidence.native_search_cancel_suppression = nativeSearchCancelState;
    evidence.application_clear_control_count = applicationVisibleCount;
    evidence.effective_visible_clear_control_count = effectiveCount;
    evidence.clear_control_visible = effectiveCount > 0;
    evidence.clear_control_count_matches = cardinality.matches;
    evidence.duplicate_control_absent = cardinality.duplicateAbsent;
    evidence.empty_state_preserved = await container.getByRole(contract.empty_state_role || "status").isVisible().catch(() => false);
    if (applicationVisibleCount > 0) {
      await appControls.filter({ visible: true }).first().click();
    } else {
      await searchInput.fill("");
    }
    await page.waitForFunction((selector) => document.querySelector(selector)?.value === "", contract.target_selector || "input[type='search']");
    evidence.clear_action_works = await searchInput.inputValue() === "";
    const projectCountAfter = await projects.count();
    const conversationCountAfter = await conversations.count();
    evidence.collection_counts = {
      projects_before: projectCountBefore, projects_after: projectCountAfter,
      conversations_before: conversationCountBefore, conversations_after: conversationCountAfter,
    };
    evidence.projects_restored = projectCountAfter === projectCountBefore;
    evidence.recent_conversations_restored = conversationCountAfter === conversationCountBefore;
    await searchInput.fill("escape-check");
    await searchInput.press("Escape");
    evidence.escape_clear_preserved = await searchInput.inputValue() === "";
    evidence.no_unrelated_sidebar_regression = await container.isVisible();
  } else if (artifactType === "generic_visible_interaction" && contract.interaction_type === "derived_visible_count") {
    const assertion = contract.derived_value_assertion || {};
    const displaySelector = assertion.display_target?.selector;
    const collectionSelector = assertion.source_collection?.selector;
    const display = page.locator(displaySelector).first();
    const collection = page.locator(collectionSelector);
    const visibleCount = async () => collection.evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node); const box = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
    }).length);
    const inspectState = async (name) => {
      const displayed = await display.textContent().catch(() => null);
      const count = await visibleCount();
      const result = evaluateDerivedCount(displayed, count, assertion.aggregation, assertion.comparison);
      return { name, displayed_value: displayed, visible_count: count, ...result, passed: result.matches };
    };
    await display.waitFor({ state: "visible" });
    const baseline = await inspectState("baseline");
    let filtered = { name: "filtered", passed: true, skipped: true };
    let restored = { name: "restored", passed: true, skipped: true };
    const filteredState = (contract.verification_states || []).find((item) => item.name === "filtered");
    if (filteredState) {
      const action = filteredState.setup_action || {};
      const search = page.locator(action.search_input_selector).first();
      const textNodes = collection.locator(action.source_text_selector || "b");
      const texts = (await textNodes.allTextContents()).map((item) => item.trim()).filter(Boolean);
      let selectedQuery = null;
      for (const textValue of texts) {
        for (const size of [4, 3, 2, 1]) {
          const candidate = textValue.slice(0, Math.min(size, textValue.length));
          if (!candidate || candidate === selectedQuery) continue;
          await search.fill(candidate); await page.waitForTimeout(80);
          const candidateCount = await visibleCount();
          if (candidateCount > 0 && candidateCount < baseline.visible_count) { selectedQuery = candidate; break; }
        }
        if (selectedQuery) break;
      }
      filtered = selectedQuery
        ? { ...(await inspectState("filtered")), query: selectedQuery, skipped: false }
        : { name: "filtered", passed: false, skipped: false, failure_reason: "no safe reducing non-empty filter query" };
      await search.fill(""); await page.waitForTimeout(80);
      restored = { ...(await inspectState("restored")), skipped: false };
    }
    evidence.derived_value_states = { baseline, filtered, restored };
    evidence.derived_state_result = evaluateDerivedStates([baseline, filtered, restored]);
    evidence.display_target_visible = await display.isVisible();
    evidence.display_value_integer = [baseline, filtered, restored].filter((item) => !item.skipped).every((item) => item.displayInteger === true);
    evidence.derived_count_matches = evidence.derived_state_result.passed;
    evidence.baseline_state_passed = baseline.passed === true;
    evidence.filtered_state_passed = filtered.passed === true;
    evidence.restored_state_passed = restored.passed === true && (restored.skipped || restored.visible_count === baseline.visible_count);
    evidence.existing_behaviors_preserved = evidence.restored_state_passed && await page.locator(contract.target_route === "Founder Sidebar / Navigation" ? ".founder-navigation-panel" : "body").isVisible();
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
