---
document_id: ADR-0002B
title: Founder V4 Commerce Operating Architecture Freeze
status: Accepted
date: 2026-07-24
owner: Chief Software Architect
parent: ADR-0002
---

# ADR-0002B Founder V4 Commerce Operating Architecture Freeze

## Status

Accepted

Subordinate to [ADR-0002 Edition Boundary](ADR-0002-edition-boundary.md) and continues the
governance chain started by
[ADR-0002A Experience Surface Preservation](ADR-0002A-experience-surface-preservation.md). This
is a freeze/governance decision about the Founder Operator Edition console's module architecture,
not an independent top-level architecture decision — it does not use one of the reserved ADR-0004
through ADR-0006 numbers (AI Advertisement Platform, Operator Cloud, Commercial Model
respectively).

---

## Context

Since ADR-0002 established the Founder Operator Edition as the upstream edition (`?mode=founder`,
`frontend/src/console/`), the console grew through four iterative rounds (V1 initial build,
V3 Agent Studio/Order Center consolidation, V4 business-closed-loop expansion adding Content/Live/
After-sales/Traffic Network centers, V4.1 Traffic Network, V4.2 Deliverables Center removal) without
a single point where the resulting navigation and module boundaries were formally recorded and
frozen. Each round made real architectural decisions (e.g., "Deliverable is a data model, not a
module"; "Token quota and advertising cash are separate ledgers") but only as inline code comments
and conversation history — not as a governed, referenceable decision.

During this V4.3 round, a Founder-issued correction identified that the After-sales Center, as
built in V4, did not cover the Founder's actual daily customer-service workload (product/order/
logistics enquiries, sales-conversion assistance) — only after-sales resolution. This required a
structural rename and expansion (After-sales Center → Customer Service Center, covering both
日常客服 and 售后客服) touching navigation, capabilities, module registry, and every cross-module
reference to the old center. A change of this kind — renaming/expanding a first-class module — is
exactly the sort of decision that should not happen again without a recorded rationale and a
freeze boundary preventing casual, undocumented module sprawl (e.g., an unreviewed "Campaign
Center" or a second Deliverables-Center-style generic repository).

---

## Problem

How should the Founder V4 console's navigation and module architecture be locked down so that:
1. Every existing module's role and boundary is recorded in one place, not scattered across
   conversation history and code comments.
2. Future additions or restructuring of first-class modules go through an explicit decision
   process instead of ad-hoc scope creep.
3. The specific, deliberate scope decisions already made this round (Customer Service Center
   correction, Deliverables Center staying removed, Campaign Center staying deferred) are
   preserved against accidental reversal.

---

## Options

### Option A

Leave the architecture implicit — continue relying on code structure and conversation history as
the record of what each module does and why Deliverables Center/Campaign Center are excluded.

Advantages:
- No documentation overhead.

Disadvantages:
- No single source of truth for module boundaries; every new contributor (or future session) has
  to reconstruct the reasoning from git history.
- Nothing prevents silent reintroduction of a retired module (Deliverables Center, standalone
  After-sales Center) or premature addition of a deferred one (Campaign Center).
- Repeats the exact problem ADR-0002A was written to solve for the prototype pages, but for the
  Founder console's own module set.

### Option B

Freeze the V4 navigation tree and module boundaries in a companion reference-architecture document
(following the repository's existing `docs/01-reference-architecture/architecture-freeze.md`
pattern), record this ADR as the formal decision, and require any future structural change to go
through a new ADR/unfreeze decision — the same ADR → Architecture Review → Architecture Approval →
Architecture Update chain already established for the backend Reference Architectures.

Advantages:
- One authoritative document (`founder-v4-architecture-freeze.md`) for every module's role,
  referenceable by future work.
- Matches existing repository governance convention exactly — no second documentation system
  invented.
- Makes deliberate scope exclusions (Campaign Center deferred to V5, Deliverables Center staying
  a data model rather than a module) explicit and hard to reverse accidentally.

Disadvantages:
- Adds a freeze/unfreeze step before any future first-class module can be added — slightly slower
  iteration if a genuinely needed module comes up before V5.

---

## Decision

Choose **Option B**.

### What is frozen

See [founder-v4-architecture-freeze.md](../01-reference-architecture/founder-v4-architecture-freeze.md)
for the full frozen navigation tree, per-module role table, and every module boundary. Summarized:

1. The 18-module, 5-group Founder V4 navigation tree (`frontend/src/console/nav/navConfig.js`) is
   frozen as final for V4.
2. Customer Service Center (客服中心) is the correct, final name and scope for the former
   After-sales Center — covering 日常客服 and 售后客服 as two business areas of one center, with
   after-sales case data, rules, and workflows preserved unchanged underneath.
3. Deliverable remains a backend data model, not a first-class module; Deliverables Center stays
   removed.
4. Campaign Center is deferred to V5 and is not part of V4.
5. AI Secretary, Approval Center, Replay Center, and Agent Studio each keep the specific,
   narrower boundary recorded in the freeze document (§8–§11) rather than expanding into general-
   purpose data browsers.

### Unfreeze mechanism

Any change to the frozen navigation tree, any restoration of a retired module, or any addition of
a new first-class module requires a new ADR proposing the specific change, followed by Architecture
Review and Architecture Approval, before implementation — mirroring the mechanism already declared
in `docs/01-reference-architecture/architecture-freeze.md` for the backend Reference
Architectures.

---

## Consequences

Positive:
- Every module's role has one authoritative, versioned record instead of living only in
  conversation history.
- The Customer Service Center correction, and the exclusions (Deliverables Center, Campaign
  Center), are now decisions with a recorded rationale, not just current code state.
- Future sessions/contributors can check the freeze document before proposing structural changes,
  reducing the risk of silently reintroducing a retired module or duplicating an existing one
  under a new name.

Negative:
- A genuinely justified new first-class module now requires an explicit unfreeze ADR before
  implementation, adding one governance step that did not exist before this round.

---

## Rules Introduced

1. No structural change to the Founder V4 navigation tree in
   `founder-v4-architecture-freeze.md` §1 may be made without a new ADR and an explicit unfreeze
   decision.
2. Deliverables Center (or any generically named replacement — Results Center, Asset Center,
   Output Center, Task Results Center) may not be reintroduced as a first-class module without a
   new ADR overriding this decision.
3. Campaign Center may not be added before V5, and its V5 introduction itself requires its own
   ADR at that time.
4. Any newly discovered or proposed module must be checked against the frozen module table before
   being added to `navConfig.js`.

---

## References

- ADR-0002 Edition Boundary (`docs/10-adr/ADR-0002-edition-boundary.md`) — parent decision.
- ADR-0002A Experience Surface Preservation — the analogous freeze/preservation mechanism this
  ADR follows, applied here to the Founder console's own module set instead of the prototype
  pages.
- ADR-0003 AI Token Economy — governs the Token/advertising-cash separation reflected in Token
  Center vs. Advertisement Center's boundary.
- `docs/01-reference-architecture/architecture-freeze.md` — the backend Reference Architecture
  freeze this ADR's unfreeze mechanism mirrors.
- `docs/01-reference-architecture/founder-v4-architecture-freeze.md` — companion freeze document,
  full frozen navigation tree and per-module boundary detail.
