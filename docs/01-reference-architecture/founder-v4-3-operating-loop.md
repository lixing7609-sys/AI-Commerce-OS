# Founder V4.3 — Real Operating Loop Preparation

Version

4.3

Date

2026-07-25

Status

Implemented (mock-only)

Scope

`frontend/src/console/` — the Founder Operator Edition console (`?mode=founder`). Extends the
frozen V4 module set defined in
[founder-v4-architecture-freeze.md](founder-v4-architecture-freeze.md) — no new first-class
navigation module was added. The frozen navigation tree and the `founder-v4-architecture-freeze`
tag are unchanged by this work.

---

## 1. Purpose

Founder V4 built each business module (Content Center, Approval Center, Order Center, Customer
Service Center, Replay Center, ...) to a reasonable depth in isolation. V4.3 does not add depth to
any single module — it wires **one realistic scenario end to end** across all of them, so a single
content project's lifecycle can be followed, with consistent shared IDs, from store/product
selection through content generation, approval, mock publishing, traffic/order attribution,
customer-service follow-up, business review, and knowledge candidates — with every step reproducible
in Replay.

## 2. Golden operating loop

```
Store (抖音店A) → Product (LED灯带套装 3米, SKU-LED-005)
  → ContentProject (cproj-loop-led-strip)
  → ContentVersion v1 (AI-generated package)
  → ApprovalRequest (content_approval) → Approval Center
  → Approved → Ready to Publish
  → PublishJob + PlatformExecution (mock) → Published
  → TrafficAttribution (deterministic performance)
  → Order (attributed, Order Center)
  → Conversation (customer-service follow-up, Customer Service Center)
  → ReviewSnapshot (Content Project + review section)
  → Knowledge candidates (Agent Studio · Knowledge library, pending Founder confirmation)
  → ReplayRun (run-loop-led-strip) reconstructs every step above
```

The store and product are the **existing** demo records (`storesMock.js` store `store-1` /
抖音店A, `productMock.js` product with SKU `SKU-LED-005`, seeded as "LED灯带套装 3米" — the closest
existing match to the "家用智能感应灯带" scenario named in the task). No duplicate store or product
record was created; `ContentProject.productId` resolves to the real product id at seed time.

## 3. Entity relationships

All new/extended entities live in `frontend/src/console/mock/`, following the existing
`createLocalRepository` convention (one file per module, no second state-management library):

| Entity | Owner file | Key relationship fields |
|---|---|---|
| Store, Product | `storesMock.js`, `productMock.js` (existing, unchanged) | — |
| ContentProject | `contentMock.js` (extended) | `storeId`, `productId`, `contentVersions[]`, `approvalRequestId`, `publishJobId`, `orderId`, `conversationId`, `reviewSnapshotId`, `replayRunId` |
| ContentVersion | inline array on ContentProject | `contentProjectId` (implicit, array-scoped) |
| ApprovalRequest | `approvalMock.js` (extended) | `contentProjectId`, `contentVersionId`, `originatingModule/SubView/EntityId` |
| PublishJob, PlatformExecution | `operatingLoopMock.js` (new) | `contentProjectId`, `contentVersionId`, `publishJobId` |
| TrafficAttribution | `operatingLoopMock.js` (new) | `contentProjectId`, `contentVersionId`, `platformContentId` |
| Order | `orderMock.js` (extended) | `attribution.contentProjectId`, `attribution.contentVersionId` |
| Conversation | `dailyCustomerServiceMock.js` (extended) | `orderNumber`, `contentProjectId` |
| ReviewSnapshot | `operatingLoopMock.js` (new) | `contentProjectId`, `contentVersionId` |
| Knowledge candidate | `knowledgeMock.js` (extended, `status: "candidate"`) | `sourceProjectId`, `candidateType` |
| ReplayRun (business chain) | `replayMock.js` (extended) | keyed by `runId` = `ContentProject.replayRunId` |
| Deliverable | internal only (generated asset records inline on ContentVersion; no standalone module) | — |

Timestamps (`createdAt`, `updatedAt`, `submittedAt`, `approvedAt`, `publishedAt`) are set with
`new Date().toISOString()` only inside event-handler/orchestration functions — never during React
render. `frontend/src/console/mock/operatingLoopMock.js` documents this explicitly.

## 4. State machines

Defined and enforced in `operatingLoopMock.js` via `canTransitionContentProject` /
`canTransitionApproval` / `canTransitionPublishJob` — table-driven, no free-form string writes:

- **ContentProject**: Draft → Planning → Generating → Generated → Pending Approval → (Approved |
  Revision Requested) → Ready to Publish → Publishing → Published → Monitoring → Reviewed →
  Archived, with Failed as a recoverable branch.
- **ApprovalRequest**: reuses `approvalMock.js`'s existing `pending/approved/rejected/returned`
  vocabulary (not renamed — 8 pre-existing demo approvals and the Approval Center tabs depend on
  it) rather than introducing a second, differently-cased vocabulary. `returned` is the existing
  UI's "要求修改" (Revision Requested) label.
- **PublishJob**: Draft → Scheduled/Queued → Executing → Succeeded/Failed/Partially Succeeded,
  with retry from Failed back to Queued.
- **Order**: reuses the existing Order Center model unchanged (`pending_shipment` etc.).
- **Customer Service**: reuses the frozen 8-state Customer Service Center vocabulary unchanged.

Every orchestration function validates the transition before writing; an invalid transition
returns `{ ok: false, error }` and never mutates state. UI actions surface `error` via a toast and
disable/hide actions that are not currently valid.

## 5. Module ownership (no new modules)

| Concern | Owning module | What changed |
|---|---|---|
| Store/product selection, content generation, stage timeline, all loop actions | 内容中心 · 内容项目 | `ContentProjects.jsx` rewritten to be `entityId`-addressable; new `LoopProjectDetail`/`ReviewSnapshotCard` render the full loop inline for loop-enabled projects, unchanged legacy rendering for the 6 pre-existing demo projects |
| Approval queue, approve/reject/revise | 审批中心 | New columns (title, checks, token cost, pending duration), preview modal, reason-required reject/revise modal, "打开来源项目" cross-link |
| Publishing execution, connector state | 内容中心 (publish actions) + `operatingLoopMock.js` (contract) | New `platformExecutionContract` — mock only |
| Order attribution | 订单中心 | `OrderDetailModal` shows an attribution panel + cross-link when present; `entityId` auto-opens the matching order |
| Customer-service follow-up | 客服中心 · 日常客服 | `entityId`-addressable conversation detail; 2 new actions (`AI 回复`, `标记完成`) |
| Business review | 内容中心 · 内容项目 (inline) | `ReviewSnapshotCard` |
| Knowledge candidates | Agent 工作室 · Knowledge 资产库 | New "知识候选" section reusing the existing assets table (`status: "candidate"`) |
| Audit chain | 回放中心 | New "经营闭环回放" tab alongside the existing Agent-run-history tab |
| Cross-system awareness | AI 秘书处, 今日经营 | New conditional brief cards / stat grid, all deep-linking to real object ids |

## 6. Approval flow

`submitForApproval` creates one `content_approval` request (idempotent per `contentVersionId`),
visible immediately in Approval Center with store/product/originating-project context, AI
recommendation, and originality/copyright/compliance checks. `decideContentApproval` wraps
`approvalMock.decideRequest`: 批准 moves the project to `Approved`; 驳回/要求修改 both require a
non-empty reason/note and move the project to `Revision Requested`, preserving the existing
content version so Founder can regenerate without losing history.

## 7. Publishing execution contract

`operatingLoopMock.js` exports `platformExecutionContract` — `validateConnection`,
`validatePayload`, `prepareExecution`, `execute`, `getExecutionStatus`, `cancelExecution` — all
mock implementations with deliberately narrow scope: no real OAuth, cookies, browser automation,
platform login, publishing API, or account mutation. Connector states
(`not_connected/mock_connected/ready_for_configuration/authentication_required/permission_missing/
temporarily_unavailable`) are modeled but the golden path always demonstrates
`mock_connected` — never displayed as a real connection. Execution mode defaults to **Assisted
Execution**, labeled "演示已连接" / mock-only throughout.

## 8. Order attribution

`orderMock.createAttributedOrder` is idempotent on `attribution.contentVersionId` — a repeated
"模拟发布" click returns the existing order instead of creating a duplicate. The order carries
`attribution: { trafficSource, contentProjectId, contentVersionId, platformContentId,
campaignSource, conversionPath, attributedGmv }`; `campaignSource` is `null` metadata only — no
Campaign Center concept was introduced. The order detail modal cross-links back to the content
project.

## 9. Customer-service follow-up

`dailyCustomerServiceMock.createConversationForOrder` is idempotent on `orderNumber`. The seeded
scenario: a buyer asks whether the LED strip can be cut and installed behind a TV; the AI suggests
a cut-and-reconnect answer citing the product's knowledge asset. Two new mock actions were added
to the existing 7-action takeover set: `AI 回复` (appends a real AI reply, marks the conversation
resolved) and `标记完成`. `立即接管` reuses the existing human-takeover behavior — the AI assistant
panel stays visible after takeover, unchanged from the V4.3-prior Customer Service Center freeze.

## 10. Review and knowledge candidates

`generateReview` requires the project to already be published with both an order and a
conversation attached; it is idempotent (checked via `project.reviewSnapshotId`, not just the
loop state, so a second call reports "already generated" instead of a misleading "not yet
published" error). The review is rendered inline in the Content Project detail
(`ReviewSnapshotCard`) — never a separate results page. Review generation also creates exactly one
knowledge candidate per type (内容表现洞察/商品常见问题/平台发布经验) as `status: "candidate"`
rows in the existing `knowledgeMock.js` assets array — visible in Agent Studio's Knowledge library
under a dedicated "知识候选" section with 采纳为知识/驳回 actions. Nothing is written to production
Knowledge without that explicit Founder action.

## 11. Replay chain

`replayMock.js` gained a second, parallel concept alongside the existing Agent-run-history replay:
a business event chain keyed by `runId` (`appendReplayEvent`/`getBusinessChainRun`/
`listBusinessChainRuns`). Every orchestration function in `contentMock.js` appends one event per
step with module/actor/agent/prompt-version/skill-version/knowledge-refs/model/token-usage/
input-output summaries/business-object/previous-new state/approval-decision. Replay Center gained
a "经营闭环回放" tab to browse and inspect it — a read-only audit surface, not a second operating
workspace.

## 12. Mock-only limitations

No code path in this phase performs a real platform login, OAuth flow, cookie-based session, browser
automation, publishing API call, or account mutation. `platformExecutionContract.execute()` always
returns a `MOCK-` prefixed content id. All timestamps are demo data; all currency amounts are
demo. Every new/extended surface carries the existing "演示数据" badge convention.

## 13. Idempotency rules

| Action | Guard |
|---|---|
| Submit same content version twice | `approvalMock.createApprovalRequest` returns the existing pending request |
| Approve/reject an already-decided request | `approvalMock.decideRequest` checks `status === "pending"` first |
| Publish an already-published version | `contentMock.simulatePublish` requires `loopState === "Ready to Publish"`; `Published/Monitoring/Reviewed` short-circuits with `alreadyExists: true` |
| Duplicate PlatformExecution/PublishJob | `operatingLoopMock.createPublishJob` keyed by `contentProjectId` |
| Duplicate attributed order | `orderMock.createAttributedOrder` keyed by `attribution.contentVersionId` |
| Duplicate customer conversation | `dailyCustomerServiceMock.createConversationForOrder` keyed by `orderNumber` |
| Duplicate review | `contentMock.generateReview` keyed by `project.reviewSnapshotId` |
| Duplicate knowledge candidate | `knowledgeMock.createKnowledgeCandidate` is called once per type per review generation; re-running a review that already exists never re-creates candidates |

## 14. Testing results

- `frontend/src/console/mock/operatingLoopMock.test.js` — 19 unit tests: state-machine transition
  tables (valid chain, skip-ahead rejection, terminal-state rejection, unknown-state rejection,
  revision loop), stage-index mapping, deterministic performance data, platform execution contract
  validation.
- `frontend/src/console/mock/contentMock.test.js` — 18 tests: full golden path (generate → submit
  → approve → enter publishing → publish → review, asserting realistic non-placeholder content and
  real cross-entity linkage), rejection path (reason required, version preserved), revision path
  (note required, no duplicate project, regeneration appends v2), and idempotency for submit /
  approve / publish / review.
- Full existing suite: **129/129 tests pass** (92 pre-existing + 37 new).
- `npm run lint`: 0 errors, 4 pre-existing warnings unrelated to this work (`react-hooks/
  exhaustive-deps` in `OrderCenterModule.jsx` and `ProductCenterModule.jsx`, predating V4.3).
- `npm run build`: succeeds.
- Manual browser verification (live dev server, `?mode=founder`) walked the entire golden path —
  generate → submit → approve → enter publishing → publish → review — confirming: realistic
  Chinese content (no placeholder text), correct cross-links to Approval/Order/Customer
  Service/Replay, zero duplicate records, zero console errors at every step, deep-link auto-open
  in Order Center and Customer Service Center, invalid-id graceful fallback in Content Projects,
  and both `?module=afterSalesCenter` and `?module=deliverableCenter` continuing to fall back
  cleanly.
- One real bug found and fixed during this verification: `generateReview`'s idempotency guard was
  ordered after the state-guard, so a second call reported a misleading "not yet published" error
  instead of "already reviewed" — fixed by checking `reviewSnapshotId` first (see commit diff,
  `contentMock.js`).

## 15. Deferred real-integration work

Not built in this phase (tracked here, not implemented): real platform OAuth/session management;
real publishing API integration behind `platformExecutionContract`; real traffic/order webhook
ingestion (currently deterministic mock); real customer-service message delivery; persisting the
operating loop server-side (currently `localStorage` only, per-browser); Campaign Center (frozen
as deferred to V5 per the architecture freeze); any second loop-enabled content project (the
golden path currently demonstrates the mechanism with one project — extending it to arbitrary
projects is mechanical but out of this phase's scope).

---

Chief Software Architect

AI Commerce OS
