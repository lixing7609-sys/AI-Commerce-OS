# AI Commerce OS Design DNA v1.0

Status: **Foundation established, piloted on Founder工作台.** Not yet applied to the rest of the product. See `docs/11-review/design-dna-v1.0-implementation-report.md` for what shipped in this pass versus what's deferred.

## 1. Why this exists

Founder currently reads as a generic admin dashboard: 25 equal-weight `StatCard` tiles stacked across four blocks on the workbench home, no icon system (literal Unicode glyphs), no form-input component library, and seven CSS files each defining their own token namespace. This document — and the six spec documents it references — establishes the permanent visual and interaction foundation for AI Commerce OS Founder, and by extension the future standalone Operator, Studio, and Operator Cloud editions, even though this pass only implements tokens + components + one pilot screen (Founder工作台).

## 2. Primary design benchmark

Tesla's public website (`tesla.com`) is the discipline reference — see `tesla-design-language-study.md` for the actual research (live-inspected computed styles, not assumption). Tesla is a reference for **restraint and hierarchy discipline**, not a template: no Tesla assets, fonts, copy, or exact compositions are reused anywhere in this system.

The single most load-bearing finding from that research: Tesla's hierarchy comes almost entirely from **size and line-height, not from stacking bold weights or wrapping everything in cards** — a large stat number, a muted caption underneath, generous negative space, and one primary action per screen. That finding drives Principle 4 and 5 below directly.

## 3. Design positioning

AI Commerce OS should feel like a premium operating system and a calm AI command cockpit — worth bundling with a Mac mini, worth paying for, deliberately designed. It must not feel like ERP software, an admin template, a BI report, a Tesla clone, or a cyberpunk control room.

**Formula:** Tesla discipline + AI Commerce OS originality + desktop OS usability.

**Adjectives:** precise, quiet, premium, confident, spacious, intelligent, controlled, minimal, operational, human-centered.

## 4. Design philosophy

**Principle 1 — One Screen, One Primary Intent.** Every screen answers, within three seconds: where am I, what matters, what's expected of me, what does the AI recommend. Not fifteen equally weighted cards.

**Principle 2 — Decision First.** Founder is not a reporting dashboard. The first layer is decisions, exceptions, risks, and AI recommendations. Raw metrics come later, via progressive disclosure.

**Principle 3 — Calm Density.** Minimal isn't empty. Real work needs real information density — hierarchy is what prevents that density from reading as noise. Summary → context → detail → advanced controls.

**Principle 4 — Typography Creates Structure.** Borders and cards are not the default way to solve a hierarchy problem; size, weight, spacing, and alignment are. (Directly adopted from the Tesla research: the regional-availability grid on tesla.com uses zero card chrome and reads perfectly clearly.)

**Principle 5 — Fewer Containers.** Open canvas, grouped sections, dividers, and controlled surfaces before cards. A card exists only when an object genuinely needs an independent boundary — not as a default wrapper.

**Principle 6 — AI Is Embedded, Not Bolted On.** No AI-as-chat-box-only. AI shows up as a consistent product pattern: recommendation → explanation → confidence → risk → proposed action → approval → execution → result → learning feedback. See `ai-interaction-language.md`.

**Principle 7 — Consistency Before Decoration.** Every font size, spacing value, color, radius, icon size, and animation duration must trace back to a token. No arbitrary values in new work — enforced by `design-review-checklist.md` and (partially, per Phase 8) automated tests.

**Principle 8 — Originality Through Product Behavior.** Identity comes from the Observe→Recommend→Explain→Approve→Execute→Learn loop, not from cosmetic branding alone.

## 5. Signature language (summary — full spec in `ai-interaction-language.md`)

```
Observe → Recommend → Explain → Approve → Execute → Learn
```

Every AI-originated action in Founder (and eventually Operator/Studio/Cloud) passes through this loop, and each stage has one consistent component: `AIRecommendation` observes+recommends, `AIExplanation`/`AIConfidence`/`AIRiskAlert` explain, `AIActionApproval` gates execution, `AIExecutionStatus` shows deterministic progress, `AILearningFeedback` closes the loop. This is the strongest source of AI Commerce OS's originality — it is a behavior, not a color palette.

## 6. What this pass delivers vs. defers

**Delivered:** design tokens (typography/spacing/color/radius/motion) for the Founder console layer (`theme.css`), an icon system (Lucide), a completed component primitive set + AI-specific + business components in `console/kit`, an internal `/?module=designDna` showcase, and a rebuilt Founder工作台 pilot screen.

**Explicitly deferred (non-goals for this pass, per originating spec):** redesigning any other Founder page, the standalone `/operator` and `/studio` editions, Cloud Center backend, and unifying the three *other* parallel token systems already in the repo (`App.css`, `studioConsole.css`, `cloudConsole.css`, `operatorPreview.css`) — those are noted as the recommended next migration batch in the final implementation report.

## 7. Document map

- `tesla-design-language-study.md` — the research this doc is built on
- `typography-spec.md` — type roles, scale, font stack
- `layout-grid-spec.md` — spacing scale, shell dimensions, breakpoints
- `color-spec.md` — semantic color tokens, AI-accent decision
- `component-spec.md` — every primitive/AI/business component: purpose, anatomy, variants, states
- `ai-interaction-language.md` — the Observe→Learn loop in full
- `accessibility-spec.md`
- `design-review-checklist.md` — the gate every future page must pass
