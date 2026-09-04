/*
 * Single JS source for design-token values that must also be readable
 * outside CSS (Recharts renders to SVG via inline color props and
 * cannot consume CSS custom properties directly). These values must
 * stay in sync with the :root block in theme.css by hand — this file
 * exists so there is exactly ONE place that duplication happens
 * (previously chartColors.js hardcoded its own separate copy).
 *
 * Design DNA v1.0: docs/01-foundation/design/color-spec.md
 */

export const COLOR_TOKENS = {
  actionPrimary: "#12151A",
  actionHover: "#22262D",
  focus: "#2563EB",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  information: "#2563EB",
  aiAccent: "#0E7C86",
  textPrimary: "#14171C",
  textSecondary: "#5B6169",
  textTertiary: "#8A8F98",
  borderDefault: "#DADEE3",
};

export const COLOR_TOKENS_DARK = {
  actionPrimary: "#F1F2F4",
  actionHover: "#DADEE3",
  focus: "#3B82F6",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  information: "#3B82F6",
  aiAccent: "#2DD4C7",
  textPrimary: "#F1F2F4",
  textSecondary: "#B5BAC2",
  textTertiary: "#7C828C",
  borderDefault: "#2B3038",
};

export const CHART_SERIES = [
  COLOR_TOKENS.actionPrimary,
  COLOR_TOKENS.aiAccent,
  COLOR_TOKENS.success,
  COLOR_TOKENS.warning,
  COLOR_TOKENS.danger,
  COLOR_TOKENS.information,
];

export const RADIUS_TOKENS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const MOTION_TOKENS = {
  instant: 100,
  fast: 150,
  standard: 200,
  deliberate: 300,
  slow: 500,
};

export const ICON_SIZES = [14, 16, 18, 20, 24, 32];
