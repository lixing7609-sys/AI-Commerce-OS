// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./sino-founder-ai.css", import.meta.url), "utf8");

describe("Founder Visual Readability Pass V1", () => {
  it("defines one complete semantic color system", () => {
    for (const token of ["text-primary", "text-secondary", "text-muted", "text-label", "text-disabled", "border-default", "border-strong", "surface-base", "surface-raised", "surface-selected", "accent", "accent-text"]) {
      expect(css).toContain(`--${token}:`);
    }
  });

  it("keeps disabled controls visible without fading their subtree", () => {
    const semanticDisabled = css.match(/\.sino-app :is\(button, input, textarea, select\):disabled\s*\{([^}]*)\}/)?.[1] || "";
    expect(semanticDisabled).toContain("opacity: 1");
    expect(semanticDisabled).toContain("var(--text-disabled)");
    expect(semanticDisabled).toContain("var(--border-default)");
  });

  it("maps navigation, lists, inspector and sidebar to semantic tokens", () => {
    expect(css).toMatch(/\.sino-capability-nav button,[\s\S]*?color: var\(--text-secondary\)/);
    expect(css).toMatch(/\.sino-asset-list > button > strong\s*\{[^}]*var\(--text-primary\)/);
    expect(css).toMatch(/\.sino-asset-detail dt\s*\{[^}]*var\(--text-label\)/);
    expect(css).toMatch(/\.sino-project-list button,[\s\S]*?var\(--text-secondary\)/);
  });
});
