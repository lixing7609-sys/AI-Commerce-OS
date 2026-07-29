# Layout & Grid Spec — AI Commerce OS Design DNA v1.0

## Spacing scale

4px base unit, 8px primary rhythm. Token names `--space-<n>` map directly to pixel values:

```
--space-2: 2px   (hairline corrections only)
--space-4: 4px
--space-8: 8px
--space-12: 12px
--space-16: 16px
--space-20: 20px
--space-24: 24px
--space-32: 32px
--space-40: 40px
--space-48: 48px
--space-64: 64px
--space-80: 80px
--space-96: 96px
```

Exceptions to the 8px rhythm (2px, 12px, 20px) exist for optical correction on borders, icon-to-label gaps, and dense table rows — used sparingly and only where a strict 8px multiple visibly under/over-shoots alignment. Component code should reach for the nearest 8px-multiple token before considering an exception.

## Application shell

| Token | Value | Notes |
|---|---|---|
| `--shell-sidebar-width` / `--sidebar-width-expanded` | 264px | Expanded sidebar (v1.1: revised from v1.0's 256px to 264px after visual validation of the four-zone rebuild — see `navigation-shell-spec.md`) |
| `--shell-sidebar-collapsed-width` / `--sidebar-width-collapsed` | 72px | Icon-only rail — **implemented** in v1.1 (`ConsoleSidebar.jsx`), not just reserved. Manually toggled (persisted) or forced below 1024px. |
| `--shell-topbar-height` | 56px | Matches the Tesla study's observed header height (§2) — coincidental convergence on a well-proven value, not a copy |
| `--shell-content-max-width` | 1280px | Narrative/decision content (Founder工作台, forms, detail panels) |
| `--shell-content-max-width-wide` | none (full-bleed) | Data workspaces (`DataTable`-heavy pages) may go edge-to-edge within the content area |
| `--page-padding-x` | `--space-32` (desktop), `--space-20` (narrow) | Horizontal page padding |
| `--page-padding-y` | `--space-32` | Top padding; `--space-40` between major page sections |
| `--component-gap` | `--space-16` | Default gap between sibling components in a stack |
| `--form-gap` | `--space-16` | Vertical gap between form fields |
| `--table-row-height` | 48px (comfortable) / 36px (compact) | See Density modes below |

## Density modes

- **Comfortable** (default): 48px table rows, `--space-16` internal card padding.
- **Compact**: 36px table rows, `--space-12` internal padding — opt-in per view (e.g. dense operational tables), toggled via a `data-density="compact"` attribute on the table's container, never a whole-app-wide setting in this pass.

## Breakpoints

| Breakpoint | Range | Behavior |
|---|---|---|
| Wide desktop | ≥1440px | Full shell, `--shell-content-max-width` applies, generous margins |
| Desktop | 1280–1439px | Full shell, content max-width applies with reduced outer margin |
| Standard desktop | 1024–1279px | Full shell; sidebar stays expanded but content padding drops to `--space-24` |
| Narrow desktop/tablet | <1024px | **v1.1, implemented:** sidebar is forced into the icon rail (`effectiveCollapsed` in `ConsoleSidebar.jsx`, real component state — not a CSS-only approximation) regardless of the user's stored preference, which resumes once the viewport widens back out; content padding `--space-20` |
| Minimum supported | ≥768px | Product remains usable (not optimized); below this is out of scope — the product is desktop-first per the originating spec |

v1.0 left the sidebar hard-hidden entirely below 900px (`@media (max-width: 900px) { .fdr-sidebar { display: none; } }`), a known limitation flagged at the time. v1.1 replaces that with the real collapsed icon-rail (`navigation-shell-spec.md` §10/§13) — navigation is never fully absent at any supported width now.

## Column grid

Desktop layouts use a 12-column grid within `--shell-content-max-width`, gutter `--space-24`. Workspace pages (tables, editors) may ignore the column grid and use flex/grid layouts sized to their content instead — the grid governs narrative/decision pages (Decision Home, Object Detail, Settings), not data workspaces.
