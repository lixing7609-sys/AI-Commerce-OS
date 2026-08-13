// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./sino-founder-ai.css", import.meta.url), "utf8");

describe("Global Typography System V1", () => {
  it("keeps the shared Composer dock seamless and the toolbar inside its outer border", () => {
    const dockRule = css.match(/\.sino-conversation-composer-dock\s*\{([^}]*)\}/)?.[1] || "";
    const toolbarRule = css.match(/\.sino-composer\.sino-global-composer--toolbar \.sino-composer__toolbar\s*\{([^}]*)\}/)?.[1] || "";
    expect(dockRule).toContain("background: transparent");
    expect(toolbarRule).toContain("margin: 18px 0 0");
    expect(toolbarRule).toContain("padding: 0");
    expect(toolbarRule).not.toContain("-26px");
    expect(toolbarRule).not.toContain("-20px");
    expect(css).toMatch(/\.sino-composer\s*\{[^}]*border:\s*1px solid/);
  });
  it("defines the shared Founder typography tokens", () => {
    for (const token of ["page-title", "section-title", "card-title", "body", "body-small", "label", "nav", "sidebar", "button", "helper", "metadata"]) {
      expect(css).toContain(`--font-${token}:`);
    }
    for (const token of ["weight-regular", "weight-medium", "weight-semibold", "line-page-title", "line-section-title", "line-body"]) {
      expect(css).toContain(`--${token}:`);
    }
  });

  it("maps navigation, sidebar, context, forms and buttons to shared tokens", () => {
    expect(css).toMatch(/\.sino-capability-nav button[^}]*var\(--font-nav\)/);
    expect(css).toMatch(/\.sino-project-list button[^}]*var\(--font-sidebar\)/);
    expect(css).toMatch(/\.sino-context-summary p[^}]*var\(--font-body-small\)/);
    expect(css).toMatch(/\.sino-app :is\(input, textarea, select\)[^}]*var\(--font-body\)/);
    expect(css).toMatch(/\.sino-button[^}]*var\(--font-button\)/);
  });

  it("keeps explicit Founder-visible pixel sizes at or above 12px", () => {
    const sizes = [...css.matchAll(/(?:font-size:|font:)\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});
