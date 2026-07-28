# Edition Architecture — Founder, Operator, Operator Cloud, Studio

Version

2.0

Date

2026-07-27

Status

Frozen (product positioning). §1–§12 (the three-edition freeze, amended 2026-07-26) are unchanged.
§13–§16 record the 2026-07-27 "AI Commerce OS Four-Product Architecture V1" freeze: **AI Commerce
OS Studio** is added as the fourth formal product end, alongside Founder, Operator Cloud and
Operator. Nothing in §1–§12 is superseded by this — Studio is additive, not a replacement for any
existing edition's identity or boundary.

Scope

The three AI Commerce OS product editions and their long-term relationship. Refines the product
identity of the edition boundary established in
[ADR-0002 Edition Boundary](../10-adr/ADR-0002-edition-boundary.md) — the technical
enforcement mechanism ADR-0002 defines (Core/Edition separation, `require_edition`, the build
manifest, the Data Ownership Matrix) remains in force unchanged. This document is the final,
authoritative statement of *what each edition is for and who it is for*; ADR-0002 remains the
authoritative statement of *how the boundary between them is technically enforced*. See §0 for the
precise reconciliation.

---

## 0. Relationship to ADR-0002

ADR-0002 (2026-07-22) named four editions — Developer, Operator, Device Admin, Operator Cloud —
before the Founder Operator Edition console (`frontend/src/console/`, `?mode=founder`) existed. This
document supersedes ADR-0002's *naming and product-identity* layer as follows, while leaving every
technical rule in ADR-0002 (Core Principles, Permission Boundary, Build Boundary, Data Ownership
Matrix, Prohibitions) intact:

| ADR-0002 name | Final product identity (this document) |
|---|---|
| Developer Edition (`/`, `EDITION=developer`, `frontend/src/App.jsx`) | Today: unchanged developer/engineering workspace. **Final direction: Operator Cloud** (§3). Not renamed in code yet — see §10. |
| Operator Edition (`?mode=operator-preview`, `frontend/src/operator-preview/`) | Unchanged — this document's Operator Edition (§2) is the same product ADR-0002 defined, still the local Mac mini OS. |
| Device Admin Edition | Not a fourth top-level product edition. Remains what ADR-0002 already described it as: a restricted diagnostic role *within* an Operator Edition Mac mini deployment (`EDITION=device-admin`), never sold or positioned separately. No change to ADR-0002's Device Admin scope. |
| *(not present in ADR-0002)* | **Founder Edition** (`?mode=founder`, `frontend/src/console/`) — new, added by this document (§1). Did not exist when ADR-0002 was written; formalized by the Founder V4 architecture freeze (§12) and now given its final product identity here. |

Nothing in this document changes `backend/app/core/edition.py`, `scripts/editions/manifest.py`, or
any enforcement code. It is a product-positioning freeze, not a re-implementation.

---

## 1. Founder Edition

**Formal definition:** AI Commerce OS Founder Edition = the founder's private, complete operating
and product-validation system.

**Entry point:** `http://localhost:5173/?mode=founder` → `frontend/src/console/` (`ConsoleApp`).

**Primary users:** The founder and a very small number of trusted internal users. Not a public
SaaS console.

**Deployment location:** The founder's own machine(s) — today local development, later the
founder's own operating environment. Never shipped to a customer's Mac mini.

**Responsibilities:**
- Operate the founder's own real stores.
- Connect and test new commerce platforms.
- Develop and validate new product capabilities.
- Test Agents, Prompts, Skills, Knowledge, Tools and Models.
- Validate automation safety.
- Run complete business workflows end to end (see §12–13).
- Inspect Approval, Replay, Evaluation and Benchmark.
- Serve as the complete upstream product baseline Operator Edition is derived from.

**Status:** The most complete business-operating edition in the system, and the main development
line until the first real store is successfully connected and operated (§10, Priority 1).

---

## 2. Operator Edition

**Formal definition:** AI Commerce OS Operator Edition = the local intelligent operating system
delivered on each operator's Mac mini.

**Entry point (current prototype):** `http://localhost:5173/?mode=operator-preview` →
`frontend/src/operator-preview/` (`OperatorPreviewApp`).

**Primary users:** Customers who purchase an AI Commerce OS Mac mini device.

**Deployment location:** The operator's own Mac mini, on-site, one device per customer.

**Responsibilities:**
- Operate the customer's own stores.
- Manage products, content, orders and customer service.
- Receive AI recommendations.
- Approve important actions.
- Take over from AI when necessary.
- View Token balance and usage.
- View device and service status.
- Receive authorized OTA updates.

**Relationship to Founder Edition:** Operator Edition is not an independent, separately-built
product. It is *derived* from Founder Edition's stable capabilities through edition policy —
permissions, feature flags, tenant boundaries, package entitlements, and simplified navigation and
configuration on top of the same shared Core and shared business UI (§5–6). It must never expose
Runtime, Task, Consumer, Prompt, Migration, Docker, raw JSON, source code or Git concepts —
unchanged from ADR-0002's Prohibitions.

---

## 3. Operator Cloud

**Formal definition:** AI Commerce Operator Cloud = the cloud platform for tenant, device,
license, metering, maintenance and OTA management.

**Entry point:** `http://localhost:5173/` (currently still labeled Developer Edition in code and
in ADR-0002 — see §10 for why this is intentional and temporary).

**Primary users:** The platform owner's internal operations, technical-support and
device-management team. Never the store operator.

**Deployment location:** A distinct, multi-tenant cloud service. Never deployed to a customer's
Mac mini.

**Responsibilities:**
- Operator and tenant management.
- Mac mini device registration.
- Device ownership and binding.
- Online/offline heartbeat.
- Version visibility.
- System-health monitoring.
- License and package management.
- Feature entitlement.
- Token accounting and recharge.
- OTA release management (stable/beta/canary channels, upgrade scheduling, upgrade status,
  failure retry, rollback).
- Remote diagnostic authorization.
- Support and maintenance records.

**Boundary:** Operator Cloud must never become the daily store-operating interface — that is
Operator Edition's job. Operator Cloud manages the chain:

```
Operator → Device → Operator instance → License → Package → Token account → Software version → OTA → Health and support
```

---

## 4. Security and data boundaries

Unchanged from ADR-0002's Data Ownership Matrix and Permission Boundary, restated here per edition:

| Boundary | Founder | Operator | Operator Cloud |
|---|---|---|---|
| Business data (products/orders/shops/etc.) | Founder's own stores, founder-owned | Each operator's own device-local database, operator-owned; never visible to another operator | Not stored here — Operator Cloud holds tenant/device/license/Token metadata, not the operator's business data |
| Secrets (platform credentials, LLM keys) | Founder-local, never logged/shipped | Device-local, never logged/shipped | Cloud-side secrets are for device/license management, never the operator's shop credentials |
| Upgrade discipline | N/A (founder controls own environment) | An application upgrade never overwrites device-local business data, credentials or message history (ADR-0002 Principle E) | Operator Cloud issues OTA releases; it does not reach into an operator's business database directly |
| Least privilege | Full access (founder) | Restricted to the operator's own tenant | Restricted to platform-owner staff; never store-operating access |

---

## 5. Capability-sharing relationship

Founder Edition and Operator Cloud are **not** parent/child UI variants of one another — they
belong to different domains (business-capability vs. cloud-management) and share no UI. Founder
and Operator, by contrast, **share business capabilities**: the same Core, the same shared business
UI components, the same Agent/Prompt/Skill/Knowledge/Tool/Model layer — Operator is a permissioned,
simplified view over the same capability surface Founder validates first. This is the same "One
Core, Multiple Editions" principle ADR-0002 already established (§ Core Principles); this document
does not change it, only names the specific relationship between the three final editions:

```
Founder Edition               creates and validates operating capabilities
        ↓
Operator Edition               delivers stable capabilities to Mac mini operators
        ↓
Operator Cloud                 manages devices, licenses, metering, health and upgrades
```

More precisely: Founder creates and validates business capability. Operator delivers that
capability to customers. Operator Cloud manages the commercial and technical lifecycle of deployed
devices.

---

## 6. Edition-policy principle

Operator Edition must never be built as a second, independently-maintained codebase. The
intended long-term architecture (documented here as direction only — **not implemented in this
task**, see §11):

```
Core Domain
Agent Runtime
Workflow Engine
Platform Connectors
Shared Business UI
Edition Policy
Founder Shell
Operator Shell
Cloud Console
```

- **Founder Edition** = Founder Shell + complete Edition Policy + full business and AI
  capabilities.
- **Operator Edition** = Operator Shell + operator Edition Policy + tenant and package
  restrictions.
- **Operator Cloud** = Cloud Console + Tenant Domain + Device Domain + License Domain + Token
  Metering Domain + OTA Domain + Support Domain.

A capability difference between Founder and Operator is always an Edition Policy decision
(permission/flag/entitlement), never a second implementation of the same business logic — the
same rule ADR-0002 already states for Developer/Operator/Device Admin, now extended explicitly to
Founder.

---

## 7. Operator Cloud domain boundary

Operator Cloud owns exactly these domains, and nothing else:

- **Tenant Domain** — operator and tenant records.
- **Device Domain** — Mac mini registration, ownership/binding, online/offline heartbeat, version
  visibility.
- **License Domain** — license and package management, feature entitlement.
- **Token Metering Domain** — Token accounting and recharge (platform-owner side; distinct from
  each operator's own Token balance view inside Operator Edition).
- **OTA Domain** — release channels, scheduling, status, retry, rollback.
- **Support Domain** — remote diagnostic authorization, support and maintenance records.

Operator Cloud does not own: product/order/customer-service data (Operator Edition, device-local),
Agent/Prompt/Skill/Knowledge validation (Founder Edition), or any day-to-day store-operating
workflow.

---

## 8. Development priority

Frozen order:

1. **Priority 1** — Founder Edition real-store integration and real operating validation.
2. **Priority 2** — After Founder capabilities are stable, simplify and release Operator Edition
   from Founder capability.
3. **Priority 3** — Before external Mac mini delivery scales, implement Operator Cloud device,
   license, Token and OTA management.

Current state:
- Founder Edition is the only active product-development mainline.
- Operator Preview is preserved but does not receive parallel feature development.
- The current default/Developer interface is preserved but does not receive broad cloud
  implementation yet.
- No real-store integration was started by this task (see §16 of the companion final report).

---

## 9. Relationship to Founder V4 architecture freeze

[founder-v4-architecture-freeze.md](founder-v4-architecture-freeze.md) froze the Founder Edition's
internal navigation tree (18 modules, 5 groups) and module boundaries. This document does not
alter that freeze or its tag (`founder-v4-architecture-freeze`, unchanged) — it sits one layer
above it, defining what Founder Edition *is* as a product, while the frozen document defines what
Founder Edition *contains*. Any future first-class module addition inside Founder Edition still
requires the unfreeze process that document defines.

## 10. Relationship to Founder V4.3 operating loop

[founder-v4-3-operating-loop.md](founder-v4-3-operating-loop.md) demonstrated one real operating
loop (store → product → content → approval → publish → order → customer service → review) entirely
in mock data, inside Founder Edition. It is the concrete evidence that Founder Edition's capability
surface is coherent enough to be the thing Operator Edition eventually derives from (§5). Priority 1
(§8) — real-store integration — is the next step after the mock loop, still entirely inside Founder
Edition; it is explicitly not started by this task.

## 11. Deferred work

Not implemented by this task (2026-07-25 revision), recorded here as direction only. **Update
2026-07-26 (§12): the second and third bullets below are now implemented** — the historical
bullets are kept for record, not deleted; see §12 for what actually shipped and what is still
deferred after it.

- The Core Domain / Agent Runtime / Workflow Engine / Platform Connectors / Shared Business UI /
  Edition Policy / Founder Shell / Operator Shell / Cloud Console split (§6). Today the three
  entry points (`App.jsx`, `OperatorPreviewApp.jsx`, `ConsoleApp.jsx`) are separate top-level
  React trees selected at runtime by `main.jsx`, not yet factored into shared shells over a common
  Edition Policy layer. **Still deferred** — §12 adds a real `shared/editionPolicy.js` and a real
  `shared/agentEvolution/` domain layer, but the full Core/Runtime/Connector split remains
  direction-only.
- Renaming the `/` entry point's code identity from Developer to Operator Cloud, or building any
  Operator Cloud UI (Tenant/Device/License/Token Metering/OTA/Support domains, §7). **Implemented**
  — `/` now renders `frontend/src/cloud/CloudConsoleApp.jsx`; see §12.
- Graduating `operator-preview/` out of prototype status (already tracked as Migration Plan Phase
  1 in ADR-0002 — unchanged, still pending). **Partially addressed** — a new AI Growth page was
  added inside it (§12) without changing its overall prototype status.
- The Device Admin frontend (ADR-0002 Migration Plan Phase 2 — unchanged, still pending).
- Per-edition build/package pipeline and JS bundle splitting (ADR-0002 Migration Plan Phase 3 —
  unchanged, still pending).
- Founder Edition real-store integration (Priority 1, §8) — the next active work, not started
  here.

---

## 12. Relationship to the Agent Evolution Foundation

[agent-evolution-foundation.md](agent-evolution-foundation.md) records the concrete work done by
the "Agent Evolution + three-edition final positioning" task (2026-07-26): a shared
`editionPolicy.js` that actually gates UI actions per edition (not just a document), a shared
`agentEvolution/evolutionMock.js` domain layer (memory, reflection, learning candidates,
evaluation, experiment, promotion, rollback, purification, cost intelligence) consumed by Founder's
Agent Studio, Operator's new AI Growth page, and — for device/OTA/support concerns — Operator
Cloud's console. It also flips the default `/` route from Developer to Operator Cloud, per §3 and
§11. It does not implement the full Core/Runtime/Connector split (§6, §11) — that remains direction
only — but it does give Founder, Operator and Operator Cloud a first real, shared, tested
foundation to derive future work from instead of three independent mock islands.

---

## 13. AI Commerce OS Studio

**Formal definition:** AI Commerce OS Studio = the content production and traffic/advertising
operations platform. English architectural label: **Content Plane**.

**Entry point:** `http://localhost:5173/studio` (path alias) or `?mode=studio` (query override) →
`frontend/src/studio/` (`StudioApp`). See §14.4 for the routing mechanism.

**Primary users:** Content producers, matrix-account operators, and internal/external advertising
buyers. Can be operated as an independent content/media business, or as a supplier to Operator.

**Deployment location:** Same distribution model as Founder/Cloud today (local development now,
its own operating environment later) — Studio is not shipped to a customer's Mac mini as part of
the Operator install; it is a separate product surface.

**Responsibilities:**
- **Content production** — AI short dramas, AI video, AI live streaming, AI digital humans, AI
  images/audio, scripts, storyboards, editing, subtitles, voiceover, covers.
- **Content operations** — content projects, production pipeline, content calendar, review,
  publishing, versioning, the asset library, IP assets, copyright status.
- **Matrix operations** — matrix accounts across Douyin/Xiaohongshu/Kuaishou/Video-号/Bilibili/etc,
  account grouping, positioning, health, follower scale, content volume, traffic data, account
  revenue.
- **Traffic operations** — the traffic pool, advertising resources/inventory, advertising quotes,
  advertising orders, delivery, performance, settlement; selling traffic to Operator and to
  external customers.

**Core value:** use AI to create content → let content accumulate into content assets → let
accounts accumulate into matrix assets → let traffic accumulate into advertising resources →
monetize through advertising, revenue share, licensing, or content services.

**Product-language rule (extends §9's "no raw Connector in customer-facing copy"):** Studio's
user-facing copy uses **平台账号 / 账号授权 / 发布连接 / 账号健康** (platform account / account
authorization / publish connection / account health), never the bare word "Connector" — the
underlying code may still use `ConnectorDefinition` (`shared/domainTypes.js`), this rule is about
UI copy only, identical in spirit to Founder's "电商平台连接器" / Operator's "店铺接入" / Cloud's
"Operator Cloud 连接" conventions.

---

## 14. Four-Product Architecture V1

### 14.1 Top-level relationship

```
AI Commerce OS Founder
  creates and validates capability
        ↓
AI Commerce OS Operator Cloud
  manages, authorizes, publishes, distributes and schedules capability
        ↓
AI Commerce OS Operator
  operates products, customers, orders, advertising and profit
        ↕
AI Commerce OS Studio
  produces content, operates matrix traffic, and supplies advertising resources to Operator
```

All four belong to one internal system, AI Commerce OS, but face different users, carry different
responsibilities, and use different business language (§9, extended by §13's Studio rule).

### 14.2 Product Responsibility Matrix

| | Founder | Operator Cloud | Operator | Studio |
|---|---|---|---|---|
| Architectural label | Innovation Plane | Control Plane | Business Plane | Content Plane |
| Primary responsibility | Create and validate capability | Manage, authorize, publish, distribute, meter, schedule capability | Operate the business (products/customers/orders/advertising/profit) | Produce content, operate matrix traffic, operate advertising resources |
| Owns capability packages | Produces `CapabilityPackage` (Agent/Prompt/Skill/Workflow/Knowledge/Connector/UI) | Reviews, versions (`ReleasePackage`), gray-releases, distributes, rolls back | Installs and uses released capability | Installs and uses released capability |
| Owns business data | Founder's own stores (full access) | None — only tenant/device/license/Token/OTA metadata, never raw business data | Each operator's own device-local business data | Studio's own content/matrix/traffic/advertising data |
| Owns money flow | N/A (validation environment) | Token purchase/allocation/metering (platform-owner side) | Advertising spend is a **cost** (demand side); product/platform/logistics/after-sales costs; contribution profit | Advertising revenue is **revenue** (supply side); content/traffic monetization |
| Must never expose | — (has full technical access by design) | Store-operating UI (§3) | Prompt authoring, Skill development, Connector internals, Webhook retries, Model Router config, Agent evaluation (§2, extended by 四端 V1 §2) | Same technical internals as Operator — Studio's business users see 平台账号/账号授权, not Connector/API/Webhook/Rate Limit (§13) |

### 14.3 Founder / Cloud / Operator / Studio boundary

- **Founder** — creates and validates capability. Must contain the complete superset of Operator's
  functionality (unchanged principle from §1 — "Founder must include all of Operator's
  capabilities; Founder is not a premium tier of Operator").
- **Operator Cloud** — manages, authorizes, publishes, distributes and schedules capability (§3,
  §7), extended in this freeze to include the distributed-compute control plane (§15).
- **Operator** — uses capability to operate its own business and generate profit. The operator
  does not need to understand how Prompts are written, how Skills are built, how Connectors are
  implemented, how webhooks retry, how the Model Router is configured, or how Agents are
  evaluated — they see AI recommendations, approve/reject, adjust budgets, see results, costs,
  profit and exceptions (§2, unchanged; restated because Studio's boundary depends on it).
  **AI 广告投放 (AI advertising placement) remains a first-class Operator business capability**,
  distinct from **AI 广告素材 (AI advertising creative)**: creative production (images/video/copy/
  live materials) is a production capability; advertising placement (product/audience/platform/
  budget/timing/bid/optimization/pause/profit-attribution selection) is a decision-and-execution
  capability. The placement flow is fixed: AI generates a placement plan → operator reviews →
  approve / reject / adjust budget → system executes within the approved envelope → AI keeps
  monitoring → over-budget or material changes require re-approval. Advertising spend always
  flows into operating cost and contribution-profit accounting (see
  `shared/agentEvolution/evolutionMock.js`'s `computeContributionProfit`, reused by Operator's
  广告投放 module — see [operator-advertising.md](../09-runbooks/operator-advertising.md)).
- **Studio** — uses capability to produce content, accumulate traffic, and operate advertising
  resources (§13).

**Operator vs. Studio content boundary:** content Operator produces is primarily for that
operator's own product sales, store operations and brand marketing. Content Studio produces can be
independently published, operated and monetized, forming traffic and advertising resources that
can be sold externally.

**Operator vs. Studio advertising boundary:** Operator is the **advertising demand side** — it
places ads for its own products; advertising spend is an operating cost. Studio is the
**advertising supply side** — it builds a traffic pool and sells advertising resources; advertising
revenue is operating revenue.

**Future closed loop (data-model-only in this freeze — no live cross-product settlement exists
yet):**

```
Operator's advertising Agent raises a traffic need
  → compares commerce-platform advertising vs. Studio traffic resources
  → estimates cost and contribution profit
  → operator approves
  → placement executes
  → Operator records advertising cost
  → Studio records advertising revenue
```

This freeze only establishes this product relationship and its data shapes
(`AdvertisingResource`, `AdvertisingOrder` in `shared/domainTypes.js`) — it does not implement real
cross-product advertising settlement.

### 14.4 Routing

Four independent entry points, each with its own home page and its own left-hand navigation, none
overriding another:

| Product | Path alias | Legacy query override | Entry component |
|---|---|---|---|
| Operator Cloud | `/cloud` | bare `/` (default), `?mode=` unset | `frontend/src/cloud/CloudConsoleApp.jsx` |
| Founder | `/founder` | `?mode=founder` | `frontend/src/console/ConsoleApp.jsx` |
| Operator | `/operator` | `?mode=operator-preview` | `frontend/src/operator-preview/OperatorPreviewApp.jsx` |
| Studio | `/studio` | `?mode=studio` | `frontend/src/studio/StudioApp.jsx` |

Resolution order (`frontend/src/editions/editionConfig.js`, `getActiveEdition()`): build-time
`VITE_EDITION` → path alias (`/cloud`, `/founder`, `/operator`, `/studio`) → legacy `?mode=` query
param → default (Operator Cloud). Path aliases and the legacy query mechanism are fully backward
compatible with each other — no old link is broken, and path aliases were added rather than
replacing the query mechanism specifically so existing bookmarks/links (`?mode=operator-preview`
etc.) keep working unchanged.

**Deployment note:** path aliases rely on the dev/production server falling back to `index.html`
for unmatched paths (SPA history fallback) — verified working today under Vite's dev server
(`npm run bootstrap`'s `vite dev`, the only serving mode this repository currently uses). If a
future production deployment serves the built `dist/` from a plain static file server without SPA
fallback configured, the path aliases need an explicit rewrite rule (e.g. nginx `try_files ...
/index.html`); the legacy `?mode=` query mechanism has no such dependency since it always loads
`index.html` for `/` and reads the query client-side.

Every one of the four root apps renders under a shared top-level `ErrorBoundary`
(`frontend/src/main.jsx`) in addition to each product's own per-page/per-module `ErrorBoundary` —
a render failure in one module or in a Shell's own top-level render path never blanks the whole
page.

### 14.5 Release and distribution flow

```
Founder
  → produces a candidate CapabilityPackage
  → Operator Cloud reviews it, versions it into a ReleasePackage, gray-releases and distributes it
  → Operator and Studio install and use it
  → run summaries and cost data (TokenUsage, ComputeUsageRecord) flow back to Cloud
  → Founder iterates further based on real operating results
```

This is the same lifecycle §5/§6 already established for Founder→Operator; this freeze extends it
to formally include Studio as an equal consumer of Operator Cloud's release pipeline, and adds the
explicit "usage/cost data flows back to Cloud" closing step. See `shared/domainTypes.js` for the
`CapabilityPackage` / `ReleasePackage` shapes this flow is built on.

### 14.6 Shared domain model

`frontend/src/shared/domainTypes.js` defines the cross-product core domain concepts (JSDoc
typedefs — this repository has no TypeScript build, so these are documentation-and-editor-hint
typedefs, not compiler-checked types) that all four products should reference rather than each
inventing an incompatible shape: `ProductApp`, `CapabilityPackage`, `ReleasePackage`, `Device`,
`License`, `TokenAccount`, `TokenUsage`, `AgentDefinition`, `PromptVersion`, `SkillDefinition`,
`WorkflowDefinition`, `ConnectorDefinition`, `BusinessUnit`, `Store`, `ContentProject`,
`ContentAsset`, `MatrixAccount`, `TrafficResource`, `AdvertisingResource`, `AdvertisingOrder`.
Distributed-compute types (`ComputeTask`, `ComputeAssignment`, etc.) live in their own file — see
§15 and `shared/distributedCompute/types.js`.

Each product may still build its own page-level ViewModels on top of these shapes; the requirement
is that the underlying domain concept and field names are shared, not that every UI reuses one
literal data structure.

**`Device` note (four-端 V1 hard requirement):** the five device-timing/status concepts are kept as
five distinct fields, never collapsed into one: `lastHeartbeatAt` (most recent heartbeat time) ≠
`onlineStatus` (current online/offline/degraded status, inferable from heartbeat recency but stored
independently) ≠ `currentSessionStartedAt` (when the current online session began) ≠
`uptimeSeconds` (this session's continuous uptime) ≠ `availabilityRate` (a rolling availability
ratio, its own independent statistic, not derived in real time from heartbeat alone).

---

## 15. Distributed compute — pointer

The Mac-mini idle-compute distributed-scheduling capability (Operator Runtime → Business
Scheduler / Local AI Runtime / Resource Monitor / Platform Compute Agent / Task Sandbox; the
`distributedCompute.enabled` feature flag defaulting to `false`; the P0–P4 priority model; the
`DeviceResourceProfile` / `ComputeParticipationPolicy` / `ComputeTask` / `ComputeAssignment` /
`ComputeUsageRecord` domain types; the security/sandboxing/kill-switch requirements) is documented
in full in its own file to keep this document from growing an unrelated, fast-moving appendix:

→ [distributed-compute-architecture.md](distributed-compute-architecture.md)

Summary for this document's purposes only: Cloud's "分布式调度" nav item, Studio's "算力任务" page,
and Operator's "设备资源" card (§13's Studio page, §2's Operator constraints) all read from the same
`shared/distributedCompute/` mock repository and the same feature flag — no product invents its own
parallel notion of "is distributed compute on."

---

## 16. Studio and distributed-compute deferred work

Recorded here in the same spirit as §11 (deferred work), for the 2026-07-27 four-product freeze:

- Real cross-product advertising settlement between Operator and Studio (§14.3's "future closed
  loop") — data shapes exist (`AdvertisingResource`, `AdvertisingOrder`), no live settlement.
- Real platform-account OAuth/publish integration for Studio's matrix accounts — mock only, see
  [studio-domain-overview.md](studio-domain-overview.md).
- Any real distributed-compute dispatch — see
  [distributed-compute-architecture.md](distributed-compute-architecture.md) for the complete list
  of what is deliberately not implemented and why.
- Per-edition build/package pipeline extended to Studio (ADR-0002 Migration Plan Phase 3, already
  deferred for the other three editions — unchanged).
- The full Core/Runtime/Connector split (§6, §11) remains direction-only; Studio was added as a
  fourth top-level React tree selected by `main.jsx`, following the exact same pattern as the
  other three, not a new architecture.

---

## 17. Founder superset + first real store live pilot — pointer

Founder's real-store access-mode model (`MODE_MOCK`→`MODE_SANDBOX`→`MODE_LIVE_READONLY`→
`MODE_LIVE_APPROVAL`→`MODE_LIVE_AUTOMATED`, the last never default-enabled) and the Store Platform
Adapter that implements it are documented in their own file, in the same spirit as §15:

→ [founder-superset-live-pilot.md](founder-superset-live-pilot.md)

Summary for this document's purposes only: `frontend/src/shared/storePlatform/` adds the adapter/
credential/sync layer the real backend shop service (§14.3, Stage 8E) deliberately left out. Prompt/
Model Arena, the Real Operation Task Workbench, and Token Cost Ledger extensions remain unbuilt —
see that document's §5 for the explicit list. Founder's nav structure and its single-source
relationship with Operator/Studio is now governed by §18 below, superseding the "fifth nav group"
description this section used to carry.

## 18. Founder Product Shell Consolidation (M8b) — single-source architecture, frozen rules

Following Phase 1 (§17), the user issued a binding follow-up: **Founder is the sole daily
development and acceptance entry point going forward.** The owner will not open standalone
Operator/Studio to validate day-to-day work, but standalone Operator/Studio must keep working
unmodified, because they are the future per-Mac-mini customer deployment shape (§8 already
established Operator's `frontend/src/operator-preview/` packaging; Studio now has its own manifest
entry too, see below). Full detail: [founder-superset-live-pilot.md](founder-superset-live-pilot.md)
§6-§10. This section freezes the resulting rules as permanent architecture, not phase-scoped notes.

### 18.1 Founder nav: six groups, no duplicate business menus

Founder's `console/nav/navConfig.js` is collapsed into exactly six top-level groups: **Founder
总览 / 产品研发中心 / Operator 实验室 / Studio 实验室 / Marketplace 中心 / 系统与发布**. Founder must
never again show a standalone top-level "店铺中心"/"内容中心"/"AI直播中心"/"流量网络中心"-style menu
that duplicates capability Operator Lab or Studio Lab already renders — if such capability exists,
it belongs inside one of those two groups (or, for content/live/traffic, purely inside Studio's own
registry, reached via Studio Lab). A `MODULE_REDIRECTS` table in the same file means any old
`?module=` bookmark for a retired key still lands on the correct page instead of 404ing.

**Known, tracked exception (not silently dropped):** `productCenter`/`orderCenter`/
`customerServiceCenter`/`approvalCenter` remain Founder-only for now — promoting them requires the
same Page/Content extraction Store went through (§18.2), not yet done for these four. They are
grouped next to "Operator 实验室" and each carries a visible "待同步" badge in the sidebar
(`console/shell/ConsoleSidebar.jsx`) rather than being hidden.

### 18.2 Single-source rule (enforced, not aspirational)

**Operator's and Studio's own registries are the only source of their business pages.**
`operator-preview/helpers/navigation.js` + `operator-preview/pageRegistry.jsx` for Operator;
`studio/navConfig.js` + `studio/pages/index.jsx` for Studio. Founder's `OperatorLab`/`StudioLab`
import these exact registries — never a copy. The one allowed per-host difference is a
**`founderOverlay` prop** (Operator) — only Founder's host passes a non-empty value, injecting a
Founder-only diagnostic tab (e.g. "平台连接器"); standalone Operator always gets `undefined` and
renders the plain business view. This is the concrete instance of "FounderOperatorOverlay" — a
props-based injection point, never a forked page.

**Hard rules going forward** (enforced by §18.3's boundary checker, not just documented intent):

1. A new Operator business page is added to `operator-preview/`'s own registry — never only inside
   `console/labs/OperatorLab.jsx`.
2. A new Studio business page is added to `studio/`'s own registry — never only inside
   `console/labs/StudioLab.jsx`.
3. Founder-exclusive R&D pages (Agent/Prompt/Skill/Workflow/Model Router/Evaluation/Replay/Release
   Candidate/Risk Policy/Feature Flag) stay under `console/modules/` and the 产品研发中心 nav group;
   they never leak into `operator-preview/` or `studio/`'s registries.
4. Anything genuinely shared across Operator and Studio (e.g. Marketplace browsing, §19) lives under
   `frontend/src/shared/` as one component filtered by a `theme`/`targetProduct` parameter — never
   two separately-maintained implementations.
5. Shared components under `frontend/src/shared/` must never import from `console/` or depend on
   Founder-only context (`ConsoleNavContext`, Founder's `ToastProvider`) to render — they take plain
   props instead, so any host (Founder, standalone Operator, standalone Studio) can render them.

### 18.3 Edition boundary checker: closed a real blind spot

`scripts/editions/manifest.py` previously only forbade `frontend/src/pages/` (Developer-only) for
the `operator` customer package — it never forbade `frontend/src/console/` (Founder-only), so
nothing would have caught a future `operator-preview/` file importing Founder R&D code even if the
UI looked correctly collapsed. Fixed: `console/` is now forbidden for `operator`, `studio`, and
`device-admin`; a `studio` manifest entry was added (it didn't exist before — Studio's customer
package boundary was previously unchecked); `operator`/`studio` also forbid importing each other's
product tree and `cloud/`. `python3 scripts/editions/check_boundary.py --edition all` must stay
clean — it is part of the required verification sweep for any change touching `console/`,
`operator-preview/`, or `studio/`.

### 18.4 Marketplace — cross-product module, not a fifth product end

Marketplace (`frontend/src/shared/marketplace/`) is a shared AI-capability-market module read by
three different views, not a fifth product end (the four-product roster in §14.1 is unchanged):
Founder's `console/labs/MarketplaceCenter.jsx` sees every `CapabilityPackage` regardless of review
state (production/review/pricing/license/release-channel/version/rollback/developer-directory
management); Operator's and Studio's own nav gained a "能力市场" item rendering the same
`shared/marketplace/MarketplaceBrowser.jsx` component (`theme="operator"|"studio"`), filtered to
`status===APPROVED` packages whose `targetProducts` include that product or `"shared"`. §19.4
refines Marketplace's *authoritative-owner* framing (Operator Cloud) — this section's
three-view-sharing description is still accurate and unchanged.

## 19. Founder Unified Product Navigation and Cloud Marketplace Consolidation (M8c)

The owner reviewed M8b's result via real screenshots and rejected one specific implementation
choice: clicking "Operator 实验室"/"Studio 实验室" in Founder's sidebar re-rendered a **second,
nested product sidebar** (`OperatorNav`/Studio's own `.st-sidebar`) inside Founder's content area —
"Founder 左侧的 Operator 实验室下面又出现了一整套 Operator 侧边栏." This section documents the fix,
plus two related corrections requested in the same round: distinguishing the three products'
"secretary" concept, and correcting Marketplace's deployment-authority framing. Full detail:
[founder-superset-live-pilot.md](founder-superset-live-pilot.md) §11-§14.

### 19.1 contentOnly rendering — no nested product shell, ever

`console/labs/OperatorLab.jsx` and `console/labs/StudioLab.jsx` no longer render `OperatorNav` or
Studio's `.st-sidebar` at all. They are now pure **controlled content renderers**: given
`activePage`/`subView` and an `onNavigate` callback, they render exactly one page component from
`operator-preview/pageRegistry.jsx` / `studio/pages/index.jsx` — nothing else. All product
navigation state (`activePage`) lives in Founder's own `ConsoleNavContext`
(`{module:"operatorLab"|"studioLab", subView}`), not in a separate `useState` inside the Lab
component — `OperatorLabConnected.jsx` / `StudioLabConnected.jsx` are the only place translating
between the two. This is why "current sub-item highlighted," "refresh restores state," and "browser
back/forward work" all fall out of the *existing* URL-synced nav mechanism (`useConsoleNav.js`) for
free — nothing new had to be built for those requirements.

### 19.2 Operator's and Studio's full navigation renders directly inside Founder's one sidebar

`console/shell/ConsoleSidebar.jsx` imports `OPERATOR_NAV_ITEMS`
(`operator-preview/helpers/navigation.js`) and Studio's `NAV_ITEMS` (`studio/navConfig.js`)
**directly** and renders them as an expandable sub-list under each product's accordion header —
still literally the same arrays standalone Operator/Studio render from, so there is no second
navigation array to keep in sync (§18.2's single-source rule, now enforced one level deeper: not
just "same page registry" but "same nav item list, rendered in the same host"). Founder-only
siblings in the Operator group (真实店铺接入, and the four `pendingOperatorParity` modules from
§18.1) render above a visual divider, ahead of Operator's own unmodified item list — this is the
concrete shape of "Founder增强层通过...slot...注入," not a fork of Operator's nav.

### 19.3 Founder sidebar: collapsible accordion, single expansion

`产品研发中心` / `Operator 实验室` / `Studio 实验室` / `Marketplace 中心` / `系统与发布` are each a
collapsible section (`aria-expanded`/`aria-controls` on the toggle button); `Founder 总览` stays
always-visible. Exactly one section is expanded at a time (clicking a second section collapses the
first). The section containing the currently-active module is force-expanded on every render
(state adjustment during render, not a `useEffect`, per
[React's documented pattern](https://react.dev/learn/you-might-not-need-an-effect) — avoids an
extra cascading render and the `react-hooks/set-state-in-effect` lint rule this repo enforces).
Expansion state persists across reloads via `console/nav/sidebarExpansionStore.js`
(localStorage, no credentials). The brand/logo row is a non-scrolling flex child
(`.fdr-sidebar__brand`); only `.fdr-sidebar__scroll` scrolls, so expanding a long section can never
push the logo out of view or create two competing scrollbars.

**Accessibility note found and fixed during this work:** the expand/collapse arrow and each nav
icon are `<span aria-hidden="true">` — without this, a button's accessible name concatenates the
arrow/icon glyph with the label (e.g. `"▸Operator 实验室"`), breaking exact-name lookups (both
Playwright's `getByRole` and real assistive-tech users benefit from the same fix).

### 19.4 Three secretaries, formally distinguished

"AI 秘书处" (Founder), "Operator秘书" (renamed from "AI 秘书"), and "Studio秘书" (new) are three
different pages with three different scopes — not the same concept relabeled three times:

| | Scope | Sees | Never shows |
|---|---|---|---|
| Founder's AI 秘书处 | Cross-product chief secretary | Research state, first real store + first content project status, Operator/Studio secretary summaries, cross-product reports | — (has full access by design) |
| Operator秘书 (`operator-preview/pages/SecretaryPage.jsx`) | Business Runtime only | Shop/product/order/customer/service/inventory/ad/live-commerce/profit/Token-cost tasks | Founder R&D globals, Studio content projects, full Prompt/Skill management, Release management, developer review, global Marketplace operations |
| Studio秘书 (new: `studio/pages/SecretaryPage.jsx`) | Content Runtime only | Content projects pending review, at-risk matrix accounts, content economics summary | Founder R&D globals, full store/order/customer-service management, global Marketplace review, global Release Candidate management |

Relationship: Founder's secretary calls/aggregates Operator's and Studio's — it is not a fourth
independent secretary duplicating either. Studio previously had **no** secretary page at all
(`studio/navConfig.js` had 14 items, none named secretary); it is now the first nav item, backed by
real data from `studio/mock/studioMock.js` (`getStudioOverview`/`getStudioState`), not new fake
data.

### 19.5 Marketplace authority reframed as Operator Cloud, not per-Mac-mini local storage

§18.4 already established Marketplace as a shared module, not a fifth product end; this round
corrects a framing gap the owner flagged: nothing in the UI or code comments made clear that the
*authoritative* Marketplace service belongs to Operator Cloud, not each Mac mini. Fixes:

- `shared/marketplace/cloudMarketplaceMockApi.js` (renamed from `mockMarketplaceRepository.js`) —
  its top comment now explains it is a **mock stand-in for calling Operator Cloud's Marketplace
  API**, including an explicit note on *why* it still physically lives under `shared/` rather than
  `cloud/`: `cloud/` is forbidden for the `operator`/`studio` customer packages (§18.3), but
  Operator's and Studio's own Marketplace-browsing pages need runtime access to this data — in a
  real deployment that access is a network call to Operator Cloud and isn't subject to this
  boundary; in this mock-only codebase, client and server can't be physically separated into
  different deployment units, so the boundary is maintained by comment/convention until a real
  Operator Cloud backend exists.
- `console/labs/MarketplaceCenter.jsx`'s subtitle now reads "云端 Marketplace 的 Founder 管理/发布
  入口——权威数据归属 Operator Cloud，本地为 Cloud Mock" (was: generic "AI 能力市场管理").
- Founder's Marketplace 中心 gained a 10-item collapsible sub-nav (`MARKETPLACE_SUBNAV` in
  `console/nav/navConfig.js`) mirroring the requested IA (概览/我的能力包/上架审核/Release
  Candidate 提交/版本与灰度/定价与 License/销售与下载/开发者中心/分成与结算/Cloud Marketplace 控制
  台) — each item honestly marked `implemented`/`planned`/`cloudMock`; unimplemented items
  (Release Candidate submission pipeline, real settlement) render a labeled "规划中" notice, never
  fabricated functionality. The "Cloud Marketplace 控制台" tab explicitly states no real Operator
  Cloud backend is connected and disables its own "open console" button rather than linking
  anywhere.

---

## References

- ADR-0002 Edition Boundary (`docs/10-adr/ADR-0002-edition-boundary.md`) — technical enforcement
  mechanism this document's product positioning sits on top of; see §0 for the precise
  reconciliation.
- ADR-0002A Experience Surface Preservation — governs `operator-preview/`'s continued protection
  as Operator Edition's prototype.
- ADR-0002B Founder V4 Commerce Operating Architecture Freeze — the formal decision record behind
  `founder-v4-architecture-freeze.md`.
- `founder-v4-architecture-freeze.md` — Founder Edition's internal navigation/module freeze (§9).
- `founder-v4-3-operating-loop.md` — Founder Edition's first real operating-loop demonstration
  (§10).
- `frontend/src/editions/editionConfig.js` — the runtime edition-selection code this document
  describes the product identity of; modified by the 2026-07-26 task to make Operator Cloud the
  default edition (§12), and by the 2026-07-27 four-product freeze to add Studio and path aliases
  (§13–14).
- [agent-evolution-foundation.md](agent-evolution-foundation.md) — the Agent Evolution Foundation,
  memory model, controlled evolution levels, cost intelligence and Edition Policy implementation
  (§12).
- [studio-domain-overview.md](studio-domain-overview.md) — Studio's content/matrix/traffic/
  advertising domain detail (§13).
- [distributed-compute-architecture.md](distributed-compute-architecture.md) — the distributed
  Mac-mini compute future architecture, security model and resource policy (§15).
- [operator-advertising.md](../09-runbooks/operator-advertising.md) — Operator's 广告投放 module,
  referenced by §14.3's Operator/Studio advertising boundary.

---

Chief Software Architect

AI Commerce OS
