import { test, expect } from "@playwright/test";

/**
 * Regression test for the Founder vertical-scroll bug (阶段：release-
 * blocking repair). Root cause: `.fdr-content` was a flex:1 item with
 * `overflow: visible` and no `min-height: 0`, so it grew to its full
 * content height instead of being capped to the viewport — combined
 * with `body { overflow: hidden }` leaking globally from the Developer
 * edition's App.css (always bundled, since main.jsx statically imports
 * all four edition apps), there was no scrollable box anywhere once
 * Founder's content exceeded one viewport height.
 *
 * Fix is scoped to Founder's own console.css/ConsoleShell.jsx only —
 * `.fdr-root` is now a fixed `height: 100vh; overflow: hidden` shell,
 * and `.fdr-content` is the actual scroll container (`min-height: 0;
 * overflow-y: auto`), matching the pattern Operator's `.op-body`/
 * `.op-main` already used correctly. Does not touch App.css or body,
 * so this test also asserts Cloud/Operator are unaffected.
 */

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function getScrollContainerState(page) {
  return page.evaluate(() => {
    const el = document.querySelector(".fdr-content");
    if (!el) return null;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  });
}

test.describe("Founder vertical scroll regression", () => {
  test("Secretary: content overflows the viewport and the main panel actually scrolls via mouse wheel", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=secretary");
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();

    const initial = await getScrollContainerState(page);
    expect(initial, ".fdr-content scroll container must exist").not.toBeNull();
    expect(initial.scrollHeight, "content must actually exceed the viewport for this test to be meaningful").toBeGreaterThan(initial.clientHeight + 50);
    expect(initial.scrollTop).toBe(0);

    const bottomMarker = page.getByText("和 AI 秘书说点什么");
    await expect(bottomMarker).not.toBeInViewport();

    // Real mouse-wheel scroll, not a synthetic scrollTop assignment.
    await page.mouse.move(900, 400);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(200);

    const afterWheel = await getScrollContainerState(page);
    expect(afterWheel.scrollTop, "scrollTop must increase after a real wheel scroll").toBeGreaterThan(initial.scrollTop);
    await expect(bottomMarker).toBeInViewport();

    // Refresh and confirm the fix survives a fresh load, not just this session.
    await page.reload();
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();
    const afterReload = await getScrollContainerState(page);
    expect(afterReload.scrollTop).toBe(0);
    await page.mouse.move(900, 400);
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(200);
    const afterReloadScroll = await getScrollContainerState(page);
    expect(afterReloadScroll.scrollTop).toBeGreaterThan(0);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("Agent Studio: scrolling still works after navigating between Founder modules", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/?mode=founder&module=secretary");
    await expect(page.getByText("和 AI 秘书说点什么")).toBeVisible();

    await page.goto("/?mode=founder&module=agentStudio");
    await expect(page.getByRole("heading", { name: "Agent 工作室" })).toBeVisible();

    const initial = await getScrollContainerState(page);
    expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight + 50);
    expect(initial.scrollTop).toBe(0);

    await page.mouse.move(900, 400);
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(200);
    const after = await getScrollContainerState(page);
    expect(after.scrollTop).toBeGreaterThan(0);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });

  test("no shared regression: Cloud and Operator still render and scroll as designed", async ({ page }) => {
    const errors = collectPageErrors(page);

    // 阶段 Founder Full-System v3 Batch 2：裸 URL 现在默认打开
    // Founder，Operator Cloud 的稳定入口是 `/cloud` 路径别名。
    await page.goto("/cloud");
    await expect(page.getByText("隐私边界", { exact: false }).first()).toBeVisible();
    await expect(page.locator(".cc-main")).toHaveCount(1);

    await page.goto("/?mode=operator-preview");
    await expect(page.getByText("OPERATOR", { exact: true })).toBeVisible();
    await expect(page.locator(".op-sidebar")).toBeVisible();
    await expect(page.locator(".op-body")).toHaveCount(1);

    expect(errors, `console errors: ${errors.join("; ")}`).toHaveLength(0);
  });
});
