# Edition Architecture — Founder, Operator, Operator Cloud

Version

1.0

Date

2026-07-25

Status

Frozen (product positioning), amended 2026-07-26 — see §12. The identity statements in §1–§9 are
unchanged; §12 records what the "Agent Evolution + three-edition final positioning" task actually
built on top of that identity (default route, Cloud Console, Agent Evolution Foundation, Edition
Policy), superseding specific bullets in §11 without deleting them.

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
  default edition (§12).
- [agent-evolution-foundation.md](agent-evolution-foundation.md) — the Agent Evolution Foundation,
  memory model, controlled evolution levels, cost intelligence and Edition Policy implementation
  (§12).

---

Chief Software Architect

AI Commerce OS
