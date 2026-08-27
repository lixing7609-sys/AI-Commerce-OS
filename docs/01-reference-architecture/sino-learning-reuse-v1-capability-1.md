# Sino Learning & Reuse V1 — Capability 1 Baseline

Status: **FROZEN CAPABILITY 1 BASELINE**

Capability: **Reusable UI Interaction Pattern Asset**

Pattern: **anchored_portal_popover**

Freeze Date: **2026-08-27**

Regression Gate: `./scripts/test-sino-learning-reuse-capability-1`

Autonomous Execution Baseline: `docs/01-reference-architecture/sino-autonomous-execution-v1.md`

## 1. Purpose

Capability 1 allows Sino to extract a structured UI interaction pattern from a completed and
verified production task, retrieve that pattern for a later compatible task, inject advisory
guidance, and persist proof that reuse occurred. Its purpose is to ensure that a previously solved
interaction is not analyzed from zero while preserving the current task's independent scope, risk,
execution, and verification authority.

This baseline freezes an implemented and acceptance-tested contract. It is not a roadmap or a
general knowledge-system design.

## 2. Canonical Capability Chain

```text
COMPLETED Task
+ Verification PASS
+ Production Implementation Evidence
→ Learning Extraction
→ Reusable Candidate
→ Reusable Asset Classification
→ Fingerprint / Canonical Dedup
→ Reusable Asset Persistence
→ Semantic Index
→ New Task Semantic Target Resolution
→ Reuse Lookup
→ Compatibility Gate
→ Advisory reuse_context Injection
→ Normal Frozen Autonomous Execution V1
→ Reuse Evidence Persistence
→ New Task COMPLETED / 100%
```

Semantic target resolution always precedes reuse lookup. Historical assets advise an already
resolved target; they never define the target or its write scope.

## 3. Asset, Memory, and Evidence Boundaries

- **Execution Evidence** records what happened in one execution.
- **Memory** retains long-lived knowledge, decisions, or context.
- **Reusable Asset** is a structured, actively retrievable capability pattern for a future task.

These are different records with different authority. `anchored_portal_popover` is a Reusable Asset,
not a free-text memory and not merely an execution log.

## 4. Supported Asset Contract

Capability 1 supports exactly:

- `asset_kind`: `ui_interaction_pattern`
- `pattern_type`: `anchored_portal_popover`

No second pattern type is part of this frozen baseline.

### Implementation pattern

- Keep the trigger in its source layout.
- Portal the overlay to `document.body`.
- Use fixed positioning derived from the visible trigger/anchor rectangle.
- Preserve arrow/pointer and overlay z-index behavior.
- Support outside-click, Escape, and trigger-toggle close.
- Reposition on viewport resize and scroll.
- Preserve `aria-expanded` and dialog/menu semantics.

The asset is implementation guidance, not a component-copy or code-clone asset.

### Verification pattern

- Sample the active visible trigger before clicking.
- Verify popover visibility and `document.body` portal ownership.
- Verify fixed positioning, arrow visibility, and anchor geometry.
- Verify expected container style and preserved business controls.
- Verify outside-click, Escape, and toggle close.
- Capture computed styles when the acceptance contract requires them.

### Reuse conditions

- The target is a compact action, menu, or popover interaction.
- An anchored overlay is semantically appropriate.
- The current semantic target is already resolved with HIGH confidence.
- The current accessibility contract remains compatible.

### Invalidation conditions

- The target explicitly requires a modal/dialog or full-screen sheet.
- The reference interaction requires a non-anchored layout.
- The target interaction or accessibility requirements are incompatible.
- The semantic domain is unsupported.
- Destructive UX requires modal confirmation.

## 5. Learning Eligibility

Reusable learning extraction requires all of:

- Task status `COMPLETED`;
- Verification status `PASS`;
- a production implementation artifact;
- HIGH-confidence semantic scope and source lineage.

Failed, blocked, or verification-failed tasks are ineligible. A test-, spec-, documentation-, or
Markdown-only patch cannot produce a reusable UI interaction pattern.

Learning is post-completion. Extraction failure must not reverse an already completed Autonomous
Execution V1 task into `BLOCKED` or `FAILED`.

## 6. Persistence, Deduplication, and Lineage

A stable fingerprint is derived from asset kind, pattern type, semantic module, implementation and
verification patterns, reuse conditions, and invalidation conditions. One fingerprint preferentially
maps to one canonical active Reusable Asset. Repeated extraction updates source evidence rather than
creating unlimited duplicates.

Every asset remains traceable through:

- `reuse_asset_id`;
- `source_task_id`;
- `source_execution_id`;
- `source_artifact_id`, when present;
- `source_memory_ids`, when present;
- reliable source commit SHA in source evidence;
- verification/source evidence;
- `created_at` and `updated_at`;
- status, fingerprint, and optional `superseded_by`.

## 7. Retrieval and Compatibility

Retrieval order is frozen:

```text
Current Goal → Semantic Target → Semantic Module → Reuse Lookup
```

The deterministic index considers active status, semantic-module match, compatible pattern/keyword
signals, confidence, and recency. Capability 1 does not require a vector database.

Every candidate passes a compatibility gate with one of:

- `PASS`: advisory injection is allowed;
- `REJECT`: the asset is not applied;
- `UNCERTAIN`: the asset is not automatically applied as execution guidance.

## 8. Advisory Authority

The following values are immutable Capability 1 safety contracts:

```text
reuse_context.advisory = true
reuse_context.scope_authority = false
reuse_context.risk_authority = false
reuse_context.completion_authority = false
```

Reuse may provide implementation guidance, verification guidance, test-pattern guidance,
constraints, compatibility evidence, and source lineage. It cannot:

- expand current allowed modules or write scope;
- change task risk or bypass Founder approval;
- skip scope verification, targeted tests, build, diff check, or browser/artifact verification;
- decide task completion.

The current semantic scope always outranks historical reuse context.

## 9. Reuse Evidence

Real reuse is proven by durable structured evidence, not by LLM narration. Evidence includes:

- `reuse_lookup_performed`;
- `reuse_candidate_count`;
- `reuse_asset_id`;
- `source_task_id` and `source_execution_id` in the injected context;
- `reuse_compatibility`;
- `reuse_applied`;
- `reuse_rejected_reason`;
- `injected_at`;
- `final_result`.

## 10. Independent Verification

An applied asset never transfers completion evidence. Every new task follows the frozen Autonomous
Execution V1 chain and produces its own scope, targeted-test, build, diff-check, browser/artifact,
and final-reconcile evidence.

## 11. Regression Constitution

- **LR1 — Verified production eligibility.** Only successfully verified production tasks generate a
  Reusable Asset.
- **LR2 — Structured lineage.** A Reusable Asset is structured and traceable to source Task,
  Execution, artifact/memory references, commit evidence, and verification evidence where present.
- **LR3 — Canonical dedup.** Repeated extraction of the same fingerprint reuses one canonical active
  asset and may add source evidence.
- **LR4 — Target before retrieval.** Semantic target resolution precedes reuse lookup.
- **LR5 — Compatibility gate.** Only `PASS` candidates may be automatically applied; `REJECT` and
  `UNCERTAIN` are not execution guidance.
- **LR6 — No authority expansion.** Reuse cannot expand scope, risk, approval, verification, or
  completion authority.
- **LR7 — Durable evidence.** Reuse must leave structured retrieval, lineage, compatibility,
  application, and injection evidence.
- **LR8 — Independent verification.** A reused task must generate its own complete verification
  evidence.

## 12. Accepted Real Scenario

Source:

- Task: Conversation More Actions Popover
- `source_task_id`: `task-asset-msg-50c5b0e1ada6582f`
- `source_execution_id`: `execution-3535c88b193c4f82`
- source commit: `53d2109`

Extracted asset:

- `reuse_asset_id`: `reuse-asset-0e16b542bb464d9a93e3`
- `asset_kind`: `ui_interaction_pattern`
- `pattern_type`: `anchored_portal_popover`
- status: `active`
- confidence: `1.0`

Reuse target:

- Task B: Conversation Composer Project Selector Popover
- lookup performed with at least one candidate;
- the canonical asset was selected with compatibility `PASS` and `reuse_applied = true`;
- all three authority flags remained `false` and semantic scope did not expand;
- Task B independently passed tests, build, diff check, and System Chrome verification;
- Task B finished `COMPLETED / 100%` with one canonical Execution.

Accepted checkpoints:

- Business: `4e80d91 fix: anchor conversation project popover`
- Verification/reconcile infrastructure: `c61efe3 fix: complete reusable project selector verification`

## 13. Non-Goals

Capability 1 does not include a general knowledge graph, embedding ranking, vector database,
multi-industry capabilities, Prompt/Skill/Agent assets, business-strategy patterns, automatic
long-term-memory summarization, complex cross-project transfer, automatic supersede reasoning,
multi-version pattern merging, an asset marketplace, or Capability 2.

These non-goals do not block this baseline.

## 14. Change Policy

Bug fixes, regression fixes, internal refactors, and additional source evidence are allowed when all
Capability 1 and Frozen Autonomous Execution V1 regression gates remain green.

Changes to reuse authority, scope non-expansion, independent verification, compatibility semantics,
source lineage, canonical dedup, or the meaning of `ui_interaction_pattern` require an explicit
Capability 1.1 or later-version contract with compatibility impact. They must not silently change this
baseline.

Capability 1 is a post-completion and planning advisory layer. It does not modify the Frozen Sino
Autonomous Execution V1 canonical execution state, completion semantics, or risk boundary.
