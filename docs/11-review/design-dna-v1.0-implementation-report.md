# Design DNA v1.0 — Implementation Report

Branch: `design/design-dna-v1`. Scope: Founder console token/component foundation + one pilot screen (Founder工作台). Nothing pushed; nothing outside this scope was touched (confirmed via `git status` before and after — 73 changed files, all Design DNA work).

## 1. Tesla pages reviewed

`tesla.com` root (redirected to the Model S product page), full scroll at desktop (1440×900) and mobile (375×812) viewports, plus the cookie-consent dialog. Not reached: a non-vehicle page (e.g. Energy) and the open mega-nav dropdown state. Full findings: [tesla-design-language-study.md](../01-foundation/design/tesla-design-language-study.md).

## 2. Observed Tesla principles

Live-inspected via `getComputedStyle`, not assumed: a two-weight type system (500 for all headings/stat-numbers, 400 for body) with hierarchy from size/line-height rather than weight-stacking; a large-jump type scale (64/48/34/28/20/14/12px); small control radius (4px buttons) paired with a slightly larger media radius (8px) — not the pill-shaped buttons commonly assumed; an achromatic palette with one accent (a blue, not red, on Tesla's own product CTAs) reserved for the single primary action; short 250–330ms control transitions with no bounce; typography-only hierarchy in at least one section (the regional-availability grid has zero card chrome).

## 3. Original AI Commerce OS interpretation

Adopted the discipline (few weights, large-jump scale, tight-but-scaled radius relationship, restrained color, short motion, typography-first hierarchy, one primary action per screen) while rejecting anything literal: no proprietary font, no Tesla red, no card-free regional-list literalism (Founder's data density needs more structural weight contrast, so the scale widened from two weights to four — see typography-spec.md). The identity comes from the Observe→Recommend→Explain→Approve→Execute→Learn behavioral loop (ai-interaction-language.md), not from visual mimicry.

## 4. Typography decisions

Four semantic weights (400/500/600/700, vs. Tesla's two) across 16 roles (`display-hero` through `tabular-number`) — see [typography-spec.md](../01-foundation/design/typography-spec.md). Rationale for diverging from Tesla's two-weight system documented inline in that doc.

## 5. Font stack

`-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif` — zero bundled font files, matching the spec's "no separate font download" requirement.

## 6. Type scale

56/40/30/22/18/16 (display-hero → title-item) for headings, 16/14/13 for body, 12 for caption/metadata, 40/24 for metric-large/metric. Full table in typography-spec.md.

## 7. Grid decisions

12-column grid within a 1280px content max-width for narrative pages; full-bleed flex/grid layouts for data workspaces. Breakpoints at 1440/1280/1024/900 (narrow)/768 (minimum supported) — see [layout-grid-spec.md](../01-foundation/design/layout-grid-spec.md).

## 8. Spacing tokens

4px base, 8px rhythm: `--space-2/4/8/12/16/20/24/32/40/48/64/80/96`.

## 9. Color tokens

Full semantic set in [color-spec.md](../01-foundation/design/color-spec.md). Key decision: primary actions use a near-black graphite (`--action-primary`, matching Tesla's own "high-contrast dark button" variant) instead of the repo's previous generic `#4F46E5` indigo; a new, separate `--ai-accent` (`#0E7C86`, a desaturated teal) is reserved exclusively for AI-originated state so "the AI is involved here" stays a legible, non-decorative signal.

## 10. Radius rules

`--radius-xs: 4px` (controls) / `--radius-sm: 8px` (media, matching Tesla's observed media-panel radius) / `--radius-md: 12px` / `--radius-lg: 16px` / `--radius-xl: 24px` (hero surfaces only) / `--radius-pill: 999px` (pills/switch only).

## 11. Icon rules

Lucide React, installed as a new dependency, routed through a single `Icon` wrapper (`console/kit/Icon.jsx`) enforcing 6 fixed sizes (14/16/18/20/24/32) and one stroke width (1.75). Nav icon mapping for all 11 frozen top-level groups is in component-spec.md. Enforced by an automated test (`kitConventions.test.js`) that fails if any second icon library is imported or if any file besides `Icon.jsx` imports `lucide-react` directly.

## 12. Motion rules

5 duration tokens (100/150/200/300/500ms) + 3 easing curves, all collapsed to 0.01ms under `prefers-reduced-motion: reduce` at the token layer (so individual components don't need their own reduced-motion checks).

## 13. Component inventory

46 new files added to `console/kit/` (flat, matching the existing convention — no subfolders introduced): 22 primitives (Input/Textarea/Select/Checkbox/Radio/Switch/SegmentedControl/Tooltip/Popover/DropdownMenu/Drawer/Banner/Divider/Breadcrumb/Pagination/SearchField/FilterBar/ErrorState/NotConnectedState/Skeleton/KeyValueList/Timeline/ActivityFeed/CommandPalette/IconButton/TextButton/Badge/Metric/Icon — 26 total counting reused-pattern additions), 11 AI-specific components, 10 business components, plus 3 modified existing files (`StatusPill.jsx` gained a `StatusBadge` alias, `chartColors.js` now derives from a single JS token source, `ActivityFeed.jsx` gained an optional `statusLabel` prop). Full purpose/anatomy/variants/states/a11y documentation: [component-spec.md](../01-foundation/design/component-spec.md).

## 14. AI-specific components

`AIRecommendation`, `AIDecisionCard`, `AIExplanation`, `AIConfidence`, `AIRiskAlert`, `AIActionApproval`, `AIExecutionStatus`, `AILearningFeedback`, `AIModelBadge`, `AICostIndicator`, `AIAuditTrail` — implementing the Observe→Recommend→Explain→Approve→Execute→Learn loop from [ai-interaction-language.md](../01-foundation/design/ai-interaction-language.md). `AIRecommendation`/`AIRiskAlert` warn in DEV when their required `reason`/`concern` is missing (verified by test). `AIActionApproval` renders inline approve/reject/edit, replacing the Secretary module's previous link-out-to-approvalCenter pattern.

## 15. Showcase route

`/?module=designDna` — registered in `moduleRegistry.jsx`, added to `navConfig.js`'s `FOUNDER_MODULES` with `hiddenFromSidebar: true` (same pattern already used for `productCenter`/`orderCenter`/etc.), so it resolves via deep link but never appears in customer-visible navigation. Four tabs: Foundations (type scale, color swatches, spacing, radius, elevation), Components, AI Interaction Language (full six-stage loop demo), Product Examples (honest labels — Operator/Studio/Cloud panels explicitly say tokens aren't applied there yet).

## 16. Founder pilot implementation

Rebuilt `DashboardModule.jsx` and `SecretaryModule.jsx` (both previously untouched by the recent Founder IA rebuild). Secretary tab is now the Decision Home: AI executive statement (hero) → top risk banner → AI-recommendation decision feed → inline approval queue → execution status (live running-task `ActivityFeed`) → condensed business summary (goals progress + highlights) → collapsed-by-default chat (still available, no longer the first/primary surface — Design DNA Principle 6). Dashboard tab is the secondary detail tier: one primary `Metric` (completion rate) instead of 25 equal-weight `StatCard` tiles, a small standard-metric row, two dense `KeyValueList` blocks (was 19 StatCards across two blocks), unchanged trend charts. All existing real-data wiring (`safeCall`, `getRuntimeStatus`, `getTaskStats`, `getDashboardSummary`, `getTaskAnalytics`) preserved exactly — this was a presentation-layer rebuild only.

## 17. Accessibility result

Implemented per [accessibility-spec.md](../01-foundation/design/accessibility-spec.md): real `<label htmlFor>` associations on all new form primitives, `aria-describedby`/`aria-invalid` on field errors, required `aria-label` on `IconButton` (dev-time warning if omitted), focus-visible rings via `--focus` token, `Escape`/outside-click dismissal on all overlays, semantic `<table>`/`<dl>`/`<ol>` elements instead of styled divs, `prefers-reduced-motion` collapsed at the token layer. Verified by test: keyboard-focusability of the approval queue's action buttons. Not independently verified: screen-reader announcement behavior (no screen-reader-driven test tooling in this repo) and full keyboard-trap correctness in `Drawer`/`CommandPalette` beyond the automated focus check — manual review recommended before wide rollout.

## 18. Test result

`npm run test`: **380/380 passing**, 48 test files (7 new: `tokens.test.js`, `kitConventions.test.js`, `aiComponentStates.test.js`, `DesignDnaModule.render.test.jsx`, `SecretaryModule.render.test.jsx`, `DashboardModule.render.test.jsx`, plus `vitest.config.js` widened to also collect `*.test.jsx` and load the React plugin so jsdom render tests work alongside the existing Node-only suite without changing its environment). New coverage: token availability, no-second-icon-library / no-raw-hex-in-new-components (automated review-checklist rules), AI-component required-state warnings (called as plain functions — no DOM needed), showcase route renders + tab switching, Founder pilot renders + inline-approval interaction + keyboard focus, Dashboard tab structural assertions (exactly one primary Metric, zero legacy StatCard tiles). Added `jsdom` + `@testing-library/react` as new devDependencies to make DOM-render tests possible (previously the suite was Node-environment-only).

## 19. Lint result

`npm run lint`: **0 errors**, 4 pre-existing warnings in `OrderCenterModule.jsx`/`ProductCenterModule.jsx` (unrelated `react-hooks/exhaustive-deps` warnings, present before this pass, not introduced by it, not touched by this pass).

## 20. Build result

`npm run build`: succeeds. Two real build-breaking bugs were caught and fixed during this pass: (1) an em-dash/ASCII-divider comment in `kit.css` broke `lightningcss`'s minifier (`SyntaxError: Unexpected token BadString`) — fixed by simplifying the comment; (2) a stray closing brace left over from converting the dark-mode block from a `@media` query to a `[data-theme]` attribute selector broke the same minifier — fixed. Both were caught by actually running the production build, not assumed clean from dev-server behavior alone.

## 21. Screenshots

15 screenshots + a `console-errors.json` sidecar (0 errors recorded) captured via `frontend/e2e/design-dna-v1-screenshots.spec.js`, saved to `docs/11-review/design-dna-v1-screenshots/`: Founder pilot (Secretary + Dashboard tabs) at all three required viewports (1440/1280/1024 — 6 files), the Design DNA showcase's four tabs, expanded/collapsed sidebar nav group, a live AI-recommendation-flow shot, and the form/data components tab. The required viewport sweep was applied to the Founder pilot specifically (the one screen this pass claims is production-quality); the showcase and component shots are captured once at 1440px as representative documentation rather than three times each — noted here explicitly rather than silently narrowing scope.

## 22. Known limitations

- **Dark mode is token-complete but not activated.** `[data-theme="dark"]` tokens are fully defined (`color-spec.md`) but nothing in the app sets that attribute yet — no in-app theme toggle exists. (The previous `prefers-color-scheme: dark` auto-activation was deliberately removed after live-browser testing showed it silently broke the product's explicit "dark sidebar + light workspace, always" design — see `theme.css`'s own comment.)
- ~~Sidebar icon-rail collapse is a reserved token, not implemented behavior.~~ **Resolved in v1.1** — see the v1.1 addendum below.
- **Icon migration is partial by design.** Top-level Founder sidebar navigation (v1.1) and new/touched components use `Icon`/Lucide; nested sub-navigation pulled from the Operator v2/Studio/Cloud registries and the rest of the app's Unicode glyph icons are untouched, per the spec's own non-goal of not redesigning every page.
- **Operator Lab, Studio Lab, Cloud Center, and the standalone `/operator`/`/studio` editions are untouched** — each still runs its own parallel token system (`App.css`, `studioConsole.css`, `cloudConsole.css`, `operatorPreview.css`). This is the explicit non-goal boundary from the originating spec, not an oversight.
- **`Combobox` from the component spec was not built** — the spec's primitive list included it, but no current Founder screen needed a searchable multi-select in this pass, and building it speculatively without a real usage site risked exactly the "no half-finished implementations" anti-pattern the spec itself warns against. `Select` (native, styled) covers the pilot's actual needs.
- **Accessibility verification is automated-partial**, not a full manual or screen-reader audit — see §17.
- **`docs/01-foundation/` sits alongside `docs/01-reference-architecture/`** (both start with "01-"), per the spec's literal path requirement — a cosmetic numbering quirk, not fixed, since the spec gave this exact path.

## 23. Legacy migration strategy

The 4 legacy StatCard-grid patterns eliminated on the pilot (Dashboard's 25-tile grid, Secretary's link-out approval list) prove the pattern; the same replacement (`Metric` + `KeyValueList` instead of equal-weight `StatCard` grids, `AIActionApproval` instead of link-outs) should be mechanically repeatable across the other ~20 Founder modules that currently use `StatGrid`/`StatCard`. Recommended order: highest-traffic modules first (`agentStudio`, `productCenter`, `orderCenter`), then the AI-recommendation-bearing modules (`approvalCenter`, `automationPolicy`) since those get the most value from the AI-component vocabulary. Each migration batch should re-run `design-review-checklist.md` before merge.

## 24. Recommended next design migration batch (as of v1.0; see v1.1 addendum for what's since shipped)

1. Apply the icon system + `Icon` wrapper across `navConfig.js`'s remaining Unicode-glyph icons (mechanical, low-risk, high visual-consistency payoff).
2. Migrate 2–3 more Founder modules (`approvalCenter`, `agentStudio`) to the new primitives, proving the pattern beyond the pilot before a full rollout.
3. ~~Implement the sidebar icon-rail collapse~~ — **done in v1.1.**
4. Wire an in-app theme toggle to activate the already-complete dark tokens.
5. Only after the above: begin the larger, explicitly-deferred Operator/Studio/Cloud token unification — a bigger, separate effort touching 4 more CSS files (~4,300 lines) and 3 more product surfaces, correctly kept out of this pass's scope.

---

# v1.1 Addendum — Founder Navigation Shell

Visual review of v1.0 correctly identified a gap: the Founder工作台 workspace was rebuilt, but the permanent sidebar/topbar around it was left almost untouched, so the workspace and shell read as two different products. v1.1 closes that gap with a **structural** rebuild — not a restyle — of `ConsoleSidebar.jsx`/`ConsoleTopBar.jsx`. Full spec: [navigation-shell-spec.md](../01-foundation/design/navigation-shell-spec.md).

## A1. What changed structurally (not just CSS)

- **Four zones** replace the previous flat accordion list: Product Identity, Workspace Context (store-scope selector, moved from the topbar), Primary Navigation (scrollable, the only zone that scrolls), System Utilities (search/⌘K, notifications, settings, device status, account — new, didn't exist before).
- **Core is flat**, not an accordion — every one of the 8 Core groups (previously all accordion-gated, including single-item groups that needed a click to reveal their one child) is now directly clickable, per the spec's explicit "Core navigation remains directly visible" requirement.
- **Labs/Cloud split click targets** — group label navigates to the default workspace; a separate chevron only toggles the panel. The previous single button did both ambiguously.
- **Collapsed icon-rail mode is real, implemented behavior** (manually toggled, persisted, and forced below 1024px), not a reserved-but-unwired token as it was in v1.0.
- **Portal-based flyouts** for collapsed-mode nested content — see A3 for why this needed two passes to get right.
- **Presentational-only data layer change**: `navConfig.js` gained `NAV_ZONES` (buckets the existing 11 `NAV_GROUPS` into Core/Labs/Cloud). `FOUNDER_MODULES`, `NAV_GROUPS`, and `MODULE_REDIRECTS` are byte-for-byte the same shape as before — the canonical Founder IA did not change, only how it's presented.

## A2. New tokens

Full `--sidebar-*` set in `theme.css` (canvas/surface/border/text-primary/secondary/tertiary/active-surface/hover-surface/focus/status colors, dimension tokens for expanded/collapsed width, item height, gaps, indentation) — see navigation-shell-spec.md §4–§5. No pure black; the sidebar canvas (`#12151A`) intentionally matches v1.0's `--surface-inverse` rather than introducing a new hue.

## A3. Real bugs caught by actually testing in the browser (not just reading the code)

This list exists because every one of these would have shipped invisibly if verification had stopped at "the build passes":

1. **Automatic dark-mode override regression.** An early edit to `theme.css` made the whole workspace flip dark under `prefers-color-scheme: dark`, silently breaking the product's explicit "dark sidebar + light workspace, always" decision for any user with an OS dark preference. Caught by loading the actual app in a browser with dark OS preference active; fixed by moving dark tokens to an explicit `[data-theme="dark"]` selector (opt-in, not auto).
2. **Collapsed-mode flyout invisible.** `.fdr-root` and `.fdr-sidebar` both use `overflow: hidden`; a flyout positioned `absolute` inside that hierarchy rendered in the DOM but was completely invisible. Fixed with a portal (`createPortal` to `document.body`) + `position: fixed` computed from the anchor's real bounding rect at click time — then this exact bug **recurred independently** in the Design DNA showcase's demonstrator (which reused the same `.fdr-sidebar` CSS class and so inherited the same clipping), which is why the fix was extracted into a shared `SidebarFlyout.jsx` component used by both, rather than fixed twice in two copies.
3. **CSS-only responsive collapse desynced from JS interaction state.** An early approach used a `@media (max-width: 1023px)` block to visually hide sidebar labels without changing the actual `collapsed` React state. This left the Labs/Cloud chevron visible-but-non-functional at narrow widths (no flyout activated, since that logic keyed off real state, not CSS). Fixed by deriving an `effectiveCollapsed` value from real component state (`collapsed || narrowViewport`, tracked via `matchMedia` + a `resize` fallback) and using it everywhere, removing the CSS approximation entirely.
4. **Impure state updater silently dropping the persisted collapse preference.** `toggleCollapsed` called `setStoredSidebarCollapsed` (a `localStorage` write) *inside* the functional updater passed to `setCollapsed`. React 19's `StrictMode` double-invokes updater functions in development specifically to catch exactly this pattern; the double-invocation caused the persisted value to end up `null` after a toggle that visually succeeded. Caught by checking `localStorage` after a click, not just the visual result. Fixed by computing the next value once and calling both setters as plain statements outside the updater.
5. **Two buttons sharing one accessible name, one of them a hidden-but-still-focusable duplicate.** The Zone-A collapse toggle was hidden via `opacity: 0; pointer-events: none` when collapsed rather than removed from the DOM — `pointer-events: none` doesn't remove an element from the tab order, so a screen-reader/keyboard user would land on an inert, invisible duplicate of the visible "expand" button below it (both labeled "展开侧边栏"). Caught by an automated test (`getByRole` failing with "resolved to 2 elements"), not visual review. Fixed by conditionally rendering instead of CSS-hiding.
6. **`lightningcss` minifier choking on a stray brace** left over from converting the dark-mode block from `@media` to `[data-theme]` — caught by running the actual production build, matching the same class of bug found twice in the v1.0 pass.

## A4. Test result

`npm run test`: **399/399 passing** (up from 380 — 19 new tests: `ConsoleSidebar.render.test.jsx` covers canonical entries present/真实经营 absent/no-Unicode-icons/active state/Labs-Studio expansion/nested selection/collapsed mode/persistence/flyout+Escape/1024px forced collapse/full keyboard operability; `navigationShellConventions.test.js` covers no-raw-hex-colors/single-icon-source/required `--sidebar-*` tokens).

## A5. Lint / build result

`npm run lint`: 0 errors (same 4 pre-existing unrelated warnings as v1.0). `npm run build`: succeeds (one real bug caught and fixed in the process — A3.6).

## A6. Screenshots

10 screenshots + `console-errors.json` (0 errors) in `docs/11-review/design-dna-v1.1-screenshots/`, captured via `frontend/e2e/design-dna-v1.1-navigation-shell-screenshots.spec.js`: expanded sidebar (1440), collapsed sidebar (1440), Operator实验室 expanded, Studio实验室 expanded, sidebar at 1280 and 1024 (forced collapse), collapsed flyout, keyboard focus state, the Design DNA showcase's new Navigation & Application Shell tab, and the full Founder工作台 shell. All full-page — the sidebar is never cropped out.

## A7. Known limitations (v1.1)

- **Icon coverage stops at the top level.** Nested sub-items (Core secondary rows; the ~40+ items from the Operator v2/Studio/Cloud registries) intentionally render as plain text, no icon — a deliberate scope boundary (navigation-shell-spec.md §7), not an oversight.
- **The Design DNA showcase's navigation section is a shared demonstrator, not the literal `ConsoleSidebar` instance** — embedding the real component would navigate the showcase page itself on click and break under `position: sticky; height: 100vh` inside a bounded preview pane. The demonstrator reuses the exact same data source, CSS classes, and tokens (including the same `SidebarFlyout` fix from A3.2), which is the spec's own explicitly sanctioned alternative to "the real component."
- **Zone D utilities are functional but shallow** — notifications is a real popover with an honest empty state (no fake unread items), settings links to the existing `systemCenter` module, search/⌘K opens a real `CommandPalette` indexed against all visible Founder modules. None of these are deep new features; they satisfy the spec's structural requirement for the zone to exist and work, not a request to build a notification system.
- **Operator v2/Studio/Cloud's own navigation data is untouched**, per the non-goals — v1.1 only changed how Founder's sidebar *presents* those registries, not what they contain.

## A8. Recommended next batch (supersedes v1.0 §24 item 3)

1. Apply the `Icon`/Lucide system to the Operator v2/Studio/Cloud nested registries' own icon fields (currently plain text in the sidebar by deliberate v1.1 scope boundary).
2. Wire an in-app theme toggle to activate the dark tokens (still outstanding from v1.0).
3. Migrate 2–3 more Founder content modules to the primitive/AI component set (still outstanding from v1.0 §24 item 2).
4. Only after the above: the larger Operator/Studio/Cloud token-system unification (still explicitly out of scope).
