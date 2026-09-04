# Founder–Developer OS Contract

`founder_developer_os_contract_version: 1`

Status: Proposed for Founder approval
Owners: AI Commerce OS Founder (consumer) · AI Builder Developer OS (authority)

## 1. Purpose

This contract is the only business boundary between AI Commerce OS Founder and AI Builder Developer OS. It lets Founder present and authorize the daily development loop without owning a second lifecycle, calling an Executor or Git directly, or inferring facts from local UI state.

Developer OS is authoritative for planning, Current Run, artifacts, review, approvals, Commit Candidate, Git result, and recovery. Founder is a projection and command surface.

## 2. Scope

In scope:

- Current Workspace and Sprint summaries.
- Today's recommended Mission and its business explanation.
- Current Run, Artifact, Review, Commit Candidate, and Commit Result summaries.
- The eight Founder business commands defined below.
- Refresh, recovery, compatibility, audit, and security rules.

Out of scope:

- Executor prompts, provider/model selection, raw logs, shell/Git/database commands, API keys, internal reasoning, and direct state mutation.
- UI layout, API transport, database schema, and implementation details.
- Release automation or permission delegation.

## 3. Ownership

| Concern | Founder | Developer OS |
| --- | --- | --- |
| Sprint/Mission/Run display | Render authoritative summaries | Produce and restore facts |
| Business explanation | Display without changing meaning | Generate reason, result, risk, dependencies |
| Run State | Read only | Sole writer through Developer Orchestrator |
| Execution | Request approval/cancel | Approval Gate + Orchestrator + Executor Adapter |
| Artifact and Review | Display summaries/details | Collect, verify, review, retain |
| Commit | Approve/reject Candidate | Validate and commit only through Git Adapter |
| Recovery | Request refresh | Reconcile journal, Workspace, HEAD, Candidate, Commit |

Founder MUST NOT call Codex, Claude, an Executor, Git, or Approval storage directly. Founder MUST NOT edit a Candidate, advance a Run, or treat a button click, local cache, process exit code, or model response as a lifecycle fact.

## 4. Data Contract

### 4.1 Common rules

- JSON field names use `snake_case`; enum values use lowercase `snake_case`.
- Times use RFC 3339 UTC strings, for example `2026-08-03T12:34:56Z`.
- IDs are opaque non-empty strings and MUST NOT be parsed for meaning.
- Required nullable fields are marked `nullable`; absent optional fields are allowed only in a compatible minor extension.
- When Developer OS cannot provide a value, it returns `null` plus an applicable availability/error code. Founder displays `unavailable`; it MUST NOT synthesize a value.
- Collections are arrays, never comma-separated strings. File paths are Workspace-relative; arbitrary absolute paths are not accepted from Founder.

### 4.2 Read objects

#### `WorkspaceSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `workspace_id` | string | required |
| `name` | string | required |
| `path` | string | required; display-only, Developer OS whitelist value |
| `branch` | string | nullable |
| `head` | string | nullable |
| `clean` | boolean | required |
| `last_checked_at` | RFC 3339 string | required |

#### `SprintSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `sprint_id` | string | required |
| `title` | string | required |
| `goal` | string | required |
| `progress` | integer, 0–100 | required |
| `status` | `planned`, `active`, `blocked`, `completed`, `cancelled` | required |
| `epics` | array of summary references | required, may be empty |
| `blockers` | array of business strings | required, may be empty |
| `recommended_mission_id` | string | nullable |

#### `MissionSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `mission_id` | string | required |
| `title` | string | required |
| `business_reason` | string | required |
| `expected_result` | string | required |
| `risk_level` | `low`, `medium`, `high`, `critical` | required |
| `dependencies` | array of mission IDs | required, may be empty |
| `target_files` | array of Workspace-relative paths | required, may be empty before Task Package |
| `approval_required` | boolean | required |
| `status` | `planned`, `blocked`, `waiting_execution_approval`, `active`, `completed`, `cancelled` | required |

#### `RunSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `run_id` | string | required |
| `mission_id` | string | required |
| `workspace_id` | string | required |
| `state` | Standard Run State from §6 | required |
| `progress` | integer, 0–100 | required |
| `current_step` | string | required |
| `started_at` | RFC 3339 string | nullable before execution |
| `updated_at` | RFC 3339 string | required |
| `completed_at` | RFC 3339 string | nullable until terminal |
| `failure_summary` | string | nullable |

#### `ArtifactSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `changed_files` | array of Workspace-relative paths | required |
| `diff_summary` | string | required |
| `tests` | check summary object | required; status may be `not_run` |
| `lint` | check summary object | required; status may be `not_run` |
| `build` | check summary object | required; status may be `not_run` |
| `screenshots` | array of artifact references | required, may be empty |
| `review_result` | `pending`, `passed`, `failed`, `revision_required` | required |
| `rollback_plan` | string | required |

Each check summary contains `status: passed | failed | skipped | not_run`, `summary`, and nullable `completed_at`. Skipped checks require a reason in `summary`.

#### `CommitCandidateSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `candidate_id` | string | required |
| `workspace_id` | string | required |
| `baseline` | Git object ID | required |
| `branch` | string | required |
| `files` | array of Workspace-relative paths | required, non-empty |
| `diff_summary` | string | required |
| `suggested_commit_message` | string | required |
| `review_status` | `passed`, `failed`, `revision_required` | required |
| `verification_status` | `passed`, `failed` | required |
| `risk_level` | `low`, `medium`, `high`, `critical` | required |
| `status` | `waiting_commit_approval`, `commit_rejected`, `stale`, `committed` | required |

#### `CommitResultSummary`

| Field | Type | Nullability |
| --- | --- | --- |
| `commit_hash` | Git object ID | required |
| `commit_message` | string | required |
| `branch` | string | required |
| `committed_files` | array of Workspace-relative paths | required |
| `completed_at` | RFC 3339 string | required |
| `workspace_clean` | boolean | required |

All objects MUST carry the response envelope fields `contract_version`, `request_id`, and `generated_at`. Run-bound objects MUST refer to the same `workspace_id`, `mission_id`, and `run_id` where applicable.

## 5. Command Contract

Every command envelope contains `command_id`, `command_type`, `contract_version`, `actor_id`, `workspace_id`, `expected_run_revision`, `idempotency_key`, `requested_at`, and `payload`. Developer OS validates current state and scope again; acceptance is not proof of completion.

| Command | Required payload | Allowed source state | Expected state/result | Idempotency | Rejected when / Founder message | Audit record |
| --- | --- | --- | --- | --- | --- | --- |
| `request_today_mission` | `sprint_id` | no active Run, or terminal Run | `planning` then `waiting_execution_approval` | Same Sprint/goal returns same active proposal | Sprint unavailable, dependencies blocked / “当前没有可执行 Mission” | request, selected Mission, ranking reason |
| `approve_execution` | `mission_id`, `approval_scope_hash` | `waiting_execution_approval` | `execution_approved` | Same approval/scope is no-op | dirty Workspace, scope/revision mismatch / “执行范围已变化，请刷新后重新批准” | immutable Execution Approval |
| `cancel_execution` | `run_id`, nullable `reason` | `execution_approved`, `executing`, `testing`, `artifact_collection`, `reviewing` | `cancelled` | Repeated cancel returns same terminal result | wrong Run or terminal success / “当前执行无法取消” | cancel actor, reason, resulting state |
| `request_revision` | `run_id`, `reason` | `reviewing`, `waiting_commit_approval`, `commit_rejected`, `failed`, `stale` | new planning/task preparation; old Run unchanged | Same request ID creates one revision | empty reason or wrong revision / “当前结果不能进入修改” | old/new references and reason |
| `approve_commit` | `candidate_id`, `approval_scope_hash` | `waiting_commit_approval` | `commit_approved`, then `committing` | Atomic single success; repeats return existing result | baseline/files/review/verification mismatch / “提交条件已变化，未执行提交” | immutable Commit Approval and consumption |
| `reject_commit` | `candidate_id`, nullable `reason` | `waiting_commit_approval` | `commit_rejected` | Repeats return same rejection | wrong/stale/committed Candidate / “该 Candidate 已处理” | rejection and retained artifacts |
| `refresh_state` | nullable `run_id` | any | no state mutation; authoritative snapshot | Safe and repeatable | unavailable backend / “暂时无法读取最新状态” | request telemetry; no lifecycle event required |
| `open_detailed_report` | `run_id`, optional artifact IDs | any known Run | no state mutation; redacted report | Safe and repeatable | unknown/unauthorized Run / “详细报告不可用” | report access record |

Founder MUST NOT send a raw shell command, Git command, Executor prompt, direct target state, database command, secret, or arbitrary Workspace path.

## 6. State Contract

The sole source is Developer OS Current Run. Founder keeps no independent state machine. It may cache the last snapshot for display only and MUST replace it by increasing `revision` snapshots from Developer OS.

| State | Business meaning / Founder label | Enabled actions | Disabled actions | Next legal state(s) | Class |
| --- | --- | --- | --- | --- | --- |
| `planning` | 正在规划今日 Mission | refresh, details | execution/commit actions | `waiting_execution_approval`, `failed` | recoverable |
| `waiting_execution_approval` | 等待执行授权 | approve execution, refresh, details | commit | `execution_approved`, `cancelled` | approval gate |
| `execution_approved` | 已批准，准备执行 | cancel, refresh, details | approve again, commit | `executing`, `failed`, `cancelled` | recoverable |
| `executing` | 正在执行 | cancel, refresh, details | commit | `testing`, `failed`, `cancelled` | recoverable |
| `testing` | 正在自动验证 | cancel, refresh, details | execution/commit approval | `artifact_collection`, `failed`, `cancelled` | recoverable |
| `artifact_collection` | 正在收集研发产物 | cancel, refresh, details | commit | `reviewing`, `failed`, `cancelled` | recoverable |
| `reviewing` | 正在自动验收 | cancel, refresh, details | commit | `waiting_commit_approval`, `failed`, `cancelled` | recoverable |
| `waiting_commit_approval` | 等待提交授权 | approve/reject commit, revision, refresh, details | execution approval | `commit_approved`, `commit_rejected`, `stale` | approval gate |
| `commit_approved` | 已批准提交 | refresh, details | all approval buttons | `committing`, `stale`, `failed` | transient |
| `committing` | 正在受控提交 | refresh, details | cancel, duplicate commit | `committed`, `failed` | irreversible boundary |
| `committed` | 已提交 | refresh, details | all mutation buttons | `completed` | observed Git fact |
| `completed` | 本次 Mission 已完成 | request next mission, refresh, details | old Run mutation | none; new Run required | terminal |
| `failed` | 本次执行失败 | revision, refresh, details | commit | new Run after recovery decision | terminal Run, recoverable Loop |
| `cancelled` | 已取消 | revision, refresh, details | approve/commit | new Run only | terminal Run |
| `commit_rejected` | 已拒绝提交 | revision, refresh, details | approve rejected Candidate | new Candidate/Run | terminal Candidate |
| `stale` | Candidate 已失效 | revision, refresh, details | commit | new Candidate after reconciliation | terminal Candidate |

`commit_failed` is represented as `failed` with error code `commit_failed` in this version, avoiding two Founder states for the same recovery class.

Developer OS canonical Contract names map at its Founder Adapter boundary as follows: `collecting_artifacts → artifact_collection`; `git_candidate → waiting_commit_approval` only after Candidate preparation succeeds; internal `discussion`, `consensus`, and `task_ready` are represented as `planning`; `clarification_required` is represented as `failed` plus a recoverable `state_conflict`/clarification detail until a future compatible state is introduced. Founder MUST NOT implement these mappings itself.

## 7. Approval Contract

Founder approval is mandatory for:

- Code or managed-configuration modification.
- Git Commit.
- File/data deletion.
- Database migration or backfill.
- Release or deployment.
- Push.
- High-risk system configuration or permission changes.

Developer OS may automatically read an authorized Workspace, plan Sprint/Epic/Feature/Mission, draft Task Package, run tests/lint/build, capture screenshots, collect artifacts, perform Review, retry ordinary non-destructive failures, and prepare a Commit Candidate.

Every approval record contains `approval_id`, `founder_action`, `mission_id`, nullable `run_id`, nullable `candidate_id`, `approved_at`, `scope`, and `result`. It is immutable, action-specific, revision/baseline/scope-bound, auditable, and cannot be reused for another protected action. UI state is never an Approval.

## 8. Error Contract

Error envelope: `error_code`, `message`, `impact`, `recoverable`, `suggested_action`, `approval_required`, `request_id`, and nullable `technical_report_ref`. Founder displays the first six business fields. Stack traces, raw stderr, secrets, prompts, and internal reasoning appear only in an authorized redacted detailed report.

| Error code | Business meaning | Default next step |
| --- | --- | --- |
| `workspace_dirty` | Workspace 有未批准改动，未启动执行 | Review or clean the baseline |
| `baseline_changed` | HEAD no longer matches approved baseline | Refresh and regenerate Candidate |
| `executor_unavailable` | Executor cannot start | Preserve plan; repair Executor |
| `execution_failed` | Approved execution did not complete | Review report; retry or revise |
| `verification_failed` | Automated checks failed | Revise; no Candidate commit |
| `review_failed` | Result is outside scope or acceptance failed | Revise approved scope |
| `candidate_stale` | Candidate no longer matches Workspace | Regenerate; commit disabled |
| `commit_failed` | Git Adapter could not safely commit | Preserve Candidate/worktree; inspect report |
| `unauthorized_scope` | Requested/actual scope exceeds approval | Reject action; request new approval |
| `duplicate_action` | Same protected action was already processed | Show existing authoritative result |
| `state_conflict` | Command used an old revision or wrong state | Refresh; do not overwrite |

Errors MUST say what happened, whether prior work is safe, whether recovery is possible, the suggested next action, and whether Founder authorization is needed.

## 9. Refresh and Recovery

1. On load or refresh, Founder requests the current Sprint, recommended Mission, Current Run, Review, Candidate, and Commit Result from Developer OS by Workspace ID.
2. Founder local memory/storage is never authoritative. It may show “正在恢复状态” but cannot enable protected actions until reconciliation finishes.
3. Developer OS restores from durable Context/Event/Approval/Artifact records and verifies the whitelisted Workspace branch, HEAD, worktree, and index.
4. Review and Candidate are restored only when their Run, Task Package version, baseline, and scope match.
5. If HEAD differs, Developer OS checks whether HEAD is exactly the Candidate-produced Commit. If yes, return `committed` with the real Commit Result; otherwise return `stale` and disable commit.
6. Repeated clicks use `idempotency_key`, expected revision, and atomic Approval consumption. Only one concurrent protected command succeeds.
7. Multiple tabs observe the same server revision. A stale tab receives `state_conflict`, refreshes, and never overwrites the newer state.
8. After backend restart, Developer OS reconstructs state from authoritative records and Git facts; it MUST NOT infer success from Founder cache.
9. If recovery data is unavailable, return `unavailable`/structured error and fail closed rather than report a guessed state.

## 10. Security Boundaries

- Founder never receives, stores, or renders API keys or complete credentials.
- Founder cannot submit an arbitrary Workspace path; `workspace_id` must resolve through the Developer OS whitelist.
- Executor cannot run `git add`, `git commit`, `git push`, release, destructive Git, deletion, migration, or unapproved files.
- All Git writes go through Git Adapter after Commit Approval.
- UI and API transport cannot bypass Approval Gate or Developer Orchestrator.
- Candidate Workspace, baseline, branch, file set, scope hash, actual diff, Review, and verification must match before commit.
- Baseline drift, extra changed/staged files, or scope mismatch fails closed without cleanup or overwrite.
- No automatic Push, Release, migration, deletion, or high-risk permission/configuration change.
- Logs and Artifact payloads are bounded and redacted; secrets and internal model reasoning are excluded.

## 11. Versioning

- Contract envelope value: `founder_developer_os_contract_version: 1`.
- Version 1 additions are backward-compatible only when new fields are optional and old semantics do not change.
- Removing, renaming, changing type/nullability, changing enum meaning, or changing approval/state semantics requires a new major version.
- New enum values require negotiated capability support; unknown values display `unavailable`, disable protected actions, and trigger refresh/upgrade guidance.
- Founder and Developer OS exchange supported versions before enabling actions. An incompatible version displays “Founder 与 Developer OS 契约版本不兼容” and fails closed.
- Silent fallback, state alias guessing in Founder, or interpreting an unknown state as success is forbidden.

## 12. Acceptance Criteria

1. Founder reads all development status from Developer OS Current Run and has no second Run state machine.
2. All payloads follow the versioned snake_case schemas and RFC 3339 time rule.
3. Founder can send only the eight named business commands.
4. Developer Orchestrator remains the only canonical Run State writer.
5. Executor and Founder cannot perform Git writes; Git Adapter is the sole Git writer.
6. Execution and Commit require separate scope-bound Founder approvals; delete, migration, release, Push, and high-risk configuration also require Founder approval.
7. Refresh, restart, duplicate click, multi-tab, baseline drift, committed recovery, and stale Candidate are deterministic and fail closed.
8. Founder displays business errors and keeps technical details in a redacted detailed report.
9. Missing or unknown fields/states display `unavailable`; Founder never guesses.
10. No implementation may begin until Founder approves this contract as the M2 baseline.

## References

- [AI Builder Developer Orchestrator Domain Contract](../../../AI-Builder/docs/architecture/contracts/01-orchestrator-domain.md) — conceptual cross-workspace reference; implementations resolve it from the registered AI Builder Workspace, not as a runtime file dependency.
- [AI Builder State Machine Contract](../../../AI-Builder/docs/architecture/contracts/03-state-machine.md)
- [AI Builder Human Approval Contract](../../../AI-Builder/docs/architecture/contracts/06-approval-contract.md)
- [AI Commerce OS Founder Master Edition Development Charter](../architecture/Founder_Master_Edition_Development_Charter.md)
