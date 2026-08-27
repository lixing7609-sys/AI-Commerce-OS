# Sino Autonomous Execution V1 Baseline

Status: **FROZEN V1 BASELINE**

Freeze Date: **2026-08-27**

Regression Gate: `./scripts/test-sino-autonomous-v1`

## 1. Purpose

This document is the repository authority for Sino Autonomous Execution V1. It freezes the
Founder-facing conversation, task, execution, scope, verification, recovery, completion, and risk
contracts that have passed real Founder → Sino → Codex → Verification acceptance.

Sino Autonomous Execution V1 is a natural-conversation system with bounded execution capability.
After a discussion becomes a clear executable goal, Sino can create one real Task and one canonical
Execution, resolve a safe scope, invoke Codex, verify the resulting patch, and reconcile the Task to
`COMPLETED / 100%`. Founder intervention is reserved for business decisions, necessary confirmation,
risk authorization, and final business acceptance. Founder is not the execution scheduler and is not
responsible for copying Codex instructions, running tests or builds, triggering browser verification,
or recovering ordinary LOW Risk executions.

This baseline is a contract, not a roadmap or marketing statement.

## 2. V1 Definition

V1 is complete when a clear, permitted LOW Risk task can move from normal conversation through a
single canonical execution and produce verified local code without manual terminal orchestration.
The system must either continue autonomously or expose a durable terminal blocker. Silent active-state
stalling is not a valid outcome.

Git checkpoint creation is post-completion version-control closure. It is not a normal Task completion
requirement.

## 3. Canonical Main Chain

```text
Conversation
→ Intent
→ Candidate Task
→ Founder Confirmation (when required)
→ Task
→ Execution
→ Semantic Scope
→ Codex Implementation
→ Scope Verification
→ Targeted Tests
→ Build
→ Diff Check
→ Browser / Artifact Verification
→ Final Reconcile
→ COMPLETED / 100%
→ Learning / Asset / Git Checkpoint (post-completion)
```

Each arrow is a Runtime transition backed by durable identity, evidence, or an explicit policy
decision. LLM narration cannot substitute for a missing transition.

## 4. Conversation Intent Contract

### Conversation First

Sino is first a natural conversation AI. Discussion, exploration, analysis, questions, comparisons,
clarification, and suggestions do not automatically create a Task.

### Executable intent

A Task lifecycle begins only when a message contains a clear executable goal and execution intent,
or when Founder confirms an already-persisted candidate Task.

### Execution controls

`执行`, `立即执行`, `确认执行`, `继续`, `暂停`, and `停止` operate on the current canonical Task or
Execution. They are controls, not new business goals. With no current executable Task, Sino must ask
what should be executed and must not claim that execution started.

Discussion after a completed execution remains discussion unless the current message independently
contains executable intent.

## 5. Task and Execution Identity

One business goal has one canonical Task identity. One canonical Task has one canonical Execution.
Repeated confirmation, execute, continue, or resume actions reuse the same `task_id` and
`execution_id`. They must not create duplicate executions.

Completed, failed, cancelled, or superseded Tasks are not recovered as current executable Tasks.
Execution Center confirmation binds the canonical Task and, for an eligible LOW Risk task, creates or
recovers and dispatches the canonical Execution. Repeated confirmation is idempotent.

Execution Center and Conversation use the same Task and Execution Runtime source. The following state
splits are contract violations:

- Execution Center shows a confirmed Task while Conversation has no current Task.
- Conversation claims execution while no Execution exists.
- Execution is completed while Conversation remains in a fixing state.

## 6. Semantic Scope

Scope resolution follows three levels:

1. **Explicit Contract** — use a precise existing contract when one applies.
2. **Semantic Module Scope** — resolve a clear LOW Risk task to the smallest semantic module.
3. **Approval Required** — require clarification or Founder approval when confidence or risk is not
   sufficient.

An empty explicit `allowed_files` result is a request for semantic resolution, not an automatic deny.
Clear LOW Risk local UI work must not require a new hard-coded contract for every UI object.

### Target and reference disambiguation

For “make X look or behave like Y”:

- X is the target object and determines write scope.
- Y is a visual, interaction, or design reference.
- Y does not become a second target module merely because it appears in the goal.

Reference wording must not create a false semantic tie.

### Discovery Scope and Write Scope

Semantic tasks may first use read-only discovery across the repository (`read`, `rg`, `grep`, `find`,
and `git grep`). Discovery results, the goal, and the target semantic module then produce the smallest
write scope. Discovery permission is not unrestricted write permission.

Post-implementation scope verification uses the same semantic model over actual task-owned files and
hunks. Shared CSS is attributed at hunk/selector level rather than accepted or rejected solely by its
filename.

## 7. Runtime Truth and Implementation Evidence

The LLM understands, discusses, explains, and summarizes. Runtime owns execution facts.

Task creation, queueing, execution start, implementation completion, test/build/verification results,
and final completion must be projected from real Runtime events and evidence. Without a real
`execution_id`, Sino cannot narrate that execution has started.

`codex_finished` does not mean `implementation_completed`. For an implementation or UI task,
implementation completion requires all of:

- a completed Codex run;
- a non-empty task-owned patch;
- a production implementation artifact, not only tests, docs, or specs;
- scope evidence for the task-owned patch.

Runtime-generated Conversation messages persist a common message contract:

- `message_id`
- `role`
- `content`
- `created_at`

The Conversation UI renders the durable `created_at`; it does not invent transient timestamps.

## 8. Canonical Execution State Machine

`backend/app/founder_ai/execution_state.py` is the canonical source for execution stage and progress.

Active sequence:

```text
CREATED
→ READY
→ QUEUED
→ DISPATCHING
→ IMPLEMENTING
→ SCOPE_VERIFYING
→ TESTING
→ BUILDING
→ DIFF_CHECKING
→ UI_VERIFYING
→ FINALIZING
→ COMPLETED
```

Terminal states:

- `BLOCKED`
- `FAILED`
- `CANCELLED`

UI labels may translate these stages. Backend truth must not reintroduce independent `fixing`,
`executing`, or `verification` state machines.

## 9. Stage-Derived Progress

Progress is a projection of canonical stage:

| Stage | Progress |
|---|---:|
| CREATED | 5% |
| READY | 10% |
| QUEUED | 15% |
| DISPATCHING | 20% |
| IMPLEMENTING | 40% |
| SCOPE_VERIFYING | 50% |
| TESTING | 60% |
| BUILDING | 70% |
| DIFF_CHECKING | 80% |
| UI_VERIFYING | 90% |
| FINALIZING | 95% |
| COMPLETED | 100% |

`execution_state.py` remains the source of truth if the implementation mapping changes compatibly.
A free-standing percentage detached from Runtime stage is prohibited.

## 10. Execution Liveness and Self-Recovery

Every active Execution must either advance or enter a durable `BLOCKED`/`FAILED` state.

- Owned subprocess alive: heartbeat and wait; do not duplicate dispatch.
- Process exited successfully but stage did not advance: reconcile the same Execution.
- Worker/process missing and safe recovery is possible: recover the same `execution_id`.
- Backend restart: reload and reconcile active Executions.
- Unsafe or unrecoverable loss: record `PIPELINE_STALLED` and block explicitly.

Stage runtime metadata includes the current implementation's equivalents of `stage_started_at`,
`last_heartbeat_at`, `last_meaningful_event_at`, `worker_id`, active process identity, and Runtime
revision. A watchdog must not depend on Founder refresh, a new Conversation message, or a manual API
call.

## 11. Runtime Revision

Execution diagnostics retain the current HEAD, dirty fingerprint when applicable, execution-created
revision, and worker/runtime revision. These values make disk code, backend process, worker, and
Execution version skew observable. Active Executions must not silently lose ownership across a
Runtime restart or revision change.

## 12. Automatic Post-Implementation Pipeline

After valid implementation evidence, Runtime automatically runs:

```text
Scope Verification
→ Targeted Tests
→ Build
→ Diff Check
→ Browser / Artifact Verification
→ Final Reconcile
```

Founder does not manually trigger these stages for ordinary LOW Risk tasks. A failure stops completion
and records the real failed stage. QUICK_FIX and Standard/Semantic UI lanes share the Runtime-owned
post-implementation semantics.

## 13. Verification Contract

Preferred browser verification falls back automatically to System Chrome + Playwright when the
preferred browser is unavailable. Verification distinguishes:

- `ACCEPTANCE_FAILED`: the artifact did not satisfy acceptance.
- `VERIFIER_UNAVAILABLE`: the verifier could not run.
- `VERIFIER_CRASHED`: the verifier process crashed.

A Chrome SIGABRT, unexpected quit, or closed browser context is not business acceptance failure.

Visible Artifact Verification should use DOM state, computed style, geometry, visibility, and actual
interaction results. Screenshots, Founder visual observation, and LLM descriptions are supporting
evidence, not sufficient structured evidence by themselves. Locators sample the active visible target
at the correct interaction point and avoid hidden or stale element false negatives.

## 14. Completion Semantics

For an ordinary LOW Risk task, completion requires:

- Scope Verification PASS;
- required Targeted Tests PASS;
- required Build PASS;
- Diff Check PASS;
- required Browser/Artifact Verification PASS.

When these conditions hold, Execution is `COMPLETED`, Verification is `PASS`, and Progress is `100%`.
A valid task-owned patch may remain in the Working Tree. Dirty task-owned files and a missing Git
checkpoint do not invalidate Task completion.

Task completion evidence and version-control evidence are separate projections. A persisted browser
PASS remains valid during reconcile and cannot be overwritten merely because Git closure is pending.

## 15. Git Closure

Git checkpoint state is post-completion version-control closure:

- `NOT_REQUESTED`
- `PENDING`
- `CREATED`
- `FAILED`

Checkpoint failure or absence cannot reverse verified Task completion. Git push always requires
explicit authorization.

## 16. V1 Risk Boundary

### LOW Risk autonomous scope

- local UI and styling changes;
- small component interactions;
- copy changes;
- bounded local code modifications;
- targeted tests and production build;
- diff check;
- localhost browser verification;
- safe resume/recovery of the same Execution;
- read-only discovery.

### Founder approval required

- deletion of real business or user data;
- destructive database migration;
- production deployment;
- Git push;
- secrets or API keys;
- system permission changes;
- external paid APIs;
- large cross-domain refactors;
- LOW semantic confidence;
- MEDIUM or HIGH Risk work;
- irreversible actions.

V1 autonomy must not be extended by weakening this boundary.

## 17. Regression Constitution

These seven rules are permanent V1 invariants:

1. **Conversation First** — Sino is first a natural conversation AI, not a command executor.
2. **No Fake Execution** — without a real Task and Execution, Sino cannot narrate “executing.”
3. **Single Canonical Execution** — one Task has one canonical Execution.
4. **Generic Semantic Scope** — new LOW Risk tasks prefer semantic scope; do not hard-code every UI
   object.
5. **Advance or Fail Explicitly** — an Execution advances or exposes a durable failure; it never
   silently stalls.
6. **Runtime Truth Over LLM Copy** — Runtime evidence is authoritative for execution facts.
7. **Task Completion Is Separate from Git Closure** — checkpoint state cannot block or reverse a
   verified Task.

The regression gate maps these rules to existing contract tests. Any change that violates a rule is a
V1 Contract Regression, not a completed ordinary modification.

## 18. Accepted V1 Scenarios

The following real scenarios established the baseline:

1. **Product Matrix Typography** — typography change; scope, tests, build, diff check, and computed
   style verification PASS; completed at 100%.
2. **Product Matrix Launcher / Popover** — launcher and popover separated; portal/fixed overlay and
   browser geometry verified.
3. **Product Matrix Drawer → Anchored Popover** — semantic scope, browser fallback, and completion
   semantics reached 100%.
4. **Conversation Intent / Task Lifecycle** — discussion creates no Task; execution controls reuse the
   current Task; fake execution narration is rejected.
5. **Execution Center Confirm** — confirmation binds current Task, dispatches/reuses the canonical
   Execution, and repeated confirmation is idempotent.
6. **Rename / Archive / Delete Project Actions** — unseen UI task used semantic scope, same-Execution
   recovery, tests, build, browser verification, and completed at 100%.
7. **Conversation More Actions** — target/reference disambiguation, canonical stage, watchdog recovery,
   visible-trigger sampling, and final verification completed at 100%.
8. **Move to Project → 移动到项目** — new LOW Risk copy task completed with tests and build without
   manual Codex recovery.

These scenarios record demonstrated capability; they do not add object-specific scope contracts.

## 19. Non-Goals

V1 freeze does not require or authorize:

- multi-agent long-running complex collaboration;
- large cross-product refactors;
- automatic production deployment or Git push;
- destructive database automation;
- cloud-worker or NAS/distributed execution;
- multi-machine recovery;
- autonomous high-risk authorization;
- Operator or Studio professional runtimes;
- long-cycle autonomous commercial operation;
- advanced visual-AI review.

These belong to V1.1, V2, or future work and cannot block V1 freeze.

## 20. Test Coverage and Regression Gate

Run:

```bash
./scripts/test-sino-autonomous-v1
```

The gate aggregates existing focused tests for Conversation intent, Task lifecycle, single Execution
identity, semantic scope, target/reference disambiguation, canonical stage/progress, worker recovery,
technical resolution, post-implementation orchestration, verification fallback, and completion
semantics. `backend/tests/test_execution_state.py` directly freezes the canonical stage/event/progress
mapping without changing Runtime implementation.

Constitution coverage:

| Rule | Primary regression coverage |
|---|---|
| 1 | `test_conversation_task_interaction.py`, `test_founder_ai_conversation_api.py` |
| 2 | `test_conversation_task_interaction.py` Runtime identity/evidence tests |
| 3 | `test_conversation_task_interaction.py`, `test_execution_worker.py` |
| 4 | `test_semantic_scope_resolution.py` |
| 5 | `test_execution_worker.py`, `test_technical_resolution.py`, `test_post_implementation.py` |
| 6 | `test_conversation_task_interaction.py`, `test_verification_fallback.py` |
| 7 | `test_standard_task_execution.py` completion-semantics tests |

## 21. Change Policy

Bug fixes, regression fixes, and internal refactors are allowed only when they preserve this contract
and keep the V1 regression gate passing.

Changes to canonical state, risk boundary, completion semantics, single-Execution identity, semantic
scope principle, Runtime truth, recovery behavior, or the Regression Constitution require an explicit
V1.1 or V2 contract with migration and compatibility impact. They must not be introduced silently.

When a proposed Founder Runtime change breaks this baseline:

1. report a **V1 Contract Regression**;
2. stop expanding the change;
3. classify it as a Bug Fix, V1.1 Contract Change, or V2 Architecture Change;
4. obtain Founder direction before changing the frozen baseline.

Future Conversation, Intent, Task, Execution, Scope, Worker, Watchdog, Verification, Completion, and
Risk work must consult this file before implementation.
