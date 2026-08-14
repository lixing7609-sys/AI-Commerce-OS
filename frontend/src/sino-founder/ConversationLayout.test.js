// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./sino-founder-ai.css", import.meta.url), "utf8");

describe("Conversation Composer layout", () => {
  it("keeps the complete desktop ancestor chain at a calculable full height", () => {
    const app = css.match(/\.sino-app\s*\{([^}]*)\}/)?.[1] || "";
    const shell = css.match(/\.sino-founder-shell\s*\{([^}]*)\}/)?.[1] || "";
    const fixedMain = css.match(/\.sino-founder-main--fixed-workspace\s*\{([^}]*)\}/)?.[1] || "";
    const pageRules = [...css.matchAll(/\.sino-conversation-page\s*\{([^}]*)\}/g)];
    const page = pageRules.at(-1)?.[1] || "";
    const thread = [...css.matchAll(/\.sino-conversation-thread\s*\{([^}]*)\}/g)].map((match) => match[1]).find((rule) => rule.includes("height: 100%")) || "";
    expect(app).toContain("height: 100dvh");
    expect(shell).toContain("grid-template-rows: 66px minmax(0, 1fr)");
    expect(shell).toContain("height: 100dvh");
    expect(fixedMain).toContain("height: 100%");
    expect(fixedMain).toContain("padding-bottom: 0");
    expect(page).toContain("height: 100%");
    expect(page).toContain("min-height: 0");
    expect(page).toContain("padding: 0");
    expect(page).toContain("box-sizing: border-box");
    expect(thread).toContain("height: 100%");
    expect(thread).toContain("min-height: 0");
  });

  it("places the dock in its own workspace row above a ten-pixel safe area", () => {
    const thread = [...css.matchAll(/\.sino-conversation-thread\s*\{([^}]*)\}/g)].map((match) => match[1]).find((rule) => rule.includes("grid-template-rows:")) || "";
    const rule = css.match(/\.sino-conversation-composer-dock\s*\{([^}]*)\}/)?.[1] || "";
    expect(thread).toContain("grid-template-rows: auto minmax(0, 1fr) auto 10px");
    expect(rule).not.toMatch(/(?:margin-bottom|bottom:|position:)/);
    expect(css).toContain(".sino-conversation-workspace-safe-area { min-height: 10px");
  });

  it("keeps the message region independently scrollable above the dock", () => {
    const rule = css.match(/\.sino-conversation-thread \.sino-conversation-log\s*\{([^}]*)\}/)?.[1] || "";
    expect(rule).toContain("min-height: 0");
    expect(rule).toContain("overflow-y: auto");
    expect(rule).not.toContain("max-height: 360px");
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
    expect(css).toContain('.sino-conversation-log article[data-role="founder"] > p');
  });
});
