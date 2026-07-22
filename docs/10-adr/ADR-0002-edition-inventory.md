---
document_id: ADR-0002-INVENTORY
title: Edition Boundary — Repository Inventory
version: 1.0.0
status: Accepted
owner: Chief Software Architect
reviewer: Product Owner
last_updated: 2026-07-22
---

# ADR-0002 Edition Inventory

Companion document to [ADR-0002-edition-boundary.md](ADR-0002-edition-boundary.md). Every page,
API route, service, agent, database table, and script that exists in the repository as of this
ADR, with its assigned Edition and the reasoning — grounded in what the code actually does and
who actually calls it today, not in what a name suggests. Items whose ownership cannot yet be
determined are marked `undecided` and left untouched, per ADR-0002's Rule 3.

Ownership values: `shared-core`, `developer`, `operator`, `device-admin`, `operator-cloud`,
`undecided`.

---

## 1. Frontend pages (`frontend/src/pages/`)

| File | Owner | Reason |
|---|---|---|
| Dashboard.jsx | developer | Rendered by `App.jsx`'s default branch; shows Runtime/Agent/Task panels |
| TaskCenter.jsx | developer | Task queue management UI |
| DeliverableCenter.jsx | developer | Full deliverable lifecycle UI (approve/reject/export), engineering-facing |
| ShopCenter.jsx | developer | Shop management UI reached only via developer `App.jsx` nav |
| Overview.jsx | developer | "运营概览" — reached only via developer `App.jsx` nav |
| Agents.jsx | developer | AI Agent debug/status UI |
| Analytics.jsx | developer | Task analytics UI |
| KnowledgeBase.jsx | developer | Internal documentation browser |
| Settings.jsx | developer | System/LLM/integration diagnostics UI |

All nine are exactly the surface `operator-preview` was built to avoid exposing — none are
imported from `frontend/src/operator-preview/` (verified by `scripts/editions/
check_boundary.py`'s import-boundary check).

## 2. Frontend components (`frontend/src/components/`)

| Directory | Owner | Reason |
|---|---|---|
| `tasks/` (7 files) | developer | Task submit/detail/recovery UI, only used from `pages/TaskCenter.jsx` |
| `runtime/` (5 files) | developer | Runtime status/auto-resume UI, only used from developer pages |
| `layout/` (`Sidebar.jsx`, `Header.jsx`, `Content.jsx`) | developer | The developer app's own chrome; `operator-preview` has its own `OperatorNav.jsx` instead |
| `dashboard/` (5 files) | developer | AI-CEO/Agent panels for `pages/Dashboard.jsx` |
| `shops/` (6 files) | developer | Shop admin forms used by `pages/ShopCenter.jsx`; `operator-preview/pages/ShopsPage.jsx` has its own, separate shop UI |
| `deliverables/` (3 files) | developer | Used by `pages/DeliverableCenter.jsx` |
| `analysisViews/` (4 files) | developer | Used by `pages/Analytics.jsx` |
| `common/` (5 files) | shared-core (frontend) | Generic `Badge`/`Button`/`Card`/`ConfirmDialog`/`StatusDot` primitives with no business meaning; safe to reuse from any future Edition frontend, but not currently imported by `operator-preview` (which has its own styling) — recorded as available shared UI, not moved |

## 3. `frontend/src/operator-preview/` (all files)

| Owner | Reason |
|---|---|
| operator | Entire tree (App shell, nav, pages, chart components, helpers, tests) is the current implementation of Operator Edition's frontend, reached today via `?mode=operator-preview` / `getActiveEdition()`. Its `helpers/realDataApi.js` calls only four real backend endpoints (`dashboard/summary`, `shops`, `deliverables`, `runtime/status`, `settings/llm-status`), all of which are allowed for the Operator Edition in the Permission Boundary table — confirmed, not assumed. Its `helpers/navigation.js` already enforces its own `FORBIDDEN_DEV_TERMS` guard on nav labels. |

## 4. `frontend/src/editions/` (new in this ADR)

| File | Owner | Reason |
|---|---|---|
| `editionConfig.js`, `editionConfig.test.js` | shared-core (frontend) | Edition-detection logic used by `main.jsx` regardless of which Edition ends up loaded; not itself part of any one Edition's UI |

## 5. Frontend entry (`frontend/src/main.jsx`, `App.jsx`, `App.css`, `index.css`, `styles/`)

| File | Owner | Reason |
|---|---|---|
| `main.jsx` | shared-core (frontend) | The single bootstrap entry that dispatches to `App` or `OperatorPreviewApp` via `getActiveEdition()`; not owned by either Edition (see ADR Build Boundary section on why it is excluded from the Operator include manifest) |
| `App.jsx`, `App.css` | developer | The developer app shell |
| `index.css`, `styles/theme.css` | shared-core (frontend) | Base styles with no business-specific content, loaded by `main.jsx` before either app renders |

## 6. Backend API routers (`backend/app/api/v1/`, `backend/app/api/health.py`)

| Router file | Owner | Reason |
|---|---|---|
| `tasks.py` | developer | Task queue management; explicitly forbidden concept for Operator; not called by `operator-preview` |
| `agents.py` | developer | Agent debug/invoke; explicitly forbidden concept for Operator |
| `analytics.py` | developer | Task-level analytics, not business analytics; not called by `operator-preview` |
| `runtime.py` — `GET /status` | developer, operator, device-admin | Read-only; already called by `operator-preview` |
| `runtime.py` — `POST /start`, `POST /stop`, `PUT /auto-resume`, `GET /consumer-status` | developer | Control/debug surface; Device Admin start/stop rights are `undecided` |
| `settings.py` — `GET /llm-status` | developer, operator, device-admin | Already called by `operator-preview` |
| `settings.py` — `GET /system-info`, `GET /integration-status` | developer, device-admin | Diagnostic surface matching Device Admin's spec; not called by `operator-preview` |
| `shops.py` | developer, operator | Shop management, core Operator feature (店铺中心); OAuth sub-routes included |
| `deliverables.py` | developer, operator | Deliverable lifecycle, core Operator feature (成果) |
| `dashboard.py` | developer, operator | Business summary, core Operator feature (经营驾驶舱) |
| `knowledge.py` | developer, operator | Document index; used by `operator-preview`'s "business memory" concept |
| `platforms.py` | developer, operator | OAuth callback for shop platform connections, needed wherever `shops.py` is needed |
| `wecom.py` | developer, operator | WeCom private-domain messaging (微信私域), explicit Operator Edition feature |
| `inventories.py`, `listings.py`, `orders.py`, `products.py`, `stores.py`, `suppliers.py` | developer, operator | Supply-chain domain CRUD (供应链中心); classified with confidence, not `undecided`, because these map directly to the spec's named Operator module |
| `integrations.py` | shared-core (ungated) | Machine-to-machine task-submission gateway for n8n, authenticated by API key, not tied to a human-facing Edition |
| `health.py` | shared-core (ungated) | Needed by every Edition, especially Device Admin's "service status" |

`products.py`'s `GET /demo` sub-route is a demo/seed helper, not split out from the router-level
gate in this round — recorded here as a candidate for a future Developer-only carve-out, not
acted on now (avoids an unverified assumption about who currently depends on it).

## 7. Backend Agents (`backend/app/agents/`, all 16 files)

| Owner | Reason |
|---|---|
| shared-core | `agent_registry.py`, `base_agent.py`, `default_agents.py`, `operational_agent.py`, and the Product/Sales/AI-CEO agent families (`*_agent.py`, `*_context.py`, `*_prompt.py`, `*_response.py`). Per engineering-standards.md Rule 1, business logic belongs to Agents; Agents are Core. Editions only decide who may trigger or inspect them via the API layer (`agents.py`, `tasks.py` — both Developer-only in this round), never whether the Agent logic itself differs per Edition. |

## 8. Backend Services (`backend/app/services/`, all 30 files)

| Owner | Reason |
|---|---|
| shared-core | All 30 files (`task_*`, `deliverable_*`, `shop_service.py`, `product_service.py`, `order_service.py`, `inventory_service.py`, `supplier_service.py`, `listing_service.py`, `store_service.py`, `analytics_service.py`, `dashboard_service.py`, `knowledge_service.py`, `settings_service.py`, `runtime_state_service.py`, `runtime_recovery_service.py`, `database_readiness_service.py`, `credential_encryption_service.py`, `oauth_state_service.py`, `wecom_*`). Same Rule 1/Rule 4 reasoning as Agents — Services implement domain operations once; which Editions may reach them is entirely an API-layer decision (§6), not a Service-layer one. |

## 9. Backend Runtime / Integrations / LLM / Application / Core (`backend/app/{runtime,integrations,llm,application,core}/`)

| Path | Owner | Reason |
|---|---|---|
| `runtime/` (task queue, executor, scheduler, events, engine) | shared-core | Executes Tasks regardless of which Edition's API surface queued them |
| `integrations/platforms/` (`amazon.py`, `douyin.py`, `shopee.py`, `taobao.py`, `mock_or_unconfigured.py`, `registry.py`, `base.py`) | shared-core | Platform adapters, per Rule 4 ("platform-specific logic belongs to adapters") |
| `llm/` (`gateway.py`, `provider.py`, `deepseek_provider.py`, `ollama_provider.py`, `models.py`, `exceptions.py`) | shared-core | LLM access is an Agent-level concern, not Edition-specific |
| `application/{agent,dashboard,product,workflow}/` | undecided | Each is currently only an empty `__init__.py` — scaffolding with no implementation yet; nothing to misclassify |
| `core/config.py`, `core/external_task_auth.py` | shared-core | Environment-variable configuration and the external-task API-key gate, used regardless of Edition |
| `core/edition.py` | shared-core | The Edition boundary mechanism itself — deliberately Core, not owned by any one Edition, since every Edition's enforcement depends on it |

## 10. Database tables (`backend/app/models/*_db.py`, `backend/migrations/versions/`)

| Table | Source file | Owner | Reason |
|---|---|---|---|
| `products` | `product_db.py` | shared-core (customer data) | Business data, device-local, never Edition-specific (Data Ownership Matrix) |
| `stores` | `store_db.py` | shared-core (customer data) | Same |
| `suppliers` | `supplier_db.py` | shared-core (customer data) | Same |
| `listings` | `listing_db.py` | shared-core (customer data) | Same |
| `inventories` | `inventory_db.py` | shared-core (customer data) | Same |
| `orders` | `order_db.py` | shared-core (customer data) | Same |
| `tasks` | `task_db.py` | shared-core (customer data) | Same; visible only through Developer-only API routes, but the row data itself is still customer/device-local data, not a Developer-Edition-owned table |
| `shops`, `shop_credentials` | `shop_db.py` | shared-core (customer data / secrets) | `shop_credentials` additionally falls under the Data Ownership Matrix's "Secrets" row — encrypted, never logged, never bundled |
| `deliverables`, `deliverable_versions` | `deliverable_db.py` | shared-core (customer data) | Same |
| `system_runtime_state` | `runtime_state_db.py` | shared-core (device-local operational state) | Per-device Runtime state, not customer business data, but still never bundled into or reset by an application upgrade |

All 12 tables share one Alembic migration history (`backend/migrations/versions/`, 12 revisions)
— classified as **shared-core (ops tooling)**: schema evolution applies identically regardless of
which Edition's API surface is active on a given deployment.

## 11. `automation/n8n/`

| Owner | Reason |
|---|---|
| shared-core | Task-dispatch workflow exports and the external task-submission verification script; consumed via `integrations.py` (shared-core, ungated), not tied to any one Edition's UI |

## 12. Deployment / build / CI

| Item | Owner | Reason |
|---|---|---|
| `docker/` (empty) | undecided / not started | No Dockerfile or compose file exists anywhere in the repository; nothing to classify yet |
| `.github/` | undecided / not started | Does not exist; no CI pipeline to classify |
| `scripts/editions/` (new in this ADR) | shared-core (build tooling) | The manifest and boundary checker are themselves Core infrastructure used to build every customer-facing Edition, not owned by any one Edition |
| `docs/08-deployment/` (DEP-001..004) | shared-core (documentation) | Describes target deployment architecture; aspirational/Draft status, predates this ADR |

## 13. Operator Cloud

| Owner | Reason |
|---|---|
| undecided / future ADR | Nothing in this repository implements any layer of Operator Cloud today. Per ADR-0002's Decision, it is not designed here — it gets its own ADR when work on it begins. |

## 14. Root-level miscellany

| Item | Owner | Reason |
|---|---|---|
| `AI-Commerce-OS_Dashboard_V1.html` | undecided | A standalone static HTML file at the repo root, not referenced by any build config, `vite.config.js`, or import — appears to be a legacy mockup. Not deleted; ownership left undecided pending confirmation from whoever added it. |
| `assets/`, `configs/`, `prompts/`, `src/`, `tests/` (root-level), `workflow/` | undecided / not started | All empty placeholder directories matching a target tree referenced in `README.md`; nothing populated yet to classify |
| `scripts/` (root, excluding the new `scripts/editions/`) | undecided / not started | Otherwise empty |
