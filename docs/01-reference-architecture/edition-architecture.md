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
