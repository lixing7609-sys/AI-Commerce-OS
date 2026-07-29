# Color Spec — AI Commerce OS Design DNA v1.0

## Direction

Mostly neutral, achromatic-first — directly adopted from the Tesla study (§15: near-black/white/gray dominant, one accent used sparingly for the primary action). Color carries meaning (action, status, risk, AI state, selection, focus); it does not decorate cards.

## The AI-accent decision

The current codebase's only accent is a generic `#4F46E5` indigo — the same "Tailwind-indigo SaaS" color used by hundreds of admin dashboards, and part of why Founder currently reads as generic. Tesla's own accent is not red for product CTAs (the study found `#3E6AE1`, a blue, on Tesla's own primary buttons — red is reserved for other brand contexts we didn't verify). Given the spec explicitly rules out both "copy Tesla red" and (implicitly) "keep the generic indigo," AI Commerce OS needed a deliberate, original third choice.

**Decision:** primary actions use a **near-black graphite** (`--action-primary`), the same family as the neutral text/surface-inverse tokens — calm, not attention-seeking, matching Tesla's own "high-contrast dark button" variant (study §11). A separate, distinct **AI-accent** — a desaturated deep teal, `#0E7C86` — is reserved *exclusively* for AI-originated state: recommendation highlights, confidence indicators, the `AIModelBadge`, and active-AI affordances. This does two things: it removes color as generic decoration (most of the UI stays neutral), and it makes "the AI is involved here" a legible, consistent visual signal rather than one more indigo button among many. Teal was chosen over blue/violet specifically to avoid re-landing on the same hue family as the current generic accent and the ubiquitous SaaS-blue palette, while staying calm and desaturated enough for long work sessions (not a neon/cyberpunk cyan).

## Semantic tokens

| Token | Light value | Dark value | Usage |
|---|---|---|---|
| `--canvas` | `#F7F8FA` | `#0B0D10` | App background |
| `--canvas-subtle` | `#EEF0F3` | `#111419` | Secondary background regions (sidebar panel fill) |
| `--surface` | `#FFFFFF` | `#14171C` | Card/panel surface |
| `--surface-raised` | `#FFFFFF` + `--elevation-2` | `#1B1F26` + `--elevation-2` | Popover/menu/dialog surface |
| `--surface-inverse` | `#12151A` | `#F5F6F7` | Dark chrome (sidebar), inverse-context surfaces |
| `--border-subtle` | `#E7E9EC` | `#22262D` | Default hairline dividers |
| `--border-default` | `#DADEE3` | `#2B3038` | Input/card borders |
| `--border-strong` | `#C2C7CE` | `#3A4048` | Emphasized borders (focus-adjacent, active table row) |
| `--text-primary` | `#14171C` | `#F1F2F4` | Primary text (matches Tesla's observed `#171A20` closely) |
| `--text-secondary` | `#5B6169` | `#B5BAC2` | Secondary text (matches Tesla's `#5C5E62`) |
| `--text-tertiary` | `#8A8F98` | `#7C828C` | Metadata/tertiary (matches Tesla's `#8E8E8E`) |
| `--text-inverse` | `#F5F6F7` | `#14171C` | Text on `--surface-inverse` |
| `--action-primary` | `#12151A` | `#F1F2F4` | Primary button fill |
| `--action-hover` | `#22262D` | `#DADEE3` | Primary button hover |
| `--focus` | `#2563EB` | `#3B82F6` | Focus ring only — conventional accessible blue, deliberately not the AI-accent so focus state never reads as "AI activity" |
| `--success` | `#16A34A` | `#22C55E` | Positive status |
| `--warning` | `#D97706` | `#F59E0B` | Caution status |
| `--danger` | `#DC2626` | `#EF4444` | Error/destructive status |
| `--information` | `#2563EB` | `#3B82F6` | Neutral informational status |
| `--ai-accent` | `#0E7C86` | `#2DD4C7` | AI state, recommendation/approval/execution highlights, `AIModelBadge` |
| `--ai-accent-subtle` | `rgba(14,124,134,0.08)` | `rgba(45,212,199,0.14)` | AI card/badge background tint |

## Chart colors

`console/kit/chartColors.js` currently hardcodes hex values (Recharts cannot consume CSS custom properties directly). This pass replaces that manual duplication with a single JS token source (`frontend/src/styles/tokens.js`) that both `theme.css`'s generation and `chartColors.js` read from, so the two never drift — see the implementation report for the mechanism.

## Contrast

All text/border combinations above were chosen to meet **WCAG AA** (4.5:1 body text, 3:1 large text/UI components) against their paired surface in both light and dark. `--text-tertiary` on `--canvas` is the tightest pairing (~4.6:1) and is reserved for metadata only, never body copy, to stay safely on the correct side of AA at 12px.

## Rules

- No arbitrary hex values in component code — every color is a token reference.
- Status colors (`success`/`warning`/`danger`/`information`) are reserved for actual status meaning, never used decoratively on unrelated UI.
- `--ai-accent` is reserved for AI-originated content — using it on a non-AI element is a design-review violation (see `design-review-checklist.md`).
- Cards/surfaces are not colored arbitrarily; the only permitted surface tint is `--ai-accent-subtle` on AI-pattern components and semantic status tints on `Banner`/`StatusPill`.
