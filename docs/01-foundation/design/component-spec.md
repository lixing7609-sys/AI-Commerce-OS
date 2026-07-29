# Component Spec — AI Commerce OS Design DNA v1.0

Every component lives in `frontend/src/console/kit/` (primitives), `console/kit/ai/` (AI-specific), or `console/kit/business/` (business), styled via `fdr-*` classes in `kit.css` (extended this pass) and exported from `console/kit/index.js`. Existing components already in the kit are marked **(existing)**; components added in this pass are marked **(new)**. Each entry: purpose, anatomy, variants, states, sizing, accessibility, permitted/prohibited usage.

## Primitives

### Button (existing, extended)
- **Purpose:** trigger a single action.
- **Anatomy:** optional leading `Icon`, label, optional trailing `Icon`.
- **Variants:** `primary` (`--action-primary` fill), `secondary` (bordered), `ghost` (no border/fill), `danger` (`--danger` fill).
- **States:** default, hover, active, focus-visible, disabled, loading (spinner replaces label icon).
- **Sizing:** `sm` (28px), `md` (36px, default), `lg` (44px) — all `radius-xs`.
- **Accessibility:** native `<button>`; `aria-busy` when loading; disabled uses `disabled` attribute, not just visual dimming.
- **Permitted:** one `primary` button per view/card region max.
- **Prohibited:** two `primary` buttons competing in the same region; icon-only use (use `IconButton` instead).

### IconButton (new)
- **Purpose:** icon-only action trigger (toolbar, table row actions).
- **Anatomy:** single `Icon`, no visible label.
- **Variants:** `ghost` (default), `subtle` (tinted background on hover only).
- **States:** default, hover, active, focus-visible, disabled.
- **Sizing:** 32×32px minimum hit area regardless of icon size (14–20px icon centered).
- **Accessibility:** `aria-label` required — throws in dev if missing.
- **Permitted:** repeated toolbar/row actions.
- **Prohibited:** primary page actions (use `Button`).

### TextButton (new)
- **Purpose:** low-emphasis inline action (e.g. "查看全部").
- **Anatomy:** label only, no chrome; underline on hover.
- **Variants:** `default`, `muted` (`text-secondary`).
- **States:** default, hover, focus-visible, disabled.
- **Sizing:** matches surrounding text size (`body`/`body-small`).
- **Accessibility:** renders as `<button>` (not `<a>`) unless it navigates, in which case it's an `<a>` with the same visual treatment.
- **Permitted:** inline within body/card text.
- **Prohibited:** as a page's primary CTA.

### Input (new)
- **Purpose:** single-line text entry.
- **Anatomy:** `label`, input field, optional leading/trailing `Icon`, optional `caption`/error text.
- **Variants:** `default`, `error` (border `--danger`, `aria-invalid`).
- **States:** default, hover, focus (`--focus` ring), disabled, readOnly, error.
- **Sizing:** 36px height (default), 44px (`lg`, forms with sparse fields).
- **Accessibility:** `<label htmlFor>`; error linked via `aria-describedby`.
- **Permitted:** any single-line text/number/email/password entry.
- **Prohibited:** multi-line content (use `Textarea`).

### Textarea (new)
- Same contract as `Input`; **Anatomy** adds resize handle (vertical-only); **Sizing** min-height 80px, grows with content up to a max-height before scrolling.

### Select (new)
- **Purpose:** choose one option from a closed list.
- **Anatomy:** `label`, trigger (value + chevron `Icon`), `Popover`-hosted option list.
- **Variants:** `default`, `error`.
- **States:** default, hover, open, focus, disabled.
- **Accessibility:** native `<select>` under the hood for full a11y/mobile support; visually styled via `fdr-select`, not a custom listbox — avoids re-implementing ARIA combobox semantics.
- **Permitted:** ≤10 options with no search need.
- **Prohibited:** long/searchable lists (use `Combobox`).

### Combobox (new)
- **Purpose:** searchable single/multi-select.
- **Anatomy:** `Input`-style filter field, `Popover` option list, optional multi-select `Badge` chips.
- **States:** default, open, filtering, no-results (`EmptyState`, compact), disabled.
- **Accessibility:** ARIA combobox pattern (`role="combobox"`, `aria-expanded`, `aria-activedescendant`); arrow-key navigation.
- **Permitted:** store/agent/model pickers with >10 options.

### Checkbox / Radio (new)
- **Purpose:** boolean / single-choice-in-a-group selection.
- **Anatomy:** control + `label`.
- **States:** unchecked, checked, indeterminate (Checkbox only), disabled, focus.
- **Sizing:** 18×18px control, `radius-xs`.
- **Accessibility:** native `<input type="checkbox|radio">` under a styled wrapper — never a `<div>` faking the role.

### Switch (new)
- **Purpose:** immediate on/off toggle (not a form-submit boolean).
- **Anatomy:** track + thumb + optional inline label.
- **States:** off, on, disabled, focus.
- **Sizing:** `radius-pill` track, 20px thumb.
- **Accessibility:** `role="switch"`, `aria-checked`.
- **Permitted:** settings that apply immediately (e.g. AutomationPolicy toggle).
- **Prohibited:** multi-step form fields that need explicit Save (use `Checkbox`).

### SegmentedControl (new)
- **Purpose:** switch between 2–5 mutually exclusive views inline (e.g. 今天/7天/30天 range toggle currently built ad hoc in `DashboardModule.jsx`).
- **Anatomy:** pill-track container, segment buttons.
- **States:** per-segment default/selected/disabled.
- **Accessibility:** `role="radiogroup"` / segments as `role="radio"`.
- **Permitted:** replaces the current bespoke range-toggle button group.

### Tabs (existing)
- No change to anatomy; extended with `aria-selected`/`role="tab"`/`role="tablist"` if not already present (verified in Phase 4).

### Badge / StatusBadge (new, StatusPill retained as the underlying implementation)
- **Purpose:** compact status/category label.
- **Variants:** `neutral`, `success`, `warning`, `danger`, `information`, `ai` (uses `--ai-accent-subtle`).
- **Sizing:** single compact size, `radius-pill`.
- **Accessibility:** color always paired with text, never a bare dot.
- **Note:** `StatusBadge` is a semantic alias of the existing `StatusPill`/`DemoBadge` — consolidated under one name in `component-spec` and `index.js`, no duplicate implementation.

### Tooltip (new)
- **Purpose:** supplementary text on hover/focus for a control whose label alone is insufficient (icon buttons, truncated text).
- **States:** hidden, visible (200ms delay in, instant out).
- **Accessibility:** `role="tooltip"`, triggered by both hover and keyboard focus, dismissible via `Escape`.
- **Prohibited:** as the only source of a required label (labels must exist independently).

### Popover (new)
- **Purpose:** anchored floating content container (used internally by `Select`, `DropdownMenu`, `Combobox`).
- **States:** closed, open.
- **Accessibility:** focus-trapped only if it contains interactive content beyond a single trigger; dismiss on `Escape`/outside click.

### DropdownMenu (new)
- **Purpose:** anchored action menu.
- **Anatomy:** trigger + `Popover`-hosted item list, optional `Divider` between groups.
- **Accessibility:** `role="menu"`/`role="menuitem"`, arrow-key navigation, `Escape` to close.

### Dialog (existing `Modal`, renamed conceptually)
- **Purpose:** blocking, centered task (confirmation, focused edit).
- **Variants:** existing `Modal`/`ConfirmModal` retained as-is; `radius-lg`, `elevation-3`.
- **Accessibility:** already has Escape-to-close (`Modal.jsx`); this pass adds full focus trap + return-focus per `accessibility-spec.md`.

### Drawer (new)
- **Purpose:** non-blocking side panel for contextual detail (e.g. approval detail, asset preview) without leaving the list.
- **Anatomy:** slide-in panel (right edge, `--motion-deliberate`), header + scrollable body + optional footer actions.
- **States:** closed, open, closing.
- **Accessibility:** `aria-modal="true"` only if it blocks background interaction; otherwise labeled complementary region.

### Toast (existing `ToastProvider`)
- No structural change; tone variants already match `success/warning/danger/info`.

### Banner (new)
- **Purpose:** persistent, page-level or section-level status message (not a transient toast).
- **Variants:** `neutral`, `success`, `warning`, `danger`, `information`.
- **Accessibility:** `role="status"` (non-urgent) or `role="alert"` (urgent).
- **Permitted:** "not connected" / "demo data" / degraded-state notices at the top of a module.

### Divider (new)
- **Purpose:** low-contrast section separator, used sparingly per Principle 5/7 (sidebar rule).
- **Variants:** `horizontal`, `vertical`; optional inline label.

### Breadcrumb (new)
- **Purpose:** hierarchical location trail for deep object detail pages.
- **Accessibility:** `nav[aria-label="Breadcrumb"]`, ordered list.

### Pagination (new)
- **Purpose:** page through a long `DataTable`/list.
- **Anatomy:** prev/next `IconButton`s, page indicator, optional page-size `Select`.
- **Accessibility:** `nav[aria-label="Pagination"]`, current page marked `aria-current="page"`.

### SearchField (new)
- **Purpose:** dedicated search input with leading search `Icon` and clear affordance.
- **Anatomy:** `Input` variant with a fixed leading `Icon` and conditional trailing clear `IconButton`.

### FilterBar (new)
- **Purpose:** row of filter controls above a `DataTable`/list (currently only a raw `fdr-filter-bar` CSS class with no component).
- **Anatomy:** `SearchField` + `Select`/`Combobox` filters + active-filter `Badge` chips + clear-all `TextButton`.

### EmptyState (existing)
- No structural change; icon prop now standardizes on `Icon` components instead of literal glyph strings (see Icon System note in `AI-Commerce-OS-Design-DNA-v1.0.md`/implementation report migration notes).

### ErrorState (new, generalizing existing `RenderErrorState`)
- **Purpose:** page/module-level fatal error fallback.
- **Anatomy:** `EmptyState` composition with `danger`-toned icon, message, optional raw detail (dev-only), retry `Button`.

### NotConnectedState (new, consolidating existing `BackendUnavailableState`)
- **Purpose:** module requires a backend/integration connection that isn't present yet.
- **Anatomy:** `EmptyState` composition with a "Connect" primary action.
- **Note:** `BackendUnavailableState` remains the concrete implementation; `NotConnectedState` is documented as its semantic name going forward — no duplicate component created.

### Skeleton (new, generalizing existing `ModuleSkeleton`)
- **Purpose:** loading placeholder matching the shape of the content it precedes.
- **Variants:** `text`, `block`, `circle`, composed into page-level skeletons per module.
- **Accessibility:** `aria-busy="true"` on the container; content behind a skeleton is never announced as if loaded.

### DataTable (existing, extended)
- **Purpose:** structured tabular data.
- **New capabilities this pass:** `aria-sort` on sortable headers, `tabular-number` on numeric columns, compact/comfortable density modes, built-in `EmptyState`/`ErrorState`/`Skeleton` slots (loading/error/empty were previously only partially handled via the `emptyMessage` prop).
- **Permitted:** real tabular business data with >1 row typically shown.
- **Prohibited:** as a layout device for non-tabular content (use `KeyValueList` or open canvas instead — Principle 5).

### KeyValueList (new)
- **Purpose:** label/value pairs (object detail summaries) without a table's row chrome.
- **Anatomy:** definition-list rows, label in `label` role + `text-secondary`, value in `body`/`tabular-number` as appropriate.
- **Accessibility:** semantic `<dl>/<dt>/<dd>`.

### Metric (new)
- **Purpose:** single stat presentation matching the Tesla stat-strip pattern (large number + unit + caption) — this is the primary replacement for the current flat `StatCard` grid.
- **Anatomy:** `metric`/`metric-large` value (tabular-number) + optional unit suffix + `caption` label + optional `DeltaBadge`.
- **Variants:** `primary` (hero-weight, `metric-large`, used once per screen for the single most important number), `standard` (`metric`, used for supporting numbers).
- **Prohibited:** using `primary` variant more than once per screen — defeats its purpose as the one number that matters most (this rule directly addresses the "25 equal-weight StatCards" problem).

### Timeline (new)
- **Purpose:** chronological sequence of discrete events (audit trail, execution steps).
- **Anatomy:** vertical rail + per-entry marker, timestamp (`metadata`), title (`title-item`), description (`body-small`).
- **Accessibility:** ordered list semantics.

### ActivityFeed (new)
- **Purpose:** live/recent stream of activity items, denser than `Timeline` (used for "AI 正在做什么"-style running-task lists).
- **Anatomy:** list of compact rows: status `Icon`/`StatusBadge`, title, metadata, optional action.

### CommandPalette (new)
- **Purpose:** global `Cmd/Ctrl+K` command/search entry point (spec section 10 requirement — not present in the current shell at all).
- **Anatomy:** `Dialog`-hosted `SearchField` + grouped, keyboard-navigable results list.
- **Accessibility:** `role="dialog"` + `aria-label`, full arrow-key navigation, `Escape` to close.
- **Note:** this pass adds the component and wires a trigger into `ConsoleTopBar`; deep command indexing (searching every entity type) is out of scope and listed as a known limitation.

## AI-specific components (`console/kit/ai/`)

All documented together since they share one contract: every AI-specific component accepts a `reason` (why), and where relevant a `confidence`, `cost`, and `risk` — per `ai-interaction-language.md` rule 1.

| Component | Purpose | Required props | Prohibited usage |
|---|---|---|---|
| `AIRecommendation` | Observe+Recommend: a single proposed action with reason | `title`, `reason`, `priority` (P0/P1/P2), `action` | Never render with an empty `reason` |
| `AIDecisionCard` | Wraps a recommendation with the full Explain→Approve region composed | `recommendation`, `explanation`, `approval` | Duplicating `AIRecommendation` content instead of composing it |
| `AIExplanation` | Reasoning + expected effect, plain language | `reason`, `expectedEffect` | Pure jargon/model internals with no plain-language reason |
| `AIConfidence` | Quantified confidence | `value` (0–100), `label` (auto-derived: Low/Medium/High) | Bare adjective with no numeric value |
| `AIRiskAlert` | Risk level + specific concern | `level` (low/medium/high), `concern` | Generic "this may have risks" with no `concern` text |
| `AIActionApproval` | Inline approve/reject/edit | `onApprove`, `onReject`, `onEdit` (optional), `approver` | Link-out-only "去处理" pattern (replaces the current Secretary approval list) |
| `AIExecutionStatus` | Deterministic progress of an approved action | `steps`, `currentStep`, `state` (pending/running/done/failed) | Vague "AI is working" spinner with no step detail |
| `AILearningFeedback` | Recorded outcome vs. prediction | `outcome`, `predicted`, `actual` | Silent learning with nothing surfaced to the user |
| `AIModelBadge` | Which model/policy produced this | `modelName`, `version` | Omitting provenance on any Explain-stage content |
| `AICostIndicator` | Predicted/actual cost | `amount`, `unit`, `kind` (predicted/actual) | Hiding non-trivial cost |
| `AIAuditTrail` | Linked audit log entries for an AI action | `entries` (built on `Timeline`) | Reimplementing timeline UI instead of composing `Timeline` |

## Business components (`console/kit/business/`)

| Component | Purpose | Notes |
|---|---|---|
| `StoreContextSwitcher` | Switch active store/shop scope | Replaces the raw `fdr-scope-select` `<select>` in `ConsoleTopBar.jsx` with the new `Select` primitive + store metadata |
| `TokenBalance` | Current token budget/usage | `Metric`-based, `standard` variant |
| `DeviceStatus` | Mac mini / device connection state | `StatusBadge` + `metadata` (last-seen) |
| `VersionStatus` | App/edition version + update availability | `StatusBadge` + `TextButton` ("查看更新") |
| `LicenseStatus` | License tier/expiry | `KeyValueList`-based |
| `ApprovalQueue` | List of pending approvals, each row using `AIActionApproval` inline | Replaces the current plain `DataTable`-less link list in Secretary |
| `AutomationPolicy` | A configured automation rule's on/off + scope | `Switch` + `KeyValueList` for conditions |
| `WorkflowStatus` | Multi-step workflow progress | Built on `Timeline`/`ActivityFeed` |
| `AssetVersion` | Version metadata for a content/prompt/skill asset | `KeyValueList` + `Badge` |
| `ContentPreview` | Thumbnail/preview of a content asset with metadata | `radius-sm` media container (matches the Tesla-study media-panel radius) |

## Navigation Shell (v1.1)

**Purpose:** the permanent Founder left sidebar + top bar — see [navigation-shell-spec.md](navigation-shell-spec.md) for the full spec (anatomy, tokens, typography, states, collapsed mode, accessibility, prohibited patterns). Implemented in `console/shell/ConsoleSidebar.jsx` / `ConsoleTopBar.jsx`, styled via `console.css`'s `.fdr-sidebar__*`/`.fdr-topbar__*` rules and the `--sidebar-*` token set in `theme.css`.

- **Anatomy:** four zones (Product Identity / Workspace Context / Primary Navigation / System Utilities) — not a flat list.
- **Variants:** expanded (264px) / collapsed icon-rail (72px, manual toggle or forced below 1024px).
- **States:** default/hover/active/focus per nav row; expanded/collapsed per Labs-Cloud accordion group; open/closed per collapsed-mode flyout.
- **Permitted:** the Core/Labs/Cloud grouping is the only sanctioned top-level Founder navigation shape.
- **Prohibited:** restoring the retired "真实经营" entry; a second sidebar-like component; an accordion gate on a single-destination Core item; relative-positioned flyout content inside an `overflow:hidden` ancestor (must portal — see spec §11).

## Icon system

Single library: **Lucide React** (`lucide-react`), replacing the current literal-Unicode-glyph approach everywhere in new/touched components (existing untouched pages keep their glyphs until migrated — a known limitation, not silently patched app-wide). All icons render through a single `Icon` wrapper (`console/kit/Icon.jsx`) that enforces one of the six standard sizes (14/16/18/20/24/32px) and a consistent `strokeWidth` (1.75) — no raw `<SvgIcon>` usage outside the wrapper, and no mixing in a second icon library.

**Nav icon mapping (11 frozen top-level groups) — implemented in `console/nav/navIcons.js` as of v1.1 (previously just a planned mapping in this doc):**

| Section | Icon |
|---|---|
| Founder工作台 | `Gauge` |
| Agent中心 | `Bot` |
| Prompt中心 | `MessageSquareText` |
| Skill中心 | `Puzzle` |
| Workflow中心 | `Workflow` |
| Knowledge中心 | `BookOpen` |
| Connector中心 | `Plug` |
| Capability中心 | `Layers` |
| Operator实验室 | `FlaskConical` |
| Studio实验室 | `Palette` |
| Cloud Center | `Cloud` |

**Zone D system-utility icons** (`UTILITY_ICONS` in `console/nav/navIcons.js`): Search → `Search`, Command palette → `Command`, Notifications/Activity → `Bell`, Settings → `Settings`, Account → `CircleUserRound`, Connection status → `Wifi`, collapse/expand toggle → `PanelLeftClose`/`PanelLeftOpen`, accordion chevrons → `ChevronDown`/`ChevronRight`. Nested sub-items (Core secondary rows; Operator v2/Studio/Cloud registry items) intentionally render without icons — see navigation-shell-spec.md §7 for why.

Icons always accompany a text label in navigation — never a standalone icon-only nav item (spec requirement: "icons must support labels, not replace unclear labels").
