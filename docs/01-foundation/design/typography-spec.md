# Typography Spec — AI Commerce OS Design DNA v1.0

## Font stack

No bundled/proprietary font files (Tesla ships a proprietary "Universal Sans" — explicitly not adopted, see the Tesla study §19). System-first stack, tuned for Chinese/English mixed UI, macOS rendering quality, and zero download requirement:

```css
--font-sans:
  -apple-system, BlinkMacSystemFont,
  "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC",
  "Segoe UI", Roboto, "Helvetica Neue", Arial,
  system-ui, sans-serif;

--font-mono:
  ui-monospace, "SF Mono", "Cascadia Code", "Consolas",
  "Noto Sans Mono CJK SC", monospace;
```

`-apple-system`/`BlinkMacSystemFont` resolve to San Francisco on macOS for Latin glyphs and fall through to `PingFang SC` for Chinese on the same platform; `Microsoft YaHei` and `Noto Sans CJK SC` cover Windows/Linux. `--font-mono` is used only for `code` and raw technical read-outs (IDs, hashes), never for prose or numerics — numerics use `tabular-number` (below), not monospace.

## Semantic type roles

Every role is a token (`--type-<role>-size`, `--type-<role>-weight`, `--type-<role>-line-height`), never an arbitrary pixel value in component code.

| Role | Size | Weight | Line height | Usage |
|---|---|---|---|---|
| `display-hero` | 56px | 600 | 64px | Founder executive statement — used once per page, max |
| `display-section` | 40px | 600 | 48px | Rare high-impact section statement |
| `heading-page` | 30px | 600 | 38px | Page title (`PageHeader`) |
| `heading-section` | 22px | 600 | 30px | Major section title |
| `heading-card` | 18px | 600 | 26px | Component/card title |
| `title-item` | 16px | 600 | 24px | List/row item title |
| `body-large` | 16px | 400 | 26px | Primary reading copy, AI explanations |
| `body` | 14px | 400 | 22px | Default UI text |
| `body-small` | 13px | 400 | 20px | Secondary/supporting text |
| `label` | 13px | 500 | 18px | Form labels, nav items, numeric emphasis |
| `caption` | 12px | 400 | 16px | Helper text under a field/stat |
| `metadata` | 12px | 400 | 16px | Timestamps, IDs — always `text-tertiary` colored to read distinct from `caption` |
| `metric-large` | 40px | 600 | 44px | Hero KPI (tabular-number) |
| `metric` | 24px | 600 | 30px | Standard stat value (tabular-number) |
| `button` | 14px | 500 | 20px | All button labels |
| `code` | 13px | 400 | 20px | `--font-mono`, IDs/hashes/raw payloads |
| `tabular-number` | inherits | inherits | inherits | `font-variant-numeric: tabular-nums` modifier, layered on any role showing numbers in a column |

**Why four weights, wider than Tesla's observed two:** Tesla's marketing site only ever needs "heading" and "body." Founder is a data-dense operating environment — decision cards, tables, approval flows — where a third gradation (semibold section headings vs. medium labels vs. regular body) reduces reliance on boxes/borders to separate a heading from a label from a value, per Principle 4. This is documented as an explicit divergence, not an oversight.

## Weight rules

- **400 Regular** — body and supporting content only.
- **500 Medium** — labels, navigation items, numeric emphasis (matches Tesla's own use of Medium for nav/buttons/captions, not just headings).
- **600 Semibold** — page and section headings. This is the default heading weight, replacing the previous ad hoc bold headings.
- **700 Bold** — exceptional display emphasis only (e.g. a single hero number in an AI executive statement). Never for routine headings; never for more than one element per screen.

## Line height, letter spacing, width

- Letter spacing is `normal` at every role (Tesla's own display type measured `normal`, not tracked-in — see study §4). One documented exception: `display-hero` may use `-0.01em` for optical correction at very large sizes, applied via `--type-display-hero-tracking`.
- Max text width (`--measure-body`): **640px** for Latin body copy blocks (`body-large`/`body`). Chinese paragraph width (`--measure-body-cjk`): **38–42 characters**, approximated as the same 640px container (CJK glyphs are roughly square, so a fixed pixel measure works for both scripts without a separate character-count calculation).
- Numeric alignment: any column of numbers (tables, metric grids) applies `tabular-number` so digits align on a fixed-width grid — required for `DataTable` numeric columns and all `Metric`/`StatCard` values.
- Truncation: single-line text that can overflow (table cells, nav labels, breadcrumb segments) truncates with `text-overflow: ellipsis` at a component-defined max-width; never wraps unpredictably inside a fixed-height row.
- Wrapping: headings and body copy wrap normally; `metric`/`metric-large` and `code` never wrap (`white-space: nowrap`, with truncation as a fallback for extreme cases).

## Implementation

Roles ship as CSS custom properties in `theme.css` (`--type-<role>-*`) and as utility classes in `kit.css` (`.fdr-type-<role>`, e.g. `.fdr-type-heading-page`) so both CSS-class-based markup and one-off inline needs can consume the same scale. No component may declare a literal `font-size`/`font-weight`/`line-height` outside these tokens/classes — enforced by the design-review checklist and a vitest token-usage test.
