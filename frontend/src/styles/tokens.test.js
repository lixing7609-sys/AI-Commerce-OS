import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOR_TOKENS, COLOR_TOKENS_DARK, CHART_SERIES, RADIUS_TOKENS, MOTION_TOKENS, ICON_SIZES } from "./tokens.js";

const themeCssPath = fileURLToPath(new URL("./theme.css", import.meta.url));
const themeCss = readFileSync(themeCssPath, "utf-8");

const REQUIRED_TOKEN_NAMES = [
  "--font-sans", "--font-mono",
  "--type-display-hero-size", "--type-body-size", "--type-metric-size", "--type-caption-size",
  "--space-4", "--space-8", "--space-16", "--space-32", "--space-64",
  "--canvas", "--surface", "--text-primary", "--text-secondary", "--text-tertiary",
  "--action-primary", "--focus", "--success", "--warning", "--danger", "--information",
  "--ai-accent", "--ai-accent-subtle",
  "--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-pill",
  "--elevation-1", "--elevation-2", "--elevation-3",
  "--motion-instant", "--motion-fast", "--motion-standard", "--motion-deliberate", "--motion-slow",
];

/**
 * Design DNA v1.0 token availability — docs/01-foundation/design/.
 * Every semantic token the spec docs promise must actually exist in
 * theme.css, and the JS token source (tokens.js, which chartColors.js
 * depends on so Recharts never re-hardcodes its own palette) must
 * export a complete, valid set.
 */
describe("Design DNA token availability", () => {
  it("theme.css defines every required semantic token", () => {
    for (const name of REQUIRED_TOKEN_NAMES) {
      expect(themeCss.includes(`${name}:`), `theme.css is missing token "${name}"`).toBe(true);
    }
  });

  it("theme.css keeps legacy aliases so existing kit.css/console.css keep working", () => {
    for (const legacy of ["--primary:", "--bg:", "--text:", "--border:", "--radius-sm:", "--shadow:", "--sidebar-width:"]) {
      expect(themeCss.includes(legacy), `theme.css dropped legacy alias "${legacy}"`).toBe(true);
    }
  });

  it("dark tokens are opt-in via [data-theme=dark], not auto prefers-color-scheme", () => {
    expect(themeCss.includes('[data-theme="dark"]')).toBe(true);
    expect(themeCss.includes("@media (prefers-color-scheme: dark)")).toBe(false);
  });

  it("reduced-motion media query shortens every motion token", () => {
    expect(themeCss.includes("@media (prefers-reduced-motion: reduce)")).toBe(true);
  });

  it("tokens.js color values are valid hex codes", () => {
    for (const [key, value] of Object.entries({ ...COLOR_TOKENS, ...COLOR_TOKENS_DARK })) {
      expect(value, `COLOR_TOKENS.${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("CHART_SERIES has at least 5 distinct colors for multi-series charts", () => {
    expect(CHART_SERIES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CHART_SERIES).size).toBe(CHART_SERIES.length);
  });

  it("radius scale is strictly increasing (xs < sm < md < lg < xl < pill)", () => {
    const order = [RADIUS_TOKENS.xs, RADIUS_TOKENS.sm, RADIUS_TOKENS.md, RADIUS_TOKENS.lg, RADIUS_TOKENS.xl, RADIUS_TOKENS.pill];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it("motion scale is strictly increasing (instant < fast < standard < deliberate < slow)", () => {
    const order = [MOTION_TOKENS.instant, MOTION_TOKENS.fast, MOTION_TOKENS.standard, MOTION_TOKENS.deliberate, MOTION_TOKENS.slow];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it("icon sizes match the six sizes documented in component-spec.md", () => {
    expect(ICON_SIZES).toEqual([14, 16, 18, 20, 24, 32]);
  });
});
