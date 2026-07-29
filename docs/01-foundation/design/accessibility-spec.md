# Accessibility Spec — AI Commerce OS Design DNA v1.0

Baseline before this pass (confirmed by repo audit): zero `prefers-reduced-motion` handling anywhere in `frontend/src`; ~55 `aria-*` attributes total, concentrated in nav/sidebar/modal components, applied ad hoc rather than as a shared component-layer guarantee; no `eslint-plugin-jsx-a11y`. This spec is the target state for new Design DNA components and the Founder工作台 pilot; it is not a claim that the rest of the app already meets it (see implementation report).

## Keyboard navigation

- Every interactive component (`Button`, `Input`, `Select`, `Checkbox`, `Radio`, `Switch`, `Tabs`, `DropdownMenu`, `CommandPalette`, table rows with `onRowClick`) must be reachable via `Tab`/`Shift+Tab` and operable via `Enter`/`Space` without a mouse.
- `Dialog`/`Drawer`/`Modal` trap focus while open and return focus to the triggering element on close (extends the existing `Modal.jsx` Escape-to-close behavior).
- `DropdownMenu`/`Popover`/`CommandPalette` support arrow-key item navigation and `Escape` to dismiss.
- `CommandPalette` is reachable via a documented global shortcut (`Cmd/Ctrl+K`) in addition to a visible trigger.

## Visible focus states

- Every focusable element shows a visible focus ring using `--focus` (`color-spec.md`) — never `outline: none` without a replacement ring. Minimum 2px ring, 2px offset from the element edge.
- Focus rings must be visible against both `--surface` and `--surface-inverse` (sidebar) contexts — verified per component, not just the default background.

## Color contrast

- All text/border token pairings meet WCAG AA per `color-spec.md`'s contrast section (4.5:1 body, 3:1 large text/UI components).
- Status meaning is never color-only: `StatusPill`/`Banner`/`AIRiskAlert` always pair color with a text label or icon, never a bare colored dot as the sole signal.

## Hit areas

- Minimum interactive hit area: 32×32px for icon-only controls (`IconButton`), even where the visual glyph is smaller (14–18px icon centered in a larger tappable/clickable box).
- Table row actions and inline icon buttons follow the same minimum regardless of visual density mode (comfortable/compact).

## Screen-reader labels

- `IconButton` requires an `aria-label` prop — the component throws in development if omitted (no icon-only control ships silently unlabeled).
- `StatCard`/`Metric` values expose their label via `aria-label` or visually-associated `<label>` semantics, not color/position alone.
- `Toast`/`Banner` use `role="status"` (non-blocking) or `role="alert"` (urgent) as appropriate, so screen readers announce them without requiring focus.
- `AIConfidence`/`AIRiskAlert` expose their qualitative + numeric value in the accessible name, not just a visual bar/badge.

## Reduced motion

- All motion-token-driven transitions/animations (`kit.css` and any component-level CSS) are wrapped so that `@media (prefers-reduced-motion: reduce)` reduces duration to near-zero (≤10ms) and disables non-essential transforms (parallax, slide-in), while state changes (open/closed, selected/unselected) still apply instantly. This is implemented at the token layer (`--motion-*` durations resolve to `0.01ms` under the media query) so individual components don't need to each re-implement the check.

## Semantic HTML

- `PageHeader` renders an actual `<h1>`/`<h2>` per its heading-role prop, not a styled `<div>`.
- `DataTable` renders `<table>`/`<thead>`/`<tbody>`/`<th scope="col">`, not `<div>` grids styled to look like a table.
- Forms use `<label for>`/`<fieldset>`/`<legend>` associations via the new `Input`/`Select`/`Checkbox`/`Radio` components rather than raw unlabeled inputs (closing the gap noted in the repo audit: `AssetCenterModule.jsx` currently applies `fdr-input` classes directly to native elements with no shared label-association pattern).

## Table accessibility

- Sortable column headers expose `aria-sort`.
- Row selection (checkboxes) is keyboard-operable and announces selected-count changes via a `role="status"` live region, not silently.

## Dialog focus trapping

- `Dialog`/`Drawer` set `aria-modal="true"`, label themselves via `aria-labelledby` pointing at their title, and trap `Tab` cycling within their contents until closed.

## Error messaging

- Form field errors render via `aria-describedby` linking the input to its error text (a `caption`-role element with `role="alert"` semantics on first appearance), and set `aria-invalid="true"` on the field.

## Form labels

- Every `Input`/`Textarea`/`Select`/`Checkbox`/`Radio`/`Switch` requires a `label` prop; the component associates it via `<label htmlFor>`, not placeholder-as-label.
