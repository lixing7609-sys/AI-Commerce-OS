# Distributed Compute — Future Architecture, Security and Resource Policy

Version

1.0

Date

2026-07-27

Status

Architecture reserved, not implemented. Domain model, feature flag, and read-only mock UI exist
across Operator Cloud, Studio and Operator; **no real scheduling, no real remote execution, no real
resource consumption exists anywhere in this codebase.** `distributedCompute.enabled = false` by
default and this document does not change that. Part of the "AI Commerce OS Four-Product
Architecture V1" freeze — see [edition-architecture.md](edition-architecture.md) §15 for the
pointer into this document.

---

## 1. Purpose

Future Operator Cloud will be able to schedule idle compute capacity across operators' Mac minis,
in aggregate, to run tasks for AI Commerce OS Studio and the platform generally — video transcode,
image/audio processing, content vectorization, non-realtime generation, and similar
batch/background workloads. This document freezes the architecture, domain model, and security
posture for that capability so it can be built later without redesigning the boundary, while making
explicit everything this round of work deliberately does **not** do.

## 2. What exists today (implemented)

- **Domain types** — `frontend/src/shared/distributedCompute/types.js`: `DeviceResourceProfile`,
  `ComputeParticipationPolicy`, `ComputeTask`, `ComputeAssignment`, `ComputeUsageRecord`, plus the
  `COMPUTE_TASK_PRIORITIES` (P0–P4) and `COMPUTE_TASK_TYPES` catalogs.
- **Feature flag** — `frontend/src/shared/distributedCompute/featureFlags.js`:
  `FEATURE_FLAGS.distributedCompute.enabled = false` (frozen default), plus
  `assertDistributedComputeAllowed()`, a single explicit guard function every future real dispatch
  path must call before doing anything — today it always throws, because the flag is always false.
- **Mock repository** — `frontend/src/shared/distributedCompute/mockComputeRepository.js`: a
  read-mostly mock device pool, per-device participation policies (all seeded `enabled: false`),
  and a small set of queued/cancelled mock tasks. Its two "operations"
  (`setGlobalPause`/`cancelComputeTask`) only mutate mock display state.
- **Read-only UI in three products:**
  - **Operator Cloud** — "分布式调度" nav item, 7 sections (overview, device pool, scheduled
    tasks, task assignment, resource policy, exceptions/pause, cost savings). See
    `frontend/src/cloud/CloudConsoleApp.jsx`'s `DistributedSchedulingPage`.
  - **Studio** — "算力任务" nav item, showing the same task list from Studio's perspective
    (Studio is one of the sources that would eventually submit tasks). See
    `frontend/src/studio/pages/PlatformPages.jsx`'s `ComputeTasksPage`.
  - **Operator** — a simplified, non-technical "设备资源" card inside "设备与更新," using plain
    business language only (设备运行状态/当前软件版本/最近心跳/本地经营负载/可用算力/平台任务状态/
    今日平台后台任务运行时间/是否影响经营任务/当前分布式调度功能). See
    `frontend/src/operator-preview/pages/AIGrowthPage.jsx`'s `DeviceUpdatesPage`.

Every one of these three surfaces reads `isDistributedComputeEnabled()` from the same shared
feature-flag module and displays the same honest state: **"当前为架构预留和模拟数据，尚未启用真实
设备调度" / "分布式算力尚未启用，当前为架构预留状态" / "平台算力协同尚未启用."**

## 3. What does not exist (explicitly out of scope this round)

- No real device-side agent that reports `DeviceResourceProfile` from an actual Mac mini.
- No real task dispatch, no remote shell execution of any kind, no code path that could execute
  arbitrary commands on a device.
- No real resource consumption — `estimatedCloudCostSavedRmb` is hardcoded to `0` everywhere
  (`getComputeOverview()`), specifically so no page can ever display a fabricated savings number.
- No real cross-tenant data sharing — the mock device pool's `operatorName` field is display-only
  demo data, not a real cross-tenant query.
- No background/"mining"-style logic of any kind.
- No UI control anywhere bypasses `isDistributedComputeEnabled()` to simulate a real dispatch —
  every mock "action" (pause, cancel) is explicitly documented in its own code comment as
  display-state-only.

## 4. Target architecture (direction only)

```
Operator Runtime
├── Business Scheduler       — owns the local operator's own AI/business task queue (P1/P2)
├── Local AI Runtime         — executes the operator's own Agent/task workloads
├── Resource Monitor         — reports DeviceResourceProfile to Operator Cloud
├── Platform Compute Agent   — the only component that would ever accept a platform ComputeTask
└── Task Sandbox             — the only execution boundary a Platform Compute Agent task may run in
```

`Platform Compute Agent` is architecturally isolated from `Business Scheduler`/`Local AI Runtime` —
a platform task never has a code path into the operator's own business execution context, and
never runs outside `Task Sandbox`. This is a design constraint, not (yet) an implemented one; there
is no `Platform Compute Agent` or `Task Sandbox` runtime in this codebase today.

## 5. Priority model (frozen)

| Priority | Meaning |
|---|---|
| P0 | Local safety and system stability |
| P1 | Operator's real-time business tasks |
| P2 | Operator's background business tasks |
| P3 | Platform distributed tasks |
| P4 | Low-priority batch tasks |

**Platform tasks (P3/P4) must never preempt local business tasks (P0–P2).** This ordering is
encoded in `COMPUTE_TASK_PRIORITIES` (`types.js`) and must be preserved by any future real
scheduler — a platform task is only ever eligible to run when a device's participation policy
(`ComputeParticipationPolicy`) says so, and that policy is designed to default to paused whenever
local business activity, thermal state, or power state suggests it shouldn't run (`pauseWhen*`
fields).

## 6. Security and resource policy requirements (reserved, not yet built)

A future real implementation must include all of the following before `distributedCompute.enabled`
can ever become `true` in a production build:

- **Task signing** — a real `ComputeTask` must be cryptographically signed by its source product,
  verifiable by the receiving device.
- **Task source verification** — a device must be able to verify a task genuinely originated from
  Operator Cloud, not an intercepted or forged request.
- **Sandbox** — every platform task executes inside `Task Sandbox`, never with direct host access.
- **Resource limits** — enforced from `ComputeParticipationPolicy` (`maxCpuPercent`, `maxMemoryMB`,
  `maxStorageGB`), not just displayed.
- **Timeouts** — every `ComputeTask` needs an enforced wall-clock limit tied to
  `estimatedDuration`.
- **Kill switch** — both global (Cloud-wide "全局暂停," already modeled as
  `globalPauseActive` in the mock repository) and per-device (`ComputeParticipationPolicy.enabled`)
  must be real, immediately effective, and independent of each other.
- **Audit log** — every real dispatch, assignment, completion, failure and cancellation needs a
  durable audit trail — not present today (mock state is ephemeral `localStorage`).
- **Tenant isolation** — a platform task must never be able to read another operator's business
  data or another device's task state.
- **Data minimization** — `payloadReference` (an opaque reference, never inline payload data) is
  the only way a `ComputeTask` should carry work — the type is already shaped this way
  (`types.js`) specifically to avoid a future implementation defaulting to embedding raw data.
- **Per-device pause, per-task cancel, and scheduling-failure rollback** — all three are already
  represented as distinct states in the domain model (`ComputeAssignment.status`,
  `ComputeParticipationPolicy.policyStatus`) so a real implementation has a state machine to
  implement against rather than inventing one under time pressure.

## 7. Enabling this in the future

There is exactly one flag to flip: `FEATURE_FLAGS.distributedCompute.enabled` in
`shared/distributedCompute/featureFlags.js`. Before that happens, §6's full checklist must be a
real, tested implementation — not a UI-only toggle. `assertDistributedComputeAllowed()` exists
today specifically so that a future real dispatch path has exactly one place to add the real
authorization/signature/sandbox checks, rather than scattering `if (enabled)` checks across three
products' UI code.
