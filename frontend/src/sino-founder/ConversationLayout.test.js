// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./sino-founder-ai.css", import.meta.url), "utf8");

describe("Conversation Composer layout", () => {
  it("keeps Draft Center cards on the shared responsive workspace grid", () => {
    expect(css).toMatch(/\.sino-draft-list > button\.sino-workspace-row,\s*\.sino-asset-list > button\.sino-workspace-row,[\s\S]*?grid-template-columns: minmax\(220px, 1\.15fr\) minmax\(360px, 1fr\) 18px/);
    expect(css).toMatch(/@media \(max-width: 1180px\)[\s\S]*?\.sino-draft-list > button\.sino-workspace-row,[\s\S]*?grid-template-columns: minmax\(210px, \.9fr\) minmax\(300px, 1fr\) 14px/);
    expect(css).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.sino-draft-list > button\.sino-workspace-row,[\s\S]*?grid-template-columns: 1fr 14px/);
  });

  it("keeps the complete desktop ancestor chain at a calculable full height", () => {
    const shell = css.match(/\.founder-workspace\s*\{([^}]*)\}/)?.[1] || "";
    const surfacePlacement = css.match(/\.founder-workspace > \.founder-conversation-surface\s*\{([^}]*)\}/)?.[1] || "";
    const surface = css.match(/(?:^|\n)\.founder-conversation-surface\s*\{([^}]*)\}/)?.[1] || "";
    const page = [...css.matchAll(/\.sino-conversation-page\s*\{([^}]*)\}/g)].map((match) => match[1]).find((rule) => rule.includes("height: 100%")) || "";
    const thread = [...css.matchAll(/\.sino-conversation-thread\s*\{([^}]*)\}/g)].map((match) => match[1]).find((rule) => rule.includes("height: 100%")) || "";
    expect(shell).toContain("grid-template-columns: var(--founder-nav-width, 244px) minmax(420px, 1fr) var(--execution-center-width, 336px)");
    expect(shell).toContain("grid-template-rows: var(--workspace-topbar-height) minmax(0, 1fr)");
    expect(shell).toContain("height: 100dvh");
    expect(shell).toContain("overflow: hidden");
    expect(surfacePlacement).toContain("grid-column: 2");
    expect(surfacePlacement).toContain("grid-row: 2");
    expect(surface).toContain("height: 100%");
    expect(surface).toContain("min-height: 0");
    expect(surface).toContain("overflow: hidden");
    expect(page).toContain("height: 100%");
    expect(page).toContain("min-height: 0");
    expect(page).toContain("padding: 0");
    expect(page).toContain("box-sizing: border-box");
    expect(thread).toContain("height: 100%");
    expect(thread).toContain("min-height: 0");
  });

  it("keeps the dock outside the only flexible scroll region", () => {
    const thread = [...css.matchAll(/\.sino-conversation-thread\s*\{([^}]*)\}/g)].map((match) => match[1]).find((rule) => rule.includes("flex-direction: column")) || "";
    const rule = css.match(/\.sino-conversation-composer-dock\s*\{([^}]*)\}/)?.[1] || "";
    const fixedChildren = css.match(/\.sino-conversation-thread > \.sino-conversation-header,[^{]+\{([^}]*)\}/)?.[1] || "";
    expect(thread).toContain("display: flex");
    expect(thread).toContain("flex-direction: column");
    expect(fixedChildren).toContain("flex: 0 0 auto");
    expect(rule).not.toMatch(/(?:margin-bottom|bottom:|position:)/);
    expect(css).toContain(".sino-conversation-workspace-safe-area { min-height: 10px");
  });

  it("keeps the message region independently scrollable above the dock", () => {
    const rule = css.match(/\.sino-conversation-thread \.sino-conversation-log\s*\{([^}]*)\}/)?.[1] || "";
    expect(rule).toContain("flex: 1 1 0");
    expect(rule).toContain("min-height: 0");
    expect(rule).toContain("overflow-y: auto");
    expect(rule).not.toContain("max-height: 360px");
  });

  it("keeps the right Founder Action panel inside the viewport with independent scrolling", () => {
    const context = [...css.matchAll(/\.founder-workspace > \.founder-execution-center\s*\{([^}]*)\}/g)].map((match) => match[1]).find((rule) => rule.includes("grid-column")) || "";
    const shellRule = css.match(/\.founder-workspace\s*\{([^}]*)\}/)?.[1] || "";
    const panel = css.match(/\.founder-execution-center > \.sino-founder-task-sidebar\s*\{([^}]*)\}/)?.[1] || "";
    expect(shellRule).toContain("var(--execution-center-width, 336px)");
    expect(context).toContain("grid-column: 3");
    expect(context).toContain("grid-row: 1 / 3");
    expect(panel).toContain("height: 100%");
    expect(panel).toContain("overflow: auto");
  });

  it("centers one reading column and gives every AI message its full width", () => {
    const column = css.match(/\.sino-conversation-reading-column\s*\{([^}]*)\}/)?.[1] || "";
    const base = css.match(/\.sino-conversation-log article:not\(\[data-role="founder"\]\),\s*\.sino-council-conversation \.sino-council-message\s*\{([^}]*)\}/)?.[1] || "";
    const levels = css.match(/\.sino-council-conversation \.sino-council-message--level-a,\s*\.sino-council-conversation \.sino-council-message--level-b\s*\{([^}]*)\}/)?.[1] || "";
    expect(column).toContain("max-width: var(--conversation-content-max-width)");
    expect(column).toContain("margin-inline: auto");
    expect(column).toContain("padding-inline: var(--conversation-content-gutter)");
    expect(base).toContain("width: 100%");
    expect(base).toContain("max-width: 100%");
    expect(levels).toContain("margin-left: 0");
    expect(levels).toContain("background: transparent");
    expect(css).not.toContain("--council-staircase-offset");
    expect(css).not.toMatch(/\.sino-council-conversation \.sino-council-message[^}]*width:\s*(?:82|94)%/s);
  });

  it("uses symmetric mobile gutters and one shared content-width token for the composer", () => {
    expect(css).toContain("--conversation-content-gutter: 16px");
    expect(css).toContain("max-width: calc(var(--conversation-content-max-width) - (2 * var(--conversation-content-gutter)))");
  });

  it("renders AI discussion messages as a borderless left-aligned content stream", () => {
    const ai = css.match(/\.sino-conversation-log article:not\(\[data-role="founder"\]\),\s*\.sino-council-conversation \.sino-council-message\s*\{([^}]*)\}/)?.[1] || "";
    expect(ai).toContain("border: 0");
    expect(ai).toContain("border-radius: 0");
    expect(ai).toContain("box-shadow: none");
    expect(ai).toContain("background: transparent");
    expect(ai).toContain("margin-left: 0");
    expect(ai).toContain("text-align: left");
  });

  it("uses Sans identity labels and a Serif long-form AI body without changing Founder typography", () => {
    expect(css).toContain('font-family: system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif');
    expect(css).toContain('font-family: "Songti SC", "STSong", "SimSun", serif');
    expect(css).toContain('.sino-message-bubble--founder > .sino-message-body');
    expect(css).toContain('.sino-conversation-log article[data-role="founder"] .sino-message-body p');
  });
});
