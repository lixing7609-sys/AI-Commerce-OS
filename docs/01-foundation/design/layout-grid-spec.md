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
| `--shell-sidebar-width` | 256px | Expanded sidebar (was 250px; rounded to the 8px grid) |
| `--shell-sidebar-collapsed-width` | 64px | Icon-only rail — new; the current shell hard-hides the sidebar below 900px instead of collapsing it (see `component-spec.md` NavRail note) |
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
| Narrow desktop/tablet | 900–1023px | Sidebar auto-collapses to the icon rail (`--shell-sidebar-collapsed-width`) instead of the current hard-hide; content padding `--space-20` |
| Minimum supported | ≥768px | Product remains usable (not optimized); below this is out of scope — the product is desktop-first per the originating spec |

The current `console.css` still hard-hides the sidebar entirely below 900px (`@media (max-width: 900px)`), leaving the shell with no navigation at all at narrow widths. This token (`--shell-sidebar-collapsed-width`) reserves the value for an icon-rail collapse; actually wiring it in requires restructuring `ConsoleSidebar.jsx`'s label markup (today the icon and label aren't independently hideable), which touches shell chrome shared by every page, not just the pilot — out of scope for this pass and listed as a known limitation / recommended next step in the implementation report, not something this pass silently claims to have fixed.

## Column grid

Desktop layouts use a 12-column grid within `--shell-content-max-width`, gutter `--space-24`. Workspace pages (tables, editors) may ignore the column grid and use flex/grid layouts sized to their content instead — the grid governs narrative/decision pages (Decision Home, Object Detail, Settings), not data workspaces.
