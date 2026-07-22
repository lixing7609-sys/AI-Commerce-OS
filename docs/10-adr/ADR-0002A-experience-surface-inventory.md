---
document_id: ADR-0002A-INVENTORY
title: Experience Surface Preservation — Page Inventory
version: 1.0.0
status: Accepted
owner: Chief Software Architect
reviewer: Product Owner
last_updated: 2026-07-22
---

# ADR-0002A Experience Surface Inventory

Companion to [ADR-0002A-experience-surface-preservation.md](ADR-0002A-experience-surface-preservation.md).
Built from a **live crawl** of the running dev server (`npm run dev`, both
`http://localhost:5173/` and `http://localhost:5173/?mode=operator-preview`) on 2026-07-22 —
every page below was actually opened and its rendered content read, not inferred from source
alone. Screenshots/text captures were taken during the crawl; this document records the findings.

Classification values: `retain-unchanged-for-research`, `graduate-into-operator-edition`,
`refactor-into-shared-components`, `keep-as-developer-only-prototype`,
`supersede-after-replacement`, `undecided`.

---

## Structural finding: no real URL routing exists

Neither app uses a router library (`react-router` or otherwise). `frontend/src/App.jsx` is a
single `useState("activePage")` switch; `frontend/src/operator-preview/OperatorPreviewApp.jsx` is
a single `useState("dashboard")` switch. Navigating between "pages" is a client-side state change,
not a URL change — none of the 15 pages below have their own bookmarkable URL. The only real
URL-level distinction in the entire frontend today is `http://localhost:5173/` versus
`http://localhost:5173/?mode=operator-preview`, read once at boot by
`frontend/src/main.jsx`/`frontend/src/editions/editionConfig.js`. This is a governing constraint
on any future Research Entry / Formal Edition Entry design (ADR-0002A's reserved section): there
is no existing route infrastructure to extend, one has to be introduced from scratch.

## Bootstrap surfaces — not settled architecture

`frontend/src/App.jsx` and `frontend/src/components/layout/Sidebar.jsx` are the current default
(`EDITION` unset / no query param) purely because that's what `main.jsx` happened to render first
when the repository was scaffolded — not because they were deliberately chosen as the permanent
shape of the Developer Edition. Per Preservation Policy rule 6, they should not be read as
finished architecture; per rule 7, they also should not be discarded for being provisional. Their
individual pages are inventoried below like any other page.

---

## Developer prototype pages (`http://localhost:5173/`, `App.jsx`)

All nine are 100% wired to the real backend (no mock data anywhere in this app) and use developer
vocabulary throughout (Runtime, Task IDs like `TASK-92913195A52A`, Agent internal names like
`chief_executive`/`product_manager`). Reached via `frontend/src/components/layout/Sidebar.jsx`'s
nine `NAV_ITEMS`, no separate URL per page.

| # | Route (state key) | Title | Purpose | Dependencies | Data source | Maturity | Current problems | Classification | Future destination |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `dashboard` | 首页 (Dashboard) | Runtime/Agent status overview, task/product/shop counts, start/stop controls | `pages/Dashboard.jsx`, `components/dashboard/{Hero,AICeoPanel,AgentPanel,MessageFlow,StatsCards}.jsx`, `components/runtime/*` | `GET /dashboard`, `/dashboard/summary` — real Postgres | High (fully functional, real data) | Exposes Runtime/Agent debug concepts directly (explicitly forbidden for Operator per ADR-0002) | keep-as-developer-only-prototype | Developer Edition |
| 2 | `overview` | 运营概览 | Aggregated task/agent/runtime KPIs in one screen | `pages/Overview.jsx` | Same dashboard/summary API | High | Same dev-vocabulary exposure as Dashboard | keep-as-developer-only-prototype | Developer Edition |
| 3 | `agents` | AI 员工 (Agents) | Per-agent status, 30-day processed/success/failure counts | `pages/Agents.jsx` | `GET /agents` — `AgentRegistry`, real | High | Raw agent internal names (`chief_executive`) shown; explicitly forbidden for Operator | keep-as-developer-only-prototype | Developer Edition |
| 4 | `tasks` | 任务中心 (Task Center) | Task queue browser/filter, recovery candidates, requeue/mark-failed | `pages/TaskCenter.jsx`, `components/tasks/*` | `GET /tasks`, `/tasks/stats`, recovery endpoints — real Postgres | High | Raw `TASK-XXXX` IDs, `agent_task` type strings — explicitly forbidden concept for Operator | keep-as-developer-only-prototype | Developer Edition |
| 5 | `deliverables` | 成果中心 (Deliverable Center) | Approve/reject/archive/export AI-produced deliverables | `pages/DeliverableCenter.jsx`, `components/deliverables/*` | `GET/POST /deliverables/*` — real Postgres (currently empty) | High (backend router itself is **uncommitted**, see ADR-0002 audit) | Approve/reject/export interaction pattern is genuinely reusable, but presentation is dev-facing (raw status enums) | refactor-into-shared-components | Shared core UI + Operator Edition (graduated, relabeled) |
| 6 | `shops` | 店铺中心 (Shop Center) | Full shop CRUD: add/edit credentials, connection test, 11-platform picker | `pages/ShopCenter.jsx`, `components/shops/*` | `GET/POST /shops/*`, `/platforms/*` — real Postgres (currently empty; **both routers uncommitted**) | High, but backend not yet in git history | Platform-picker CRUD UI is developer-grade (raw platform codes like `wechat_shop`); credential-form/connection-test logic is reusable | refactor-into-shared-components | Shared core credential logic + Operator Edition (simplified card view already prototyped in operator-preview) |
| 7 | `analytics` | 数据分析 (Analytics) | Task-level statistics: completion rate, per-agent/per-priority breakdown | `pages/Analytics.jsx` | `GET /analytics/tasks` — real Postgres | High | This is *task* analytics, not *business* analytics — different metric domain than what "经营分析" should mean for Operator | keep-as-developer-only-prototype | Developer Edition (Device Admin may want a diagnostic subset later — undecided) |
| 8 | `knowledge` | 知识库 (Knowledge Base) | Browses all 47 internal engineering docs (RA-/S-/D-/A-/ADR-series) | `pages/KnowledgeBase.jsx` | `GET /knowledge/documents` — real filesystem (`docs/`) | High | This *is* the internal engineering doc tree — must never reach Operator; see also the duplicate exposure found in operator-preview's Settings (below) | keep-as-developer-only-prototype | Developer Edition only, always |
| 9 | `settings` | 设置 (Settings) | Runtime control, integration/LLM status, system info (backend version, migration revision) | `pages/Settings.jsx` | `GET /settings/{llm-status,integration-status,system-info}` — real | High | Shows DB migration revision hash directly — a real diagnostic surface | refactor-into-shared-components | Diagnostic content maps almost 1:1 to future Device Admin Edition needs |

---

## Operator prototype pages (`http://localhost:5173/?mode=operator-preview`, `operator-preview/`)

All six use business language throughout (无 Runtime/Task/Agent-role/Consumer/migration terms —
enforced today by the prototype's own `FORBIDDEN_DEV_TERMS` guard in
`operator-preview/helpers/navigation.js`), and default to a curated demo dataset
(`operator-preview/previewData.js`) with an explicit toggle to real backend data (see
"Cross-cutting surfaces" below). This is markedly more mature, business-appropriate work than the
developer app for the same underlying concepts.

| # | Route (state key) | Title | Purpose | Dependencies | Data source | Maturity | Current problems | Classification | Future destination |
|---|---|---|---|---|---|---|---|---|---|
| 10 | `dashboard` | 一人公司经营驾驶舱 | Daily business cockpit: sales/orders/customers KPIs, per-shop health, AI recommendations with approve/reject/request-more-info actions, today's activity feed | `pages/DashboardPage.jsx`, `components/charts/{DonutChart,SalesTrendChart}.jsx`, `components/TopScopeBar.jsx` | Demo: `previewData.js`. Real-data toggle: `helpers/realDataApi.js` → `GET /dashboard/summary`, `/shops`, `/deliverables`, `/runtime/status` (all read-only, safely degrades to "not connected" on failure) | High — the most complete surface in the repo; directly demonstrates most of the "study" criteria (business language ✓, approve/reject actions ✓, per-shop context ✓) | No advertising spend, Token/AI-credit consumption, or livestream context anywhere — see Commercial Architecture Impact in the parent ADR | graduate-into-operator-edition | Operator Edition home page |
| 11 | `shops` | 我的店铺 | Per-shop cards: auth status, today's sales/orders, pending exceptions/approvals, "进入店铺"/"开始运营" actions | `pages/ShopsPage.jsx` | Demo data only in this crawl (3 demo shops matched dashboard's demo set); real shop CRUD not exercised from this page | Medium-high (UI complete, write-path not observed) | Underlying `shops.py`/`platforms.py` backend is still uncommitted (shared gap with dev ShopCenter) | graduate-into-operator-edition | Operator Edition, once shop backend is committed |
| 12 | `secretary` | AI秘书处 | Work queue: pending/in-progress/completed/exception AI recommendations, approve/reject/request-more-info, developer-info escape hatch | `pages/SecretaryPage.jsx`, `components/DevInfoCollapse.jsx` | Demo: `previewData.js` | Medium — interactions are UI-only (`resultActions.js` shows toast confirmations, no real POST calls observed in this crawl) | Has a per-item "展开开发信息" (expand developer info) control — see Cross-cutting surfaces, this is a real leak risk if graduated as-is | graduate-into-operator-edition (page) / see item 17 for the escape hatch specifically | Operator Edition |
| 13 | `deliverables` | 经营成果 | AI-produced analyses/decisions with status (待审核/已批准/已驳回/已转工作/已归档), grouped by type | `pages/DeliverablesPage.jsx` | Demo: `previewData.js` | High (presentation-complete) | Not yet wired to the real `deliverables.py` backend (itself uncommitted) | graduate-into-operator-edition | Operator Edition, once deliverable backend is committed |
| 14 | `memory` | 业务记忆 | Structured business knowledge base: product/supplier/brand/customer-rule/platform-rule/SOP/decision/case records, tagged by which AI role may use each | `pages/BusinessMemoryPage.jsx` | Demo: `previewData.js` — **no backend concept of "business memory" exists anywhere in the current data model** (no DB table) | High (UI), None (backend) | Entirely aspirational relative to today's schema — real graduation requires new Core data model work first, not just a frontend port | graduate-into-operator-edition (design reference) / undecided (backend) | Operator Edition, contingent on new Core schema — flag for a future spec, not this ADR |
| 15 | `settings` | 系统设置 | Grouped settings: AI模型, 系统运行, 自动化, 消息入口, 安全, 开发与文档, 系统日志 (7 sub-tabs) | `pages/SettingsPage.jsx`, `helpers/settingsGroups.js` | AI模型 tab confirmed real (`GET /settings/llm-status` via `realDataApi.js`); other tabs not individually re-verified for live vs static content in this crawl | Medium — see problems | **"开发与文档" sub-tab re-exposes the entire internal engineering doc tree (RA-001..010, S-001..006, D-001..007, A-001..015) inside the Operator surface** — same content as developer KnowledgeBase, despite the page's own disclaimer ("经营者日常操作不需要进入这里"). "系统日志" sub-tab is a stub ("技术日志入口，供开发与运维排查问题使用") — content-empty today but Device-Admin-shaped, not Operator-shaped. **"系统运行" sub-tab itself is a mix of two different concerns, not one — see note below the table** | **undecided** — needs a sub-tab-level split, not a single page-level answer | AI模型/自动化/消息入口 → Operator Edition; **系统运行 → split required, see note below**; 开发与文档/系统日志/安全 → Device Admin Edition, not Operator |

**"系统运行" sub-tab — split required / undecided, not a single classification.** It currently
bundles two different concerns that belong to different Editions:

- Operator-facing (→ candidate for Operator Edition): overall system availability, AI
  availability, shop connection health, automation enabled/disabled, business-impacting warnings.
- Device-Admin-facing (→ candidate for Device Admin Edition, not Operator): service/process
  health, database and Redis status, logs, restart controls, diagnostics, version, backup and
  restore.

This sub-tab is **not** classified `graduate-into-operator-edition` as a whole. It needs the same
kind of split decision as the page overall, deferred to whoever designs the graduated Settings
surface for each Edition — recorded here as `undecided` pending that work, not resolved by this
inventory.

---

## Cross-cutting surfaces (not page-scoped)

| # | Surface | Purpose | Dependencies | Data source | Maturity | Current problems | Classification | Future destination |
|---|---|---|---|---|---|---|---|---|---|
| 16 | Floating AI Secretary chat panel | Persistent "问AI秘书" button → slide-in chat with suggested prompts ("今天公司怎么样?" etc.) | `operator-preview/components/SecretaryPanel.jsx` | Prototype-only; panel itself states "原型对话，尚未连接真实秘书工作流" | Medium (UI complete, not wired to any backend conversation flow) | None found beyond being explicitly unwired | graduate-into-operator-edition | Operator Edition — strong, on-vision concept, needs a real backend conversation flow before shipping |
| 17 | "展开开发信息" (expand developer info) escape hatch | Per-item control on the Secretary page that reveals raw underlying data for a recommendation | `operator-preview/components/DevInfoCollapse.jsx` | Whatever raw object backs each recommendation card | Low-medium — functions, but exists specifically to peek at dev-shaped data from inside the Operator surface | Directly in tension with ADR-0002 Prohibition #1 (Operator must never see raw JSON/dev concepts) if graduated unchanged | supersede-after-replacement | Should not graduate as-is; either removed or re-scoped to Device Admin only |
| 18 | Demo/real dual data mode | Every operator-preview page defaults to curated demo numbers and offers an explicit "真实系统数据" toggle that calls real read-only endpoints, safely degrading to "not connected" on failure | `operator-preview/previewData.js`, `operator-preview/helpers/realDataApi.js` | Both — by design | High — exactly the mechanism this ADR's "study" goals need (comparing prototype vision against real system state) | None — this is good, deliberate design, worth preserving unchanged | retain-unchanged-for-research | Not migrated; stays as the research/comparison tool it already is |

---

## Cross-references

- Commercial Architecture Impact (Ads Center, AI Account/Token Center, Token vs. advertising cash
  balance, Operator Cloud control surfaces — none of which exist anywhere in this inventory) is
  covered in [ADR-0002A-experience-surface-preservation.md](ADR-0002A-experience-surface-preservation.md#commercial-architecture-impact--reserved-not-yet-implemented),
  not duplicated here.
- Backend routers referenced above as "uncommitted" (`shops.py`, `deliverables.py`,
  `platforms.py`) are the same gap identified in the ADR-0002 post-commit integrity audit — see
  ADR-0002's git history (commits `618f298`, `74e64b4`).
