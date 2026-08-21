import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

const EVIDENCE = "../.runtime/visual-evidence/gpt-language";

async function styleOf(locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      fontFamily: style.fontFamily,
      color: style.color,
    };
  });
}

test("Founder workspace uses the consolidated readable GPT-style visual language", async ({ page }) => {
  mkdirSync(EVIDENCE, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const navigationSection = page.getByText("项目", { exact: true });
  const navigationItem = page.getByRole("button", { name: "库" });
  const projectMetadata = page.locator(".sino-project-item__meta").first();
  const composer = page.getByLabel("讨论内容");
  const executionTitle = page.getByRole("heading", { name: "执行中心" });
  const executionSecondary = page.getByText("Founder 暂无需要处理的事项");
  const audit = {
    navigationSection: await styleOf(navigationSection),
    navigationItem: await styleOf(navigationItem),
    projectMetadata: await styleOf(projectMetadata),
    composer: await styleOf(composer),
    executionTitle: await styleOf(executionTitle),
    executionSecondary: await styleOf(executionSecondary),
  };
  expect(parseFloat(audit.navigationSection.fontSize)).toBeGreaterThanOrEqual(14);
  expect(parseFloat(audit.navigationItem.fontSize)).toBeGreaterThanOrEqual(14);
  expect(parseFloat(audit.projectMetadata.fontSize)).toBeGreaterThanOrEqual(13);
  expect(parseFloat(audit.composer.fontSize)).toBeGreaterThanOrEqual(15);
  expect(parseFloat(audit.executionTitle.fontSize)).toBeGreaterThanOrEqual(14);
  expect(parseFloat(audit.executionSecondary.fontSize)).toBeGreaterThanOrEqual(13);
  expect(audit.composer.fontFamily).toMatch(/SF Pro|BlinkMacSystemFont|Helvetica Neue|Arial/i);

  const topIcons = page.locator(".sino-sidebar-toggle svg, .sino-new-conversation svg");
  await expect(topIcons).toHaveCount(2);
  for (const icon of await topIcons.all()) {
    await expect(icon).toHaveAttribute("width", "18");
    await expect(icon).toHaveAttribute("stroke-width", "1.7");
  }
  await page.screenshot({ path: `${EVIDENCE}/workspace-expanded.png`, fullPage: true });

  await page.getByRole("button", { name: "收起侧边栏" }).click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${EVIDENCE}/workspace-collapsed.png`, fullPage: true });
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await page.waitForTimeout(220);

  await page.evaluate(() => {
    const empty = document.querySelector(".sino-conversation-empty-prompt");
    if (empty) empty.remove();
    const log = document.querySelector(".sino-conversation-log");
    if (log) log.innerHTML = `
      <div class="sino-message-group">
        <article data-role="founder"><strong>Founder</strong><div class="sino-message-body"><p>请帮我判断这个产品下一阶段最值得优先解决的问题。</p></div></article>
        <article data-role="assistant"><strong>Sino</strong><div class="sino-message-body"><p>当前最优先的不是增加更多入口，而是让已有能力形成稳定闭环。</p><p><strong>我建议先关注三件事：</strong></p><ul><li>持续保留 Founder 上下文</li><li>让执行结果真实可见</li><li>把需要判断的事项准确递到执行中心</li></ul></div></article>
      </div>`;
  });
  audit.conversationBody = await styleOf(page.locator('.sino-conversation-log article[data-role="assistant"] .sino-message-body'));
  expect(parseFloat(audit.conversationBody.fontSize)).toBeGreaterThanOrEqual(15);
  expect(audit.conversationBody.fontWeight).toBe("400");
  expect(audit.conversationBody.fontFamily).toMatch(/SF Pro|BlinkMacSystemFont|Helvetica Neue|Arial/i);
  await page.screenshot({ path: `${EVIDENCE}/workspace-conversation.png`, fullPage: true });

  await page.evaluate(() => {
    const sidebar = document.querySelector(".sino-founder-task-sidebar");
    if (!sidebar) return;
    const empty = sidebar.querySelector(".sino-task-status-empty");
    if (empty) empty.remove();
    const list = document.createElement("div");
    list.className = "sino-work-queue-list";
    list.innerHTML = Array.from({ length: 4 }, (_, index) => `<article class="sino-work-queue-card${index === 1 ? " is-focused" : ""}"><header><div><h3>${["确认产品方向", "统一 Founder Workspace", "验证对话体验", "整理执行证据"][index]}</h3><span>${["待确认", "执行中", "验证中", "待验收"][index]}</span></div><small>Founder ${index === 0 || index === 3 ? "需要操作" : "无需操作"}</small></header></article>`).join("");
    sidebar.appendChild(list);
  });
  await page.screenshot({ path: `${EVIDENCE}/workspace-execution.png`, fullPage: true });

  console.log("READABILITY_CHECK", JSON.stringify(audit));
});
