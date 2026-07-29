# Navigation Shell Spec — AI Commerce OS Design DNA v1.1

Status: **Implemented** in `frontend/src/console/shell/ConsoleSidebar.jsx` / `ConsoleTopBar.jsx` / `console.css`. This is the v1.1 companion to `AI-Commerce-OS-Design-DNA-v1.0.md` — v1.0 redesigned the Founder工作台 workspace; v1.1 redesigns the permanent shell around it (the left navigation and top bar), which v1.0 left almost untouched. That gap — workspace and shell reading as two different products — is the defect this spec closes.

## 1. Why a structural rebuild, not a restyle

The pre-v1.1 sidebar (`console.css`'s `.fdr-sidebar__*` rules, ~180 lines) was a single flat accordion list: every one of the 11 top-level groups (including single-item ones like Prompt中心) required a click to expand before its one child was reachable, active state was a bright indigo block with a left border, icons were literal Unicode glyphs, and there was no collapsed mode, no product-identity zone, no workspace-context zone, and no system-utilities zone. Restyling that structure's colors would not have fixed the actual complaint ("weak typographic hierarchy," "dense lists of equally weighted menu items," "insufficient distinction between Core systems and Labs"). This pass replaces the component's internal structure, not just its CSS.

## 2. Anatomy — four zones

```
┌─────────────────────────────┐
│ Zone A — Product Identity    │  identity mark, wordmark, edition, collapse toggle
├─────────────────────────────┤
│ Zone B — Workspace Context   │  store-scope selector (hidden on the Secretary tab, which is
│                               │  Founder-wide, not store-scoped)
├─────────────────────────────┤
│                               │
│ Zone C — Primary Navigation  │  Core (flat) / Labs (accordion) / Cloud (accordion)
│         (scrollable)         │  — the only zone that scrolls; A/B/D stay fixed so a long
│                               │    expanded Labs/Studio menu never pushes the identity mark
│                               │    or utilities off-screen (spec §9's scrolling requirement)
├─────────────────────────────┤
│ Zone D — System Utilities    │  search/⌘K, notifications, settings, device status, account
└─────────────────────────────┘
```

Implementation: `ConsoleSidebar.jsx` renders exactly these four regions in `.fdr-sidebar__identity` / `.fdr-sidebar__context` / `.fdr-sidebar__scroll` / `.fdr-sidebar__utilities`.

## 3. Data model — presentational only, IA unchanged

`navConfig.js`'s `NAV_ZONES` (new, additive) buckets the existing 11 `NAV_GROUPS` into the three canonical zones. **No module key, group key, or redirect changed** — `FOUNDER_MODULES`, `NAV_GROUPS`, and `MODULE_REDIRECTS` are exactly what they were before v1.1:

```js
NAV_ZONES = [
  { key: "core", groups: [founderWorkbenchGroup, agentCenterGroup, promptCenterGroup,
                            skillCenterGroup, workflowCenterGroup, knowledgeCenterGroup,
                            connectorCenterGroup, capabilityCenterGroup] },
  { key: "labs", groups: [operatorLabGroup, studioLabGroup] },
  { key: "cloud", groups: [cloudCenterGroup] },
];
```

This is why the rebuild could be structural without being risky: Operator v2 / Studio / Cloud each still render via direct import of their own authoritative registry (`labs/operatorLabV2/navigation.js`, `studio/navConfig.js`, `cloud/navConfig.js`) exactly as before — this pass changed how they're *presented*, not what they *are*.

**Core is flat, not accordion** (spec §9: "Core navigation remains directly visible"). Single-module Core groups (Prompt中心, Skill中心, Knowledge中心, Connector中心) render as one direct row named after the group. Multi-module Core groups (Agent中心 → Agent 工作室 + 模型路由; Workflow中心 → 自动化策略 + 回放中心; Capability中心 → 基准测试中心 + 评估中心 + 广告策略研发) show their first module as that row and the rest as always-visible secondary rows beneath it — zero accordion clicks anywhere in Core, and every previously-reachable module stays reachable.

**Labs/Cloud keep single-expanded accordion** — now scoped to just those 3 groups (previously all 11 groups shared one `expandedGroup` slot; Core no longer participates, since it has no accordion).

## 4. Dimensions and tokens

All in `theme.css` under "Navigation shell (Design DNA v1.1)":

| Token | Value | Notes |
|---|---|---|
| `--sidebar-width-expanded` | 264px | within the 248–272px target range |
| `--sidebar-width-collapsed` | 72px | within the 64–76px target range |
| `--sidebar-padding-x` | `--space-20` (20px) | |
| `--sidebar-item-height` | 40px | comfortable scanning, not ERP-cramped |
| `--sidebar-item-gap` | 2px | |
| `--sidebar-icon-gap` | 10px | icon-to-label |
| `--sidebar-zone-gap` | `--space-24` (24px) | between Core/Labs/Cloud |
| `--sidebar-indent` | `--space-16` (16px) | one nesting level only |
| `--sidebar-identity-height` | 64px | |
| `--sidebar-transition` | `width var(--motion-deliberate) var(--ease-standard)` | smooth expand/collapse, no layout jump |

## 5. Color — dark sidebar, semantic tokens, no pure black

Per spec §12, a dedicated token set (not reusing the light-workspace tokens, and not `#000`):

| Token | Value | Usage |
|---|---|---|
| `--sidebar-canvas` | `#12151A` | base (matches `--surface-inverse` from v1.0 — same design language, not a new hue) |
| `--sidebar-surface` | `#181C22` | elevated (flyout panels) |
| `--sidebar-border` | `rgba(255,255,255,.08)` | |
| `--sidebar-text-primary` | `#F1F2F4` | |
| `--sidebar-text-secondary` | `#9AA0AB` | |
| `--sidebar-text-tertiary` | `#6B7280` | group labels, metadata |
| `--sidebar-active-surface` | `rgba(255,255,255,.08)` | tonal, not a bright color block |
| `--sidebar-hover-surface` | `rgba(255,255,255,.045)` | quieter than active |
| `--sidebar-focus` | `var(--focus)` | same token as the rest of the app |
| `--sidebar-success/warning/danger/info` | dark-mode-bright variants | for the device-connection status dot |
| `--sidebar-ai-accent` | `#2DD4C7` | identity mark + account avatar only — reserved, not decorative |

No component file references a raw hex value — verified by `navigationShell.test.js` (see §14).

## 6. Typography

Uses the v1.0 semantic type roles directly, no new sizes invented:

| Element | Role | Size/weight |
|---|---|---|
| Wordmark ("AI Commerce OS") | ad hoc 15px/`heading-card` weight | 15px / 600 — distinct from nav labels |
| Edition ("Founder") | `caption` | 12px / 400, `--sidebar-text-tertiary` |
| Zone label ("Core"/"Labs"/"Cloud") | ad hoc | 11px / 500, `--sidebar-text-tertiary`, slight letter-spacing (English word) |
| Navigation label | `body` | 14px / 400 |
| Active navigation label | `body` + `label` weight | 14px / 500 |
| Subgroup label (e.g. Studio's internal groups) | ad hoc | 10.5px / 500 |

No 11px navigation text anywhere (only the zone label, which is explicitly a label role, sits below 12px, matching the spec's own "Group label: 11–12px" guidance).

## 7. Icons

Lucide only, via the existing `Icon` wrapper (`console/kit/Icon.jsx`). Canonical map lives in `console/nav/navIcons.js`:

`NAV_ICON_MAP` (top-level Core/Labs/Cloud destinations): Founder工作台→`Gauge`, Agent中心→`Bot`, Prompt中心→`MessageSquareText`, Skill中心→`Puzzle`, Workflow中心→`Workflow`, Knowledge中心→`BookOpen`, Connector中心→`Plug`, Capability中心→`Layers`, Operator实验室→`FlaskConical`, Studio实验室→`Palette`, Cloud Center→`Cloud`.

`UTILITY_ICONS` (Zone D): search→`Search`, command palette→`Command`, notifications→`Bell`, settings→`Settings`, account→`CircleUserRound`, connection status→`Wifi`, collapse/expand→`PanelLeftClose`/`PanelLeftOpen`, chevrons→`ChevronDown`/`ChevronRight`.

**Deliberate scope boundary:** nested sub-items (Core's secondary rows, and the ~40+ items pulled in from the Operator v2 / Studio / Cloud registries) render as plain indented text with no icon — a restrained, common pattern (Linear/Notion-style) rather than hand-assigning icons across three registries this task does not own. This still fully satisfies "no Unicode glyph icons in the Founder sidebar," since there are none at any level.

## 8. Active / hover / focus states

Per spec §8's explicit prohibited list — none of these are used: bright full-width color blocks, colored pills, gradients, heavy shadows, thick left borders, glow.

- **Active:** `.fdr-sidebar__item--active` → `background: var(--sidebar-active-surface)` (an 8%-white tonal wash, not a color), text goes from secondary to primary, weight goes from 400 to 500. No border, no pill.
- **Hover:** `background: var(--sidebar-hover-surface)` (4.5%-white, quieter than active), `transition: background var(--motion-fast)` (150ms) — no movement.
- **Focus:** `outline: 2px solid var(--sidebar-focus); outline-offset: -2px` on every interactive element (nav rows, chevrons, utility buttons) — inset rather than outset so it doesn't get clipped by the sidebar's own edge, and it does not depend on hover state being active first.

## 9. Nested navigation — split click targets

Labs/Cloud group rows are two separate elements, not one ambiguous button (fixing the exact failure mode spec §9 calls out): `.fdr-sidebar__group-label` (navigates to the group's default workspace, and expands the panel if collapsed — never collapses it) and `.fdr-sidebar__group-chevron` (only toggles expand/collapsed, never navigates). This means a user can peek at Studio's full menu via the chevron without leaving their current page, or jump straight to Studio's default workspace via the label without needing to expand first.

Expansion persists via the existing `sidebarExpansionStore.js` (localStorage, unchanged mechanism from pre-v1.1) — single-expanded-group rule, now scoped to the 3 Labs/Cloud groups only. The active module's group force-expands on navigation regardless of prior manual collapse (existing "adjust state during render" pattern, unchanged).

## 10. Collapsed icon-rail mode

Real, implemented behavior (`effectiveCollapsed` in `ConsoleSidebar.jsx`), not deferred:

- Manual toggle (Zone A's `PanelLeftClose`/`PanelLeftOpen` icon button) — persisted via `getStoredSidebarCollapsed`/`setStoredSidebarCollapsed` in `sidebarExpansionStore.js` (same localStorage mechanism as the existing accordion-expansion preference, not a new state solution).
- **Forced** below 1024px viewport width (`narrowViewport`, tracked via `matchMedia("(max-width: 1023px)")` + a `resize` listener fallback) — the user's own manual preference is preserved independently and resumes once the viewport widens back out.
- Identity mark, canonical icons, active state, and Zone D utilities all remain visible in collapsed mode — only text labels hide.
- **Tooltips** (`console/kit/Tooltip.jsx`) on every collapsed single-destination item.
- **Flyouts** for any collapsed item with nested content (Labs/Cloud groups, and Core's multi-module groups) — see §11.
- Width changes via a single CSS custom property + `transition: width` (`--sidebar-transition`); the content column reflows via normal flexbox, no JS-measured layout jump.

## 11. Collapsed-mode flyouts — portal-based, not relative-positioned

**Implementation note worth preserving:** the first implementation positioned flyouts `position: absolute` inside the sidebar's own DOM subtree. Live browser testing caught that this rendered invisibly — `.fdr-root` and `.fdr-sidebar` both use `overflow: hidden` (intentionally, to contain the fixed-height mission-control layout), which silently clips anything meant to visually escape the sidebar's own width. The fix (`SidebarFlyout` in `ConsoleSidebar.jsx`) portals the flyout to `document.body` via `createPortal` and positions it with `position: fixed` computed from the anchor's real `getBoundingClientRect()` at click time — this is the standard, correct pattern for floating UI that must escape a clipped ancestor chain, and is documented here so it isn't "fixed" back to the broken relative-positioning approach later.

Flyout rect is captured **synchronously in the triggering click handler** (`event.currentTarget.getBoundingClientRect()`), not inside a `useEffect` — the repo's React Compiler lint rule (`react-hooks/set-state-in-effect`) forbids calling `setState` directly inside an effect body, so no DOM-measurement effect exists at all.

Dismissal: `Escape` key or an outside click (checked against both the flyout panel and the anchor element) — verified in the browser and covered by `navigationShell.test.js`.

## 12. Scrolling strategy

Only `.fdr-sidebar__scroll` (Zone C) scrolls (`overflow-y: auto`); Zone A/B/D are flex children outside that scroll container, so they never move even when Studio's ~30-item expanded menu exceeds the viewport height. `overflow-x` on the scroll container is `visible`, not `hidden` — required so collapsed-mode flyouts (which intentionally render outside the 72px rail) aren't clipped (see §11's portal note for why this alone wasn't sufficient and a portal was still needed for the `.fdr-sidebar`/`.fdr-root` ancestors).

## 13. Responsive behavior

Validated at 1440/1280/1024px via live browser testing (not just CSS review):

- **≥1024px:** sidebar renders at the user's chosen expanded/collapsed preference.
- **<1024px:** `effectiveCollapsed` is forced `true` regardless of stored preference (the manual toggle button hides itself — there's nothing meaningful to toggle when the viewport is forcing the state). This is real component state driving real markup, not a CSS-only visual approximation — an earlier CSS-media-query-only approach was caught and rejected during testing specifically because it desynchronized from the JS interaction model (chevrons stayed visible-but-broken, no flyout activated).
- No phone-width navigation system was built (non-goal, desktop-first product).

## 14. Accessibility

- Every interactive row is a real `<button>` (native keyboard operability, no `<div onClick>`).
- `aria-expanded`/`aria-controls` on Labs/Cloud chevrons.
- `aria-label` on the collapse toggle, each collapsed group's icon button, and each Zone D utility.
- Escape closes the collapsed-mode flyout (tested).
- Focus-visible outline (`--sidebar-focus`) is never suppressed by a hover-only style — the two are independent CSS rules.
- Store-context `<select>` carries `aria-label="当前店铺范围"`.

## 15. Prohibited patterns (enforced by `design-review-checklist.md` §Navigation)

- No raw hex colors in sidebar component files — semantic tokens only.
- No second icon source — Lucide via `Icon.jsx` only, no literal glyphs in top-level nav.
- No single ambiguous click target that both navigates and toggles a panel.
- No sidebar accordion requiring a click before a single-destination Core item is reachable.
- No relative/absolute-positioned flyout content inside an `overflow: hidden` ancestor (see §11) — must use the portal pattern.
- No restoring the retired "真实经营" top-level entry.
- No new global state mechanism for collapse/expand preferences — reuse `sidebarExpansionStore.js`.
