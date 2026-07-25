# Agent Evolution Foundation

Version

1.0

Date

2026-07-26

Status

Implemented as foundation (mock-backed, localStorage-persisted). Not a future-optional design —
the domain model, lifecycle and interfaces below are real code with real tests, built so mock
storage can later be swapped for a real backend without redesigning the shape.

Scope

The shared Agent Evolution domain layer, memory model, controlled evolution levels, cost
intelligence, and the Edition Policy mechanism that gates which parts of it each edition can see or
act on. Companion to [edition-architecture.md](edition-architecture.md) — that document defines
what Founder/Operator/Operator Cloud *are*; this document defines the one shared engine underneath
their Agent-related UI, per [edition-architecture.md §12](edition-architecture.md#12-relationship-to-the-agent-evolution-foundation).

---

## 1. Why one shared engine, not three

Founder, Operator and Operator Cloud each need a view onto "how is AI behaving and improving,"
but at different depths: Founder needs full control (evaluate, approve, promote, rollback,
purify); Operator needs a simplified, restricted view of their own store's agent (approve
low-risk items already evaluated by Founder, see cost/version summaries); Operator Cloud needs
device/OTA/support visibility, not agent internals. Building three separate mock state machines
would duplicate the lifecycle logic and let the three editions drift out of sync. Instead there is
one shared module, and each edition's UI reads/writes a restricted slice of it, gated by
`shared/editionPolicy.js`.

```
frontend/src/shared/
  localRepository.js              shared localStorage-backed mock repository (all editions)
  editionPolicy.js                POLICY_KEYS + per-edition policy profiles + hasPolicy()
  agentEvolution/
    evolutionMock.js              the one shared Agent Evolution domain module
    evolutionMock.test.js
    crossEditionBoundary.test.js  cross-edition integration tests (see §8)
```

Consumers:
- Founder: `frontend/src/console/modules/agentStudio/AgentDetailView.jsx` — new "Agent 演化" tab.
- Operator: `frontend/src/operator-preview/pages/AIGrowthPage.jsx` — new "AI 成长" nav item.
- Operator Cloud: `frontend/src/cloud/CloudConsoleApp.jsx` — device/OTA/support only, not the
  agent-evolution module itself (Cloud does not own agent internals, see
  [edition-architecture.md §7](edition-architecture.md#7-operator-cloud-domain-boundary)).

---

## 2. Domain model

Core objects (`frontend/src/shared/agentEvolution/evolutionMock.js`):

`AgentDefinition → AgentVersion → AgentRun → AgentOutcome → CostRecord → ModelRoutingDecision →
MemoryRecord → ReflectionReport → LearningCandidate → EvaluationRun → Experiment →
PromotionRecord/RollbackRecord`

The seeded scenario reuses a real existing Agent Studio template id
(`CONTENT_AGENT_ID = "脚本Agent"`, a content/script-generation agent) rather than inventing a
synthetic agent identity, so the new "Agent 演化" tab shows real seeded data the moment a Founder
opens that agent's detail view.

State is a single object persisted under the shared localStorage key
`ai-commerce-os:shared:agentEvolution.state` (via `createLocalRepository`), containing:
`agentDefinitions, agentVersions, agentRuns, agentOutcomes, costRecords, modelRoutingDecisions,
memoryRecords, reflectionReports, learningCandidates, evaluationRuns, experiments,
promotionRecords, rollbackRecords, evolutionLevel`.

---

## 3. Memory model

Six memory types (`MEMORY_TYPES`): Working, Episodic, Semantic, Procedural, Economic, Strategic.
Each `MemoryRecord` carries: `id, agentId, entityType, entityId, memoryType, content, source,
evidence, confidence, createdAt, lastUsedAt, expiresAt, version, status, costImpact,
businessImpact`.

Status lifecycle (`MEMORY_STATUSES`): `candidate → verified/active → deprecated/expired/rejected/
superseded`. The seed data deliberately includes a duplicate semantic memory, a stale/expired
rule, a low-confidence conflicting strategic memory, and a low-value deprecated entry — concrete
examples for the purification demo in §6, not just documentation prose.

---

## 4. Controlled evolution levels

`EVOLUTION_LEVELS` (E0–E4), current default `E2` (auto-evaluate; matches the prototype's actual
behavior — Founder still approves experiments and promotions manually):

| Level | Meaning |
|---|---|
| E0 | Record only — no automatic reflection or proposals |
| E1 | Auto-reflect and auto-propose learning candidates |
| E2 | **Default.** Auto-evaluate proposed candidates on request |
| E3 | Human-approved experiment / staged rollout |
| E4 | Policy-controlled auto-promotion, low-risk scope only |

`HIGH_RISK_AREAS` (ad budget increases, price changes, refunds, customer compensation, permission
changes, sensitive-content publishing, production credential changes, deleting important
Knowledge, enabling high-cost model routes) can never auto-promote regardless of level — enforced
in code by `promoteCandidate()`'s `isHighRisk()` guard, not just documented as a rule. A dedicated
test (`crossEditionBoundary.test.js` and `evolutionMock.test.js`) manually constructs a
high-risk-scoped candidate and asserts `promoteCandidate` rejects it.

---

## 5. Learning candidate lifecycle

```
candidate → evaluating → experimenting → promoted
                                        → rolledBack (via a later rollbackToVersion)
        → rejected (from candidate or evaluating, always requires a reason)
```

`LEARNING_CANDIDATE_TYPES`: KnowledgeUpdate, PromptUpdate, SkillUpdate, ModelRouteUpdate,
AutomationPolicyUpdate, MemoryCleanup, CostOptimization, StrategyUpdate. Every candidate carries
`evidence, expectedBenefit, possibleRisk, affectedAgentId, affectedScope, confidence, riskLevel,
status, evaluationRunId, approvalState`. No learning candidate is ever applied to a running agent
silently — every transition is an explicit function call returning `{ok, error}`, and promotion
always leaves the previous stable `AgentVersion` archived (never overwritten), so rollback can
restore it.

**Evaluation** (`evaluateCandidate`) compares the current stable version against the candidate
across nine dimensions: `outputQuality, taskSuccess, tokenUsage, modelCost, latencyMs,
humanIntervention, businessOutcome, risk, stability`, and produces a natural-language
recommendation. It does not recommend promotion when the candidate's output quality falls below
the reference threshold — this is asserted directly in `evolutionMock.test.js`, not left to visual
inspection.

**Experiment** (`approveExperiment`) requires prior evaluation and records the run at level `E3`.
**Promotion** (`promoteCandidate`) requires a prior experiment and is blocked by the high-risk
guardrail (§4). **Rollback** (`rollbackToVersion`) requires a non-empty reason and restores a
previously-archived version as stable, writing a `RollbackRecord`. All four operations are
idempotent against repeated calls in the wrong state (`{ok:false, error}`, not a thrown exception).

---

## 6. Self-purification

`PURIFICATION_ACTIONS`: `retain, merge, reducePriority, deprecate, expire, quarantine,
deleteAfterApproval`. `applyPurificationAction()` maps every action to a status transition on a
`MemoryRecord` — **never a physical delete**, even `deleteAfterApproval` only moves the record to
`rejected` status. `getActiveMemoryRecords()` (active/verified only) is what an agent's retrieval
would actually use; purification shrinks that set without destroying history, so Token spend on
retrieval goes down while the record remains inspectable and reversible. Tested directly: merging
the seeded duplicate memory removes it from the active set while `getMemoryRecords()` still
returns it (now `superseded`).

---

## 7. Cost intelligence

`computeContributionProfit(input)` implements the formula from
[edition-architecture.md](edition-architecture.md) and the original Token-Economy ADR-0003 intent:

```
contributionProfit = revenue − productCost − platformCommission − advertisingCost
                      − refundLoss − fulfillmentCost − contentTokenCost
```

— optimizing for GMV/ROAS alone was explicitly rejected; this is why the formula subtracts content
generation (Token) cost and refund loss, not just ad cost. `getCostIntelligenceSummary(agentId)`
aggregates `CostRecord`s for an agent into `totalRuns, totalModelCostUsd, totalBusinessValueUsd,
avgCostPerRunUsd, promotedOptimizations`. The seeded scenario demonstrates the recommended mock
narrative end to end: a content agent's stable route (Claude Sonnet 5, quality 92, $0.42/run) has
a candidate cheaper route (DeepSeek V3, quality 87, $0.09/run, ~78% cost reduction) already
evaluated, awaiting a Founder-approved experiment before promotion.

---

## 8. Edition Policy

`frontend/src/shared/editionPolicy.js` defines ~25 `POLICY_KEYS` (business operation, evolution
control, memory/prompt/skill access, device/tenant/OTA management, diagnostics/support, private
data access) and three profiles:

- **Founder** — every key except the five Cloud-exclusive platform-management keys (tenant/device
  management, OTA release management, full diagnostics, support management). Founder validates
  business capability; it does not manage the deployed device fleet.
- **Operator** — an explicit narrow grant list: own-tenant business operation, evolution
  *inspection* and *low-risk candidate approval only*, memory *summaries only*, own-device view,
  OTA receive (not release), support requests (not management), and access to its own local
  private business data.
- **Cloud** — device/tenant/license/OTA/diagnostics/support management only; explicitly excludes
  `PRIVATE_BUSINESS_DATA_ACCESS`, `MEMORY_FULL_ACCESS` and `PROMPT_UNRESTRICTED_EDIT`.

`hasPolicy(edition, key)` is called directly from JSX to gate real buttons, not just documented as
a rule:
- Founder's Agent 演化 tab hides evaluate/approve/promote/reject unless
  `EVOLUTION_FULL_CONTROL` is granted, hides rollback unless `EVOLUTION_ROLLBACK` is granted, and
  hides memory purification actions unless `MEMORY_FULL_ACCESS` is granted.
- Operator's AI 成长 page only shows the "同意在我的店铺灰度" button when a candidate is
  already `evaluating`, `riskLevel === "low"`, and `EVOLUTION_CANDIDATE_APPROVE_LOW_RISK` is
  granted — otherwise it shows "等待 Founder 完成评测" or "需 Founder 审批."
- Operator Cloud's overview privacy banner and OTA retry/pause/diagnostics-authorization buttons
  read `PRIVATE_BUSINESS_DATA_ACCESS`, `OTA_RELEASE_MANAGE` and `DIAGNOSTICS_FULL` respectively.

An unknown edition string falls back to the Operator profile (most restrictive), not to Founder —
tested directly.

---

## 9. Cross-edition state sharing (not three mock islands)

Because Founder's Agent Studio and Operator's AI Growth page both read the *same* shared
`agentEvolution.state` repository, a learning candidate is not independently faked in each
edition — it is genuinely the same object. `crossEditionBoundary.test.js` asserts this
behaviorally: before a Founder evaluates a candidate, Operator's approval condition is false; only
after `evaluateCandidate()` runs does the Operator-side condition
(`status === "evaluating" && riskLevel === "low" && hasPolicy(OPERATOR,
EVOLUTION_CANDIDATE_APPROVE_LOW_RISK)`) become true; and Operator approving an experiment
(`approveExperiment`) advances the candidate's status but does **not** by itself change the
agent's stable version — only Founder's `promoteCandidate` does that.

Operator Cloud's device records use the same demo device id literal
(`SHARED_DEMO_DEVICE_ID = "mac-mini-op-0001"`) as Operator's own local device mock
(`frontend/src/operator-preview/helpers/deviceMock.js`), so the prototype can narrate "the device
Cloud manages is the same physical device the operator sees locally" — but the two are
deliberately **separate mock modules**, not a shared import, because `frontend/src/cloud/` is not
in Operator's build-boundary include list (`scripts/editions/manifest.py`) and vice versa. Only
`frontend/src/shared/` is importable by all three editions.

---

## 10. Privacy / local-first boundary

Realized concretely, not just stated:

- Operator's Data & Privacy panel (`AIGrowthPage.jsx` → `PrivacySection`) shows local-first
  status, cloud telemetry scope, remote-diagnostic authorization (with expiry), and a business-data
  upload toggle that defaults to **off** — all backed by `operator-preview/helpers/deviceMock.js`,
  which the Operator, not Cloud, owns and can toggle.
- Operator Cloud's overview banner explicitly states its default telemetry scope (device
  health/heartbeat/version/anonymous feature usage/Token metering/error summaries) and is now
  driven by `hasPolicy(EDITIONS.CLOUD, POLICY_KEYS.PRIVATE_BUSINESS_DATA_ACCESS)` rather than a
  hardcoded string, so the banner and the policy layer cannot silently drift apart.

---

## 11. What is still mock-only / deferred

Consistent with the instruction not to overstate what is real:

- No real LLM calls, model routing, or Token metering exist — `CostRecord`/`ModelRoutingDecision`
  values are seeded, not measured.
- No real backend persistence — everything here is `localStorage`-backed, chosen so the same
  interfaces (`getX`, `applyY`) can be re-pointed at a real API later without redesigning the
  shape (the explicit goal stated in scope).
- No real device telemetry, heartbeat, or OTA package distribution — Operator Cloud's device/OTA
  state is seeded and mutated only through mock, audited actions (retry/pause/authorize/resolve),
  never a real rollout pipeline.
- The full Core Domain / Agent Runtime / Workflow Engine / Platform Connectors split described in
  [edition-architecture.md §6](edition-architecture.md#6-edition-policy-principle) remains
  direction-only; this task adds a real shared policy and domain layer underneath the three
  existing top-level React trees, not a full framework-level refactor of `main.jsx`'s edition
  selection.

---

## References

- [edition-architecture.md](edition-architecture.md) — product identity of the three editions;
  §12 points here.
- `frontend/src/shared/editionPolicy.js`, `frontend/src/shared/editionPolicy.test.js`
- `frontend/src/shared/agentEvolution/evolutionMock.js`,
  `frontend/src/shared/agentEvolution/evolutionMock.test.js`,
  `frontend/src/shared/agentEvolution/crossEditionBoundary.test.js`
- `frontend/src/console/modules/agentStudio/AgentDetailView.jsx` — Founder's "Agent 演化" tab.
- `frontend/src/operator-preview/pages/AIGrowthPage.jsx`,
  `frontend/src/operator-preview/helpers/deviceMock.js`,
  `frontend/src/operator-preview/helpers/deviceMock.test.js`
- `frontend/src/cloud/CloudConsoleApp.jsx`, `frontend/src/cloud/mock/cloudMock.js`,
  `frontend/src/cloud/mock/cloudMock.test.js`

---

Chief Software Architect

AI Commerce OS
