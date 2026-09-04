# Design Review Checklist — AI Commerce OS Design DNA v1.0

Every new or redesigned page must pass this checklist before merge. This is the enforcement mechanism for Design DNA Principle 7 (Consistency Before Decoration).

## Typography
- [ ] Uses only semantic type tokens/classes from `typography-spec.md` (`--type-<role>-*` / `.fdr-type-<role>`) — no arbitrary `font-size`/`font-weight`/`line-height` in component code.
- [ ] No excessive bold — 700 appears at most once per screen, and only for genuine hero emphasis.
- [ ] Line length is controlled (`--measure-body` / `--measure-body-cjk`) for prose blocks.
- [ ] Hierarchy is visible without relying on borders/card chrome (Principle 4).

## Spacing
- [ ] Uses spacing tokens (`--space-*`) from `layout-grid-spec.md` — 8px-multiple by default, documented exception if not.
- [ ] Alignment follows the 12-column content grid (narrative pages) or an intentional flex/grid layout (workspace pages).
- [ ] Section rhythm is consistent (`--page-padding-y` / `--space-40` between major sections).

## Color
- [ ] Uses semantic color tokens from `color-spec.md` — no arbitrary hex values.
- [ ] Status colors (`success`/`warning`/`danger`/`information`) are used for actual status meaning only.
- [ ] `--ai-accent` appears only on AI-originated content, never as generic decoration.
- [ ] Text/border contrast passes WCAG AA against its paired surface.

## Components
- [ ] Uses canonical `console/kit` primitives — no duplicate local `Button`/`Input`/etc. implementation.
- [ ] No mixed icon library — Lucide only, always through the `Icon` wrapper.
- [ ] All documented states exist for every component used (default/hover/focus/disabled/error/loading as applicable per `component-spec.md`).

## Composition
- [ ] One primary intent per screen (Principle 1) — a reader should identify it within three seconds.
- [ ] One primary action per screen/region (`Button` `primary` variant used at most once per region).
- [ ] Progressive disclosure used for secondary/detailed information (Principle 3) rather than flattening everything to one layer.
- [ ] No unnecessary cards — a card exists only when its content needs an independent boundary (Principle 5).
- [ ] No text-only placeholder sections and no excessive empty area with no content or action.
- [ ] Does not read as a generic admin-template grid of equal-weight tiles (the specific failure mode this pass fixes on Founder工作台).

## AI
- [ ] Every `AIRecommendation`/`AIDecisionCard` includes a non-empty `reason`.
- [ ] Cost and risk are visible wherever the underlying action has non-trivial cost/risk.
- [ ] Approval and execution state are explicit and inline (`AIActionApproval`/`AIExecutionStatus`), not a bare link-out.
- [ ] System learning state is auditable (`AILearningFeedback` → `AIAuditTrail`), not silent.

## Accessibility
- [ ] Fully keyboard usable (tab order, `Enter`/`Space` activation, `Escape` to dismiss overlays).
- [ ] Focus is visible at every step, on every background context used.
- [ ] All form fields have real `<label>` associations (not placeholder-as-label).
- [ ] Reduced motion is respected (`prefers-reduced-motion` shortens/removes non-essential transitions).

## Navigation (v1.1)
- [ ] Uses the canonical Core/Labs/Cloud grouping — no new top-level nav concept invented.
- [ ] Core items are directly clickable — no accordion gate on a single-destination row.
- [ ] Labs/Cloud group rows use split click targets (label navigates, chevron only toggles) — never one ambiguous target doing both.
- [ ] Collapsed-mode content with nested items uses a portal-based flyout, never relative/absolute positioning inside `.fdr-sidebar`/`.fdr-root` (both `overflow: hidden` — see navigation-shell-spec.md §11).
- [ ] All sidebar colors are `--sidebar-*` tokens — no raw hex.
- [ ] No duplicate Founder navigation entries between Core/Labs/Cloud and any embedded registry.

## How this is enforced in this pass

- Manual: this checklist, applied to the Founder工作台 pilot (v1.0) and the navigation shell rebuild (v1.1) before commit.
- Automated (partial, see `docs/11-review/design-dna-v1.0-implementation-report.md` for exact coverage): vitest checks for token availability, absence of legacy arbitrary colors in new components, single-icon-source usage, required AI-component states, and (v1.1) navigation-shell structural/behavioral assertions (`navigationShell.test.jsx`).
- Not yet automated: line-length/measure enforcement, one-primary-action-per-screen — these remain manual review items for now and are listed as a follow-up in the implementation report.
