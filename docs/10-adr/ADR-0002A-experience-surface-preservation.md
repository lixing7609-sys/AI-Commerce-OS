---
document_id: ADR-0002A
title: Experience Surface Preservation
status: Accepted
date: 2026-07-22
owner: Chief Software Architect
parent: ADR-0002
---

# ADR-0002A Experience Surface Preservation

## Status

Accepted

Subordinate to [ADR-0002 Edition Boundary](ADR-0002-edition-boundary.md) — this is a
migration/governance extension of that decision, not an independent top-level architecture
decision. ADR numbers ADR-0003 through ADR-0006 are already reserved (Token Economy, AI
Advertisement Platform, Operator Cloud, Commercial Model respectively) and are not used here.

---

## Context

ADR-0002 established the Developer/Operator/Device Admin/Operator Cloud Edition boundary and
began enforcing it in the backend. While doing that work, a live inspection of the running
frontend (`npm run dev`, both `http://localhost:5173/` and
`http://localhost:5173/?mode=operator-preview`) found something the original ADR-0002 inventory
under-weighted: the existing frontend pages are not disposable scaffolding sitting in the way of
"real" Edition work. They are:

1. Product experience prototypes.
2. Research environments for the owner/operator workflow.
3. References for the formal Operator Edition's information architecture.
4. Migration candidates for the future production application.

The `operator-preview/` prototype in particular (6 pages, business-language throughout, real
approve/reject/require-more-info actions on AI recommendations, a mature business-memory/rules
system) represents substantial, considered product thinking that predates and informs ADR-0002 —
not a throwaway spike. Deleting, renaming, or rewriting any of this without first understanding
and recording what it does would destroy design work and research value that has not been
captured anywhere else.

At the same time, neither the current root page (`App.jsx`) nor `operator-preview/` should be
mistaken for settled production architecture merely because they happen to be what's currently
reachable — `App.jsx` is the default only because it's what bootstrapping order put there first,
and `operator-preview/` is explicitly labeled a prototype by its own in-app banner.

---

## Problem

How should in-progress prototype/research frontend surfaces be protected from casual
deletion/rewrite while Edition Boundary work (ADR-0002) proceeds, without freezing them in place
forever or mistaking their current form for the finished Operator Edition?

---

## Options

### Option A

Treat existing prototype pages as disposable. Delete or rewrite them freely as formal Edition
routes are built, on the reasoning that they were never meant to ship.

Advantages:
- Less code to carry forward; no governance overhead.

Disadvantages:
- Destroys product/IA research value with no record of what was learned.
- No comparison baseline when building the real Operator Edition — every graduation decision
  becomes a guess instead of a measured choice.
- Contradicts the fact that `operator-preview/` already demonstrates working solutions to
  exactly the problems ADR-0002 is trying to solve (business language, approve/reject actions,
  shop-scoped context).

### Option B

Formally preserve existing experience surfaces during the migration period: document every page's
role before any destructive change, require a compared and reviewed replacement before retiring
anything, and make the distinction between "exploring a prototype" and "validating a formal
Edition" an explicit, separate concept in the frontend rather than an implicit side effect of
which query parameter happens to be set.

Advantages:
- Nothing of value is lost silently.
- Every graduation decision (prototype → formal Edition) is made with an actual side-by-side
  comparison, not from memory or assumption.
- Matches Customer First Architecture: the existing operator-preview prototype is closer to what
  a non-technical operator needs than the developer app is, and that should inform the real
  Operator Edition rather than be discarded and rebuilt from scratch.

Disadvantages:
- Slower short-term cleanup — prototype code stays in the tree for longer.
- Requires an explicit companion inventory document to stay useful (see
  [ADR-0002A-experience-surface-inventory.md](ADR-0002A-experience-surface-inventory.md)).

---

## Decision

Choose **Option B**.

### Preservation Policy

1. Existing experience pages — every page reachable via `http://localhost:5173/` and
   `http://localhost:5173/?mode=operator-preview`, plus any additional routes discovered during
   inspection — are not disposable temporary code.
2. Every page's route, title, purpose, dependencies, data source, maturity, and current problems
   must be documented (done in the companion inventory) before any structural change is made to
   frontend routing.
3. Every page is classified as one of: retain unchanged for research; graduate into Operator
   Edition; refactor into shared components; keep as developer-only prototype; supersede after
   replacement; undecided.
4. No existing experience page may be deleted, renamed, relocated, or rewritten until: its role
   has been documented; its replacement route exists; the replacement has been compared with the
   original; the owner has had an opportunity to experience and review it.
5. Localhost-accessible research routes are preserved throughout the migration period — they must
   keep working, not be casually broken as a side effect of unrelated Edition work.
6. The current root page (`App.jsx`) and the `operator-preview/` pages are not to be treated as
   production architecture merely because they currently exist and are reachable.
7. They are also not to be discarded merely because they are prototypes — see the Module
   Ownership reasoning in the inventory for what specifically is worth graduating versus retiring.
8. Formal Edition routes (ADR-0002's `getActiveEdition()`/`EDITION` mechanism) are introduced
   *alongside* existing research routes first, and migrated deliberately — never as a silent
   replacement.

### Two Entry Modes (reserved design — not implemented this round)

Going forward, the frontend build and route system must make an explicit distinction between:

- **A. Research / Prototype Entry** — used for product exploration and comparison of existing
  pages (today's `App.jsx` and `operator-preview/` reached however they're reached).
- **B. Formal Edition Entry** — used to validate the actual Developer/Operator/Device Admin
  boundary established by ADR-0002 (`editionConfig.js`'s `getActiveEdition()`, `main.jsx`'s
  `renderForEdition()`).

These are recorded here as a reserved architectural intent. **No code implementing this split
exists yet** — `main.jsx`, `editionConfig.js`, routing, and every page remain exactly as they
were before this ADR. Today the two concerns are still entangled: the legacy
`?mode=operator-preview` query parameter is, in the working tree, the same signal
`getActiveEdition()` reads to decide the *formal* Operator Edition — an ad-hoc condition, not an
explicit mode. Untangling this into two named, separate mechanisms is deliberately deferred to a
follow-up round, gated on a decision about whether `operator-preview/` (currently uncommitted)
should be committed first so the mechanism can be verified self-contained the same way the
ADR-0002 backend work was (see the post-commit audit referenced in ADR-0002's git history).

---

## Consequences

Positive:
- The inventory becomes the record of what already works, what's business-language-ready, and
  what specifically still leaks developer concepts — informing ADR-0002's Migration Plan Phase 1
  with evidence instead of assumption.
- No prototype work is lost while Edition Boundary implementation continues.

Negative:
- Two parallel frontend surfaces (developer app, operator-preview) continue to coexist longer
  than a "just replace it" approach would allow.
- Contributors must consult the inventory's classification before touching an existing page,
  adding a small amount of process overhead.

---

## Rules Introduced

1. No experience page listed in the companion inventory may be deleted, renamed, relocated, or
   rewritten without first satisfying Preservation Policy rule 4 (documented role + replacement
   route + comparison + owner review).
2. Any newly discovered frontend route must be added to the inventory before it is modified.
3. The Research Entry / Formal Edition Entry split, once built, must be an explicit, named
   mechanism in code — never an implicit side effect of an unrelated query parameter or
   environment variable.
4. Graduating a prototype page into a formal Edition route does not delete the prototype; it adds
   a new, separately reachable formal route and updates the inventory's classification once
   compared and reviewed.

---

## Commercial Architecture Impact — Reserved, Not Yet Implemented

The future formal Operator Edition, once graduated from these prototypes, is expected to add
commercial-layer surfaces that do not exist anywhere in this repository today:

- **Ads Center** — advertising campaign management across platforms.
- **AI Account / Token Center** — the operator's AI usage/credit account.
- **Separate Token balance and advertising cash balance** — these are distinct ledgers, not one
  combined balance.
- **Operator Cloud control surfaces** — the platform-operator-facing management layer (customers,
  devices, licenses, billing) described in ADR-0002's Edition definitions but not built anywhere
  in this repository.

This document does **not** design or invent any implementation detail for these. They are
explicitly linked to their own reserved architecture decisions:

- **ADR-0003** — AI Token Economy.
- **ADR-0004** — AI Advertisement Platform.
- **ADR-0005** — Operator Cloud.
- **ADR-0006** — Commercial Model.

Nothing in the current prototype inventory (companion document) currently implements any of the
above — confirmed during the live crawl, not assumed. Where a prototype page hints at a future
need for one of these (e.g. operator-preview's Dashboard shows per-shop sales but no advertising
spend or Token consumption anywhere), the inventory notes it as a gap for the relevant future ADR
to address, not something to build here.

---

## References

- ADR-0002 Edition Boundary (`docs/10-adr/ADR-0002-edition-boundary.md`) — parent decision.
- ADR-0002-edition-inventory.md — prior module-ownership inventory this extends.
- ADR-0002A-experience-surface-inventory.md — companion document, full page-by-page inventory
  grounded in a live crawl of the running dev server.
