import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellDir = fileURLToPath(new URL(".", import.meta.url));

function read(file) {
  return readFileSync(`${shellDir}${file}`, "utf-8");
}

const SHELL_JSX_FILES = ["ConsoleSidebar.jsx", "ConsoleTopBar.jsx", "SidebarFlyout.jsx", "NavigationShellDemo.jsx"];

/**
 * Design DNA v1.1 navigation-shell-spec.md "Prohibited patterns":
 * no raw hex colors in sidebar component files, single icon source,
 * theme.css defines the full --sidebar-* token set.
 */
describe("Navigation shell conventions (Design DNA v1.1)", () => {
  it("no shell component file contains a raw arbitrary hex color", () => {
    const hexPattern = /#[0-9A-Fa-f]{3,8}\b/g;
    for (const file of SHELL_JSX_FILES) {
      const matches = read(file).match(hexPattern) ?? [];
      expect(matches, `${file} has raw hex color(s) ${matches.join(", ")} — use var(--sidebar-*) instead`).toEqual([]);
    }
  });

  it("navIcons.js is the single source for nav/utility icon names, no glyph strings", () => {
    const src = read("../nav/navIcons.js");
    expect(src).toContain("NAV_ICON_MAP");
    expect(src).toContain("UTILITY_ICONS");
    // every mapped value should look like a PascalCase Lucide component name, not a glyph
    const glyphLike = /:\s*"[^\w]/;
    expect(glyphLike.test(src), "navIcons.js should map to Lucide component names, not literal glyphs").toBe(false);
  });

  it("theme.css defines the complete --sidebar-* token set referenced by console.css", () => {
    const themeCss = readFileSync(fileURLToPath(new URL("../../styles/theme.css", import.meta.url)), "utf-8");
    const requiredSidebarTokens = [
      "--sidebar-canvas", "--sidebar-surface", "--sidebar-border",
      "--sidebar-text-primary", "--sidebar-text-secondary", "--sidebar-text-tertiary",
      "--sidebar-active-surface", "--sidebar-hover-surface", "--sidebar-focus",
      "--sidebar-width-expanded", "--sidebar-width-collapsed",
    ];
    for (const token of requiredSidebarTokens) {
      expect(themeCss.includes(`${token}:`), `theme.css missing ${token}`).toBe(true);
    }
  });

  it("console.css sidebar rules reference --sidebar-* tokens, not the light-workspace tokens, for sidebar-scoped colors", () => {
    const consoleCss = readFileSync(fileURLToPath(new URL("../console.css", import.meta.url)), "utf-8");
    const sidebarBlockMatch = consoleCss.match(/\.fdr-sidebar\s*\{[\s\S]*?\n\}/);
    expect(sidebarBlockMatch, "expected a .fdr-sidebar rule block").toBeTruthy();
    expect(sidebarBlockMatch[0]).toContain("var(--sidebar-canvas)");
  });
});
