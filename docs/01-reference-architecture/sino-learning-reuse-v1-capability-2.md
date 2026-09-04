# Sino Learning & Reuse V1 — Capability 2 Baseline

Status: **FROZEN CAPABILITY 2 BASELINE**

Capability: **Reusable Decision / Implementation Strategy Asset**

First Strategy: **anchored_overlay_choice**

Freeze Date: **2026-08-28**

Regression Gate: `./scripts/test-sino-learning-reuse-capability-2`

Capability 1 Baseline: `docs/01-reference-architecture/sino-learning-reuse-v1-capability-1.md`

Autonomous Execution Baseline: `docs/01-reference-architecture/sino-autonomous-execution-v1.md`

## 1. Purpose

Capability 2 allows Sino to reuse a verified historical decision, including why and when an
implementation strategy should be selected. It complements Capability 1: a Decision Strategy
answers **why/when to choose an approach**, while an Implementation Pattern answers **how to
implement the chosen approach**.

The reusable decision is structured and evidence-backed. It contains the decision question,
recommended strategy, rejected alternatives, selection and rejection conditions, constraints,
rationale, tradeoffs, implementation and verification implications, and source evidence. This
baseline freezes an implemented, regression-tested, and real-task-accepted contract.

## 2. Canonical Capability Chain

```text
Historical Verified Decision Evidence
→ Decision Extraction
→ Decision Strategy Candidate
→ Classification
→ Canonical Decision Strategy Asset
→ Fingerprint / Dedup
→ New Task Semantic Target Resolution
→ Decision Strategy Retrieval
→ Applicability Gate
→ Advisory Decision Context Injection
→ Planning Recommendation
→ Pattern Retrieval (when a compatible implementation pattern exists)
→ Frozen Autonomous Execution V1
→ Independent Verification
→ Decision Reuse Evidence
→ COMPLETED / 100%
```

Semantic target resolution always precedes decision retrieval. Historical strategy evidence advises
planning for an already resolved target; it never defines the target or its scope.

## 3. Supported Decision Asset

Capability 2 currently supports exactly:

- `asset_kind`: `decision_strategy`
- `strategy_type`: `interaction_surface_choice`
- `strategy_name`: `anchored_overlay_choice`
- recommended strategy: `anchored_popover`
- rejected alternatives: `drawer`, `modal`

No second strategy type is part of this frozen baseline.

## 4. anchored_overlay_choice Contract

Decision question: for a contextual, low-risk, compact action trigger, should the interaction use an
Anchored Popover, Drawer, or Modal?

### Selection conditions

- semantic target is resolved;
- risk is LOW;
- interaction is contextual to a visible trigger;
- action set is compact and supports quick open/close;
- no large editing workspace is required;
- no destructive or high-risk confirmation is required;
- no full-screen/mobile-sheet requirement exists;
- no explicit modal requirement or other invalidation condition applies.

### Rejected Drawer

- too heavy for compact contextual actions;
- consumes unnecessary workspace;
- introduces an unnecessary persistent panel.

### Rejected Modal

- too interruptive for low-risk contextual actions;
- creates an unnecessary decision barrier;
- breaks the current interaction flow.

### Invalidation conditions

- destructive or high-risk confirmation;
- explicit modal requirement;
- multi-step editing or large-workspace requirement;
- explicit full-screen/mobile-sheet requirement;
- incompatible accessibility requirement;
- unresolved semantic target.

## 5. Applicability Semantics

The gate returns one of:

- `APPLICABLE`: current context supplies sufficient decision factors and no rejection condition is
  present;
- `NOT_APPLICABLE`: an explicit rejection or invalidation condition is present;
- `UNCERTAIN`: target, interaction intent, risk, action-set size, workspace need, or interruption need
  is genuinely unresolved.

The Founder does not need to preselect or name Popover, Drawer, or Modal. Inferring the appropriate
surface from a clear goal and constraints is the purpose of this capability. Absence of a surface
name alone must never produce `UNCERTAIN`.

## 6. Advisory Authority

The following values are immutable Capability 2 safety contracts:

```text
decision_context.advisory = true
decision_context.scope_authority = false
decision_context.risk_authority = false
decision_context.approval_authority = false
decision_context.completion_authority = false
```

A Decision Strategy may recommend and explain a planning choice. It cannot expand write scope,
lower risk, approve a task, bypass Founder approval, skip tests/build/browser verification, or decide
completion.

## 7. Decision and Pattern Separation

The frozen ordering is:

```text
Current Goal
→ Semantic Target
→ Semantic Module
→ Decision Strategy Retrieval
→ Applicability
→ Recommended Interaction
→ Pattern Retrieval
→ Implementation
```

Decision is **what/why/when**; Pattern is **how**. The existence of an
`anchored_portal_popover` Pattern Asset cannot reverse this order or force an anchored popover
decision.

## 8. Source Lineage and Canonical Dedup

Decision Strategies retain decision asset ID, source conversation/message/task/execution IDs,
artifact and memory references, reliable source commits, and verification evidence. They must not
become unattributed “AI experience.”

A semantic fingerprint deduplicates the asset kind, strategy type/name, and normalized decision
conditions. Multiple historical tasks may strengthen one canonical active Strategy Asset by adding
source evidence; they must not create a duplicate asset per task.

## 9. Decision Reuse Evidence

Real reuse requires durable structured evidence containing:

- `decision_lookup_performed` and `decision_candidate_count`;
- `decision_asset_id`, `strategy_type`, and `strategy_name`;
- `applicability` and `decision_applied`;
- `recommended_strategy` and `rejected_strategies`;
- reason and source task/execution/message IDs;
- `injected_at` and `final_result`;
- all four authority flags.

LLM narration that says historical experience was considered is not reuse evidence.

## 10. Independent Verification and Completion Truth

An applied Decision Strategy transfers no execution evidence. Every new implementation task must
produce its own production patch, scope verification, targeted tests, build, diff check,
browser/artifact verification, and final reconcile evidence.

For an implementation task, missing production changes, empty test/build commands, or missing
visible-artifact evidence cannot result in `COMPLETED / 100%`. Decision Context cannot override the
Frozen Autonomous Execution V1 completion evidence gate. A legal no-op requires explicit
`preexisting_acceptance_verified = true` evidence.

## 11. Regression Constitution

- **DR1 — Evidence-backed extraction.** A Decision Strategy comes from structured historical
  decision/correction evidence, never an LLM's improvised rationale.
- **DR2 — Target before retrieval.** Semantic target resolution precedes Decision Retrieval.
- **DR3 — No preselected answer required.** Sufficient context can be `APPLICABLE` without the
  Founder naming a surface.
- **DR4 — Applicability gate.** Every candidate receives `APPLICABLE`, `NOT_APPLICABLE`, or
  `UNCERTAIN`; only `APPLICABLE` may be injected.
- **DR5 — No authority.** Decision Context has no scope, risk, approval, or completion authority.
- **DR6 — Decision/pattern separation.** Decision is why/when; Pattern is how, and Pattern cannot
  decide the interaction strategy.
- **DR7 — Durable reuse evidence.** Lookup, candidate, applicability, lineage, recommendation,
  application, and authority evidence is persisted.
- **DR8 — Independent verification.** A reused task generates all current-task implementation and
  verification evidence.
- **DR9 — No false completion.** Decision Context cannot bypass production, scope, test, build,
  diff, browser/artifact, or final-reconcile evidence gates.

## 12. First Canonical Decision Asset

- `decision_asset_id`: `reuse-asset-270ceb8705834979b07e`
- `asset_kind`: `decision_strategy`
- `strategy_type`: `interaction_surface_choice`
- `strategy_name`: `anchored_overlay_choice`
- recommended: `anchored_popover`
- rejected: `drawer`, `modal`
- status: `active`
- confidence: `1.0`
- fingerprint: `67e6dac9ff65b5f3e9ebd007960a7980b313e8f338c2c4f064cf6c40e598af4a`
- canonical active count: `1`

Primary source lineage:

- conversation: `conv-a3d0396a08c944699780`
- message IDs: `message-client-6ac02182f8052757c824`,
  `message-client-f9e8877391c642d5b7b6`, `message-client-3765734b7d5960f1a6f9`,
  `message-client-5eb9748453088f023b2c`
- task: `task-asset-msg-93816cdf6f6976a3`
- execution: `execution-fd973a9a99e14348`
- artifact: `artifact-c18250d7b40a4155a77a`
- memories: `memory-b544ba6c5296483e99e9`, `memory-8663ce237be3448abe63`
- source commit: `4dd265147ea62c2b41586d9aa95fd3b955f4ffa4`
- source verification: `PASS`

## 13. Accepted Real Task C

Task C changed the visible “新建讨论” trigger so it first offers “开始空白讨论” and “在当前项目中开始讨论.” The Founder did not preselect Popover, Drawer, or Modal.

- task: `task-asset-msg-03909f6a04f957a9`
- execution: `execution-c5f8f380867548f1`
- canonical Execution count: `1`
- business checkpoint: `5702887 feat(founder): add new discussion choice popover`
- lookup performed: `true`; candidate count: `1`
- selected asset: `reuse-asset-270ceb8705834979b07e`
- applicability: `APPLICABLE`; applied: `true`
- recommendation: `anchored_popover`; rejected: `drawer`, `modal`
- scope/risk/approval/completion authority: all `false`

Independent acceptance evidence:

- non-empty task-owned production patch;
- semantic scope `PASS`, source `semantic_module`, confidence `HIGH`;
- targeted frontend test command executed with `30 passed`;
- production build `PASS` and diff check `PASS`;
- System Chrome + Playwright `PASS`;
- visible trigger and surface, recommended surface match, fixed `document.body` portal, arrow,
  anchored geometry, and no sidebar clipping all passed;
- both discussion choices, outside-click, Escape, toggle close, Draft behavior, current-project
  context, and no persistent Conversation before first valid send all passed;
- final Task and Execution `COMPLETED`, canonical stage `COMPLETED`, progress `100%`.

Capability 1 Pattern Reuse did **not** produce applied Pattern evidence in Task C. Pattern reuse was
not required for Capability 2 acceptance and no evidence was manually fabricated.

## 14. Runtime Integrity Acceptance History

Task C exposed and validated general Runtime Integrity behavior; these are dependencies, not
Capability 2-specific state-machine changes:

- `0aa627d fix: enforce real completion evidence for Sino tasks`;
- `b73ff11 fix: add safe false-completion recovery`;
- `54f2ee0 fix: improve decision applicability and css scope attribution`;
- `5702887 feat(founder): add new discussion choice popover`.

The original erroneous completion event was preserved. Recovery appended
`completion_invalidated → execution_reopened`, retained the same task and execution IDs, and resumed
from an evidence-derived stage. This is general Runtime Integrity and does not alter the frozen
normal execution chain.

## 15. Non-Goals

Capability 2 does not include enterprise strategy assets, high-risk business or financial
decisions, automatic Founder approval, production architecture decisions, multi-strategy conflict
resolution, LLM strategy voting, vector databases, cross-industry decision graphs, a Capability
Marketplace, Capability 3, or changes to the Frozen risk boundary.

These non-goals do not block this baseline.

## 16. Change Policy

Bug fixes, regression fixes, internal refactors, and additional source evidence are allowed when the
Capability 2, Capability 1, and Autonomous Execution V1 regression gates remain green.

Changes that grant Decision Context authority, alter core applicability semantics, let Pattern
assets decide a Decision, remove lineage or canonical dedup, waive independent verification, or
bypass the completion evidence gate require an explicit Capability 2.1 or later-version contract
with migration and compatibility impact. They must not silently change this baseline.

Capability 2 remains a planning advisory layer. It does not modify the frozen Autonomous Execution
V1 canonical state machine, completion semantics, semantic-scope principle, or risk boundary, and it
does not modify the Capability 1 frozen contract.
