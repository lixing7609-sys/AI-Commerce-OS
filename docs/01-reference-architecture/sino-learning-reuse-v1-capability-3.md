# Sino Learning & Reuse V1 — Capability 3 Baseline

Status: **FROZEN CAPABILITY 3 BASELINE**

Capability: **Reusable Execution Playbook**

First Playbook Type: **ui_interaction_change**

Freeze Date: **2026-08-29**

Baseline Source HEAD: **5ca6db7 fix: finalize capability 3 runtime evidence**

Acceptance Task: **task-asset-msg-5197c4d020b370d2**

Acceptance Execution: **execution-ac1380b4d75c4641**

Regression Gate: `./scripts/test-sino-learning-reuse-capability-3`

Cross-Module Extension Gate: `./scripts/test-sino-learning-reuse-cross-module`

Capability 1.1 dependency:
`docs/01-reference-architecture/sino-learning-reuse-capability-1.1-cross-module-compatibility.md`

Capability 2.1 dependency:
`docs/01-reference-architecture/sino-learning-reuse-capability-2.1-cross-module-applicability.md`

## 1. Purpose and Definition

Capability 3 lets Sino compose validated historical knowledge with the authority and requirements of
the current Task. After the current semantic target, scope, risk, explicit Founder constraints, and
acceptance criteria are established, Sino combines an applicable Decision Strategy, a compatible
Implementation Pattern, current constraints, verification guidance, required evidence, and source
lineage into a **Task-specific Structured Execution Playbook**.

The Playbook is advisory planning context injected into Frozen Autonomous Execution V1. Its core
capability is **composition**, not creation of a third ordinary Reusable Asset.

## 2. Capability Layering

- Capability 1 — Pattern Reuse: **How to implement?**
- Capability 2 — Decision Strategy Reuse: **Why/when should this approach be selected?**
- Capability 3 — Execution Playbook Composition: **How should the current Task combine validated
  historical knowledge, current constraints, and verification requirements into one executable
  planning context?**

The frozen separation is:

```text
Decision = Why / When
Pattern = How
Playbook = Compose for Current Task
```

## 3. Canonical Chain

```text
Current Task Goal
→ Semantic Target Resolution
→ Semantic Scope
→ Current Risk
→ Founder Current Explicit Constraints
→ Current Acceptance Criteria
→ Decision Strategy Retrieval
→ Decision Applicability
→ Recommended Strategy
→ Pattern Retrieval
→ Pattern Compatibility
→ Constraint Merge
→ Verification Guidance Merge
→ Playbook Composition
→ Playbook Safety Gate
→ Advisory Task Package Injection
→ Founder Confirmation (when required by the Frozen Risk Contract)
→ Frozen Autonomous Execution V1
→ Independent Verification
→ Durable Playbook Evidence Finalization
→ COMPLETED / 100%
```

## 4. Current Task Authority

**Current Task Authority > Historical Reuse.** Historical Decision, Pattern, and Playbook guidance
cannot define current scope or risk, override an explicit current Founder constraint, delete current
acceptance criteria, or weaken required verification.

## 5. Supported Playbook Type and Persistence Policy

The only frozen V1 type is `ui_interaction_change`. No second `playbook_type` belongs to this
baseline.

The persistence policy is:

```text
Dynamic Playbook Composition
+ Durable Composition Evidence
+ Durable Finalization Evidence
```

A Playbook is a dynamic, Task-specific planning object. It is not `asset_kind = playbook`, does not
use a `ReusablePlaybookDB`, and is not inserted into the canonical Reusable Asset index. Completion
does not automatically promote a Playbook or strengthen its Decision or Pattern inputs.

## 6. playbook_context Contract

The structured context contains at least:

- `playbook_id`, `playbook_type`, `composed`, `applied`, and `task_id`;
- `semantic_target`, `semantic_module`, and `recommended_strategy`;
- `decision_asset_ids` and `pattern_asset_ids`;
- `authoritative_constraints` and `advisory_constraints`;
- `rejected_assets`, `rejected_reasons`, and conflict evidence;
- `implementation_guidance`, `verification_guidance`, and `required_evidence`;
- `compatibility`, `safety_gate`, `safety_checks`, and `composition_reason`;
- `composition_fingerprint` and `source_lineage`;
- all five authority flags;
- `created_at` and `runtime_revision`.

It is injected as a structured Task Package child object, not flattened into untraceable prompt text.

## 7. Authority Model

The following values are immutable:

```text
playbook_context.scope_authority = false
playbook_context.risk_authority = false
playbook_context.approval_authority = false
playbook_context.completion_authority = false
playbook_context.verification_override_authority = false
```

A Playbook may combine, recommend, explain, and add or refine verification guidance. It cannot
expand scope, lower risk, approve a Task, decide completion, or delete required verification.

## 8. Constraint Classification and Priority

Authoritative constraints include the Frozen System/Risk Contract, current explicit Founder
constraints, current semantic scope, current acceptance criteria, and the current risk boundary.
Advisory constraints include Decision Strategy guidance, Pattern guidance, and historical
implementation preferences.

The frozen priority is:

1. P1 — Frozen System / Risk Contract
2. P2 — Founder Current Explicit Constraint
3. P3 — Current Semantic Scope
4. P4 — Current Acceptance Criteria
5. P5 — Current Task Risk
6. P6 — Applicable Decision Strategy
7. P7 — Compatible Pattern Guidance

Authoritative overrides advisory; current overrides historical.

Constraint merge is deterministic: deduplication, priority ordering, source aggregation, and
conflict detection are required. An advisory conflict preserves the authoritative constraint and
rejects the conflicting historical guidance.

## 9. Conflict and Rejected-Asset Evidence

A conflict records at least `conflict_detected`, `conflicting_asset_id`, `conflict_type`,
`authoritative_constraint`, `historical_guidance`, `resolution`, and `rejected_reason`.

Each rejected asset records at least `asset_id`, `asset_kind`, `reason`, `stage`, and `source`.
Rejection must not be hidden in logs or replaced by LLM narration.

## 10. Decision-to-Pattern Order

```text
Semantic Target
→ Decision Retrieval
→ Decision Applicability
→ Recommended Strategy
→ Pattern Retrieval
→ Pattern Compatibility
```

Pattern cannot reverse this chain or decide the interaction strategy merely because a Pattern Asset
exists.

## 11. Cross-Module Reuse Dependency and Safety

Capability 3 depends on Capability 1.1 and Capability 2.1. Their shared semantic rule is:

```text
Asset Provenance ≠ Asset Applicability ≠ Current Task Scope
```

`semantic_module` represents source provenance. An exact source-module match is a ranking signal,
not a hard compatibility boundary.

Cross-module reuse requires `scope_before == scope_after` and `source_file_leakage = false`.
Historical source files cannot enter current Relevant Files, Allowed Files, or Write Scope. Leakage
rejects reuse and the Playbook Safety Gate.

The Capability 3 Gate runs direct cross-module composition and leakage contracts and invokes the
Cross-Module Gate in extension-only mode. The independent full Cross-Module Gate retains its full
behavior. This prevents the recursive chain Capability 3 → Cross-Module full → Capability 3.

## 12. Verification Guidance Merge

Verification has three sources:

- A — Frozen V1 required verification;
- B — current Task acceptance verification;
- C — historical Decision, Pattern, and Playbook guidance.

A and B cannot be removed. C may only add or refine; it cannot weaken A or B or make Browser
Verification optional.

## 13. Visible Artifact Contract Refinement

Current Task Authority first creates a Base Visible Artifact Contract during semantic scope
resolution. After Playbook composition:

```text
Base Visible Artifact Contract
+ Current Acceptance Criteria
+ Playbook Verification Guidance
→ Refined Visible Artifact Contract
```

Refinement is deterministic, evidence-backed, additive, deduplicated, and non-weakening. It records
the base contract, whether Playbook guidance was applied, added and deduplicated items, required
evidence before and after, `verification_weakened = false`, refinement time, and runtime revision.
The Playbook retains `verification_override_authority = false`.

## 14. Playbook Safety Gate

The gate returns `PASS`, `REJECT`, or `UNCERTAIN`. It checks at least:

- semantic target preserved;
- semantic scope unchanged;
- risk not lowered and approval boundary unchanged;
- Decision applicability and Pattern compatibility valid;
- no authoritative constraint conflict;
- required verification and completion requirements not weakened;
- no recursive lineage cycle;
- historical source-file leakage absent.

Only `PASS` permits `playbook_applied = true`. `UNCERTAIN` is never coerced to `PASS` merely to
continue execution.

## 15. Stable Identity, Fingerprint, and Idempotency

`playbook_id` is deterministically derived from `task_id + composition_fingerprint`. The fingerprint
includes the Task ID, semantic target, semantic-scope fingerprint, risk, explicit Founder constraint
fingerprint, Decision Asset IDs/versions, Pattern Asset IDs/versions, and required-verification
fingerprint. Timestamp and random values are not fingerprint inputs.

Unchanged Planning, Retry, and Resume reuse the same Playbook identity and do not append unlimited
canonical composition evidence. Repeated finalization of the same Task, Playbook, and Execution is
idempotent and returns `ALREADY_FINALIZED`.

## 16. Cycle Guard

The first-phase deterministic guard uses visited lineage IDs and maximum lineage depth `8`.
Recursive lineage or excessive depth causes `REJECT` and persists rejected evidence.

## 17. Durable Composition Evidence

Planning evidence contains at least composition/application booleans, Playbook identity/type,
fingerprint, Decision and Pattern references, authoritative/advisory constraint counts, rejected
assets and reasons, compatibility, safety gate, authority flags, source lineage references, and
injection time.

Before current-task verification finishes, truthful values are:

```text
final_result = planning_injected
verification_result = pending_current_task_verification
```

## 18. Durable Evidence Finalization

Canonical Runtime truth finalizes the existing Playbook evidence after a real terminal result. It
adds at least:

- `execution_id`, `final_result`, `verification_result`, and `finalized_at`;
- final Task status, Execution status, canonical stage, and progress;
- Browser, scope, tests, build, and diff results.

Finalization is driven only by canonical Task/Execution state, execution events, post-implementation
evidence, and final reconcile evidence. LLM or Conversation narration cannot finalize it. Failure,
block, or cancellation must also be recorded truthfully rather than left pending.

## 19. Late Verification and Same-Execution Resume

When implementation, scope, tests, build, and diff have real durable PASS evidence but Browser
Verification is missing, the same `task_id` and `execution_id` may resume from `UI_VERIFYING`.
Completion then finalizes the original `playbook_id` and fingerprint. It cannot rerun implementation,
create a second Execution, or create a second Playbook.

## 20. Independent Verification

`playbook_applied = true` transfers no completion evidence. Every new Task still independently
requires a non-empty production implementation when implementation is required, scope verification,
real targeted-test and build commands, diff check, Browser/artifact verification, and final
reconcile under Frozen Autonomous Execution V1.

## 21. Generic Visible Artifact and Truthful Boundaries

The first accepted generic artifact type is `founder_conversation_file_actions`. Its contract is
derived from current semantic target, interaction intent, acceptance criteria, and additive Playbook
verification refinement—not a Task, Conversation, or Execution ID hardcode.

For “上传文件,” the truthful accepted boundary is `filechooser_opened = true` and
`file_selected = false`; upload success must not be fabricated. For “选择已有文档,” a truthful
reserved/unavailable boundary is permitted when the full selector is not connected; document data
or selection must not be fabricated.

The verifier samples the visible active target, never a hidden/stale duplicate. Conversation input
preservation uses before/during/after bounding boxes with a reasonable pixel tolerance.

## 22. Regression Constitution

- **PB1 — Current authority first.** Current Task authority always precedes historical reuse.
- **PB2 — Decision/Pattern separation.** Decision determines why/when; Pattern determines how.
- **PB3 — Structured composition.** Playbook composition is structured and evidence-backed.
- **PB4 — No authority expansion.** Playbook cannot gain scope, risk, approval, completion, or
  verification-override authority.
- **PB5 — Authoritative wins.** Authoritative constraints override advisory historical guidance.
- **PB6 — Verification non-weakening.** Playbook cannot weaken required verification.
- **PB7 — Rejection evidence.** Rejected assets and reasons are recorded.
- **PB8 — Durable lifecycle evidence.** Applied Playbooks leave durable composition evidence, and
  final Runtime outcomes finalize that same evidence.
- **PB9 — Independent verification.** A new Task independently completes Frozen V1 verification.
- **PB10 — Deterministic cycle safety.** Playbook composition prevents recursive lineage with a
  deterministic cycle guard.

## 23. PB1–PB10 Coverage Map

- PB1: `test_constraint_priority_is_current_authority_before_history`,
  `test_playbook_preserves_scope_risk_and_all_authorities_are_false`.
- PB2: `test_decision_recommendation_enables_pattern_without_surface_name`,
  `test_pattern_cannot_decide_interaction_surface`.
- PB3: `test_decision_then_compatible_pattern_composes_ui_playbook`,
  `test_task_package_receives_structured_playbook_context`.
- PB4: `test_playbook_preserves_scope_risk_and_all_authorities_are_false`,
  `test_playbook_guidance_refines_base_visible_contract_without_weakening_it`.
- PB5: `test_constraint_priority_is_current_authority_before_history`,
  `test_founder_conflict_rejects_historical_asset_and_records_reason`.
- PB6: `test_verification_merge_is_additive_and_never_removes_required_evidence`,
  `test_visible_contract_refinement_is_deterministic_and_cannot_remove_base_requirements`.
- PB7: `test_founder_conflict_rejects_historical_asset_and_records_reason`,
  `test_playbook_rejects_deliberate_historical_source_file_leakage`.
- PB8: `test_playbook_evidence_is_persisted_idempotently_without_new_table`,
  `test_playbook_evidence_finalization_preserves_identity_lineage_and_is_idempotent`,
  `test_late_browser_resume_finalizes_same_playbook_evidence_truthfully`,
  `test_completed_same_execution_can_finalize_playbook_evidence_without_rerunning_work`.
- PB9: `test_current_task_still_requires_independent_frozen_verification` plus the nested Frozen
  Autonomous Execution V1 Gate.
- PB10: `test_cycle_guard_rejects_recursive_lineage_and_persists_rejection`.

Cross-module composition is directly covered by
`test_conversation_task_composes_cross_module_decision_with_same_module_pattern`; source-file
leakage rejection is directly covered by
`test_playbook_rejects_deliberate_historical_source_file_leakage`.

## 24. Real Task D Acceptance

Evidence below was re-read from the canonical Runtime/database before this baseline was written.
The business object was the Founder Conversation Composer “＋ 文件/文档” trigger. The Founder asked
for “上传文件” and “选择已有文档” without preselecting an interaction surface.

### Identity and final state — Durable Runtime Evidence

- conversation: `conv-40e13c42329349809dd8`
- task: `task-asset-msg-5197c4d020b370d2`
- execution: `execution-ac1380b4d75c4641`
- canonical Execution count: `1`
- Playbook evidence: `reuse-evidence-945d1dcd011b42abb1e5`
- Playbook: `playbook-3d30a2e659982c071d63`
- composition fingerprint:
  `4adc3408cc2b658b74f7e0659ebb55933a6ae46e6402146333a916c85c12ffdc`
- final Task: `completed`; Execution: `completed`; stage: `COMPLETED`; progress: `100`.

### Decision — Durable ReuseEvidence

- lookup performed: `true`; candidate count: `1`
- asset: `reuse-asset-270ceb8705834979b07e`
- strategy: `interaction_surface_choice / anchored_overlay_choice`
- applicability: `APPLICABLE`; applied: `true`
- recommendation: `anchored_popover`; rejected: `drawer`, `modal`
- source module: `Founder Sidebar / Navigation`; current module: `Founder Conversation`
- cross-module reuse: `true`; four Decision authority flags: all `false`.

### Pattern — Durable ReuseEvidence

- lookup performed: `true`; candidate count: `1`
- evidence: `reuse-evidence-9e61a5e757c6492cb0d7`
- asset: `reuse-asset-0e16b542bb464d9a93e3`
- type: `anchored_portal_popover`
- compatibility: `PASS`; applied: `true`
- source/current module: `Founder Conversation`; cross-module for Pattern: `false`
- scope before/after:
  `c5c47457d654cb0c6a3711f82d25bb98e5aedbf67f13c70b987b34897bcb1672`
- source-file leakage: `false`; leakage check: `PASS`.

### Playbook — Durable ReuseEvidence and Task Package Context

- composed/applied: `true / true`; type: `ui_interaction_change`; safety gate: `PASS`
- Decision assets: `[reuse-asset-270ceb8705834979b07e]`
- Pattern assets: `[reuse-asset-0e16b542bb464d9a93e3]`
- authoritative/advisory constraint counts: `6 / 5`
- compatibility: Decision `APPLICABLE`, Pattern `PASS`
- rejected assets: none; source-file leakage check: `PASS`
- all five Playbook authority flags: `false`
- source lineage in durable Task Package/Reuse context references two assets:
  - Decision source task `task-asset-msg-93816cdf6f6976a3`, execution
    `execution-fd973a9a99e14348`;
  - Pattern source task `task-asset-msg-50c5b0e1ada6582f`, execution
    `execution-3535c88b193c4f82`.

The finalized Playbook projection retains the asset references and fingerprint. The detailed lineage
payload remains in the durable Playbook context; it is not duplicated as historical payload.

### Finalized Playbook outcome — Durable ReuseEvidence

- `execution_id = execution-ac1380b4d75c4641`
- `final_result = completed`; `verification_result = PASS`
- final Task/Execution/stage/progress: `completed / completed / COMPLETED / 100`
- Browser, scope, tests, build, and diff results: all `PASS`
- finalized at: `2026-08-28T22:40:46.262869+00:00`
- repeated evidence-only reconcile returned `ALREADY_FINALIZED`; no second Playbook evidence was
  created and `playbook_finalized` telemetry occurs once.

### Independent verification — Durable Runtime Evidence

- non-empty production patch:
  `ConversationWorkspace.jsx`, `FounderHome.jsx`, and `sino-founder-ai.css`;
- task-owned patch persisted: `true`;
- semantic scope: source `semantic_module`, confidence `HIGH`, result `PASS`;
- targeted command: `npm test -- --run` for FounderNavigationPanel, ConversationThread, and
  FounderHome tests; result `69 passed, 11 skipped`;
- build command: `npm run build`; result `PASS`;
- diff command: `git diff --check`; result `PASS`;
- canonical System Chrome + Playwright Browser evidence: `PASS`;
- final `completed` Runtime event exists and final reconcile completed the Task.

### Browser acceptance — Durable Runtime / Acceptance Audit Evidence

The structured Browser evidence records visible trigger and surface, both options, recommended
surface match, `document.body` portal, fixed positioning, arrow, anchor geometry, viewport
containment, no Composer clipping, outside/Escape/toggle close, a real file chooser with no selected
file, truthful document boundary, no fabricated document data, preserved Conversation input, and
preserved project context.

Input geometry before/during/after was identical:
`{x: 283, y: 871, width: 854, height: 45}` with tolerance `1px`. This superseded an earlier
hidden/stale-textarea sampling false negative.

## 25. Acceptance History

- `54bbcf4` — Reusable Execution Playbook composition infrastructure.
- `0e6c131` — cross-module reusable asset applicability.
- `889094a` — Task D business implementation.
- `93fae03` — generic Founder Browser verification and visible-active-element handling.
- `5ca6db7` — Playbook verification refinement and durable Runtime evidence finalization.

These are accepted historical checkpoints, not work to reimplement during Freeze.

## 26. Reusable Playbook Promotion

Promotion is a **NON-GOAL**. A future version may consider it only after multiple independent Tasks,
repeated verification PASS, stable composition, no lineage cycle, and demonstrated reuse value.

## 27. Non-Goals

Capability 3 does not provide Reusable Playbook Asset promotion, enterprise-strategy or high-risk
business Playbooks, Operator/Studio Runtime Playbooks, distributed Playbooks, Vector DB, LLM
Playbook voting, risk override, Founder approval override, automatic production deployment, or
Capability 4.

## 28. Change Policy

Bug fixes, regression fixes, and internal refactors are allowed only when PB1–PB10 remain intact.
Changes to Current Task authority priority, Decision-to-Pattern order, the five authority flags,
constraint priority, verification non-weakening, Safety Gate semantics, durable
composition/finalization evidence, cycle guard, or independent verification require Capability 3.1
or a later explicitly versioned contract. They cannot enter this baseline silently.
