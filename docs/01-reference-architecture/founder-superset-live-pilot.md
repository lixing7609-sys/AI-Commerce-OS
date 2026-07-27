# Founder Superset + First Real Store Live Pilot

Version

1.0 (P0 + P1 slice)

Date

2026-07-27

Status

**Partially implemented.** This document describes the M8 "Founder First Real Store Live Pilot"
phase. Of the six priorities the phase defines (P0–P5), **P0 and P1 are implemented and tested**;
P2 (Prompt/Model Arena + Agent config extensions), P3 (Real Operation Task Workbench + Token Cost
Ledger + Release Candidate), P4 (Studio-lab R&D view depth) and P5 (Marketplace cross-product
skeleton) are **not yet implemented** — see §5. This document only describes what actually exists
in the codebase today; it is not a spec for future work.

---

## 1. Product relationship correction (frozen, not new work this pass)

AI Commerce OS Founder is the full-product R&D / experiment / real-operation-validation / release
center — the superset of Operator's and Studio's entire capability sets. There are still exactly
**four** product ends (Founder, Operator Cloud, Operator, Studio) — Marketplace is a **cross-product
shared module**, not a fifth end (its concrete implementation is P5, not yet built — see §5).

## 2. P0 — Founder-superset navigation: Operator Lab / Studio Lab

Founder gained a fifth nav group, `researchLab` (label "全栈研发与真实店铺试运行"), in
`frontend/src/console/nav/navConfig.js`, containing three new modules registered in
`frontend/src/console/moduleRegistry.jsx`:

| Key | Label | Component |
|---|---|---|
| `storeConnectionCenter` | 真实店铺接入 | `console/labs/StoreConnectionCenter.jsx` (§3) |
| `operatorLab` | Operator 实验室 | `console/labs/OperatorLabWithExit.jsx` → `OperatorLab.jsx` |
| `studioLab` | Studio 实验室 | `console/labs/StudioLab.jsx` |

**Reuse, not duplication.** `OperatorLab.jsx` and `StudioLab.jsx` import the exact same
`NAV_ITEMS`/`PAGE_COMPONENTS` registries (and, for Operator, the same `PreviewProvider` context and
`OperatorNav` component) that the standalone `OperatorPreviewApp.jsx`/`StudioApp.jsx` already use.
There is zero forked page code — verified in the browser: clicking "广告投放" inside Operator Lab
renders the identical `AdvertisingPage` component Operator's own `/operator` route renders.
`OperatorLab.jsx` never imports from `operator-preview/` anything beyond what `OperatorPreviewApp.jsx`
itself imports, and never edits a file under `operator-preview/` (ADR-0002A boundary respected).

**Nested-scroll fix.** The standalone products' outer shells (`.op-shell` — `min-height:100vh`;
`.st-shell` — `height:100vh;overflow:hidden`) are never rendered inside Founder — only their inner
nav/content pieces are. A new `console/labs/labs.css` defines `.fdr-lab-shell` with
`position: sticky; top: 0; max-height: calc(100vh - 140px)` (vh-based, not `height:100%`, because
Founder's own `.fdr-content__inner` is an auto-height flow container shared by every Founder
module — a percentage height against it resolves to `auto` and never actually bounds anything,
which was verified as a real bug during this build via `getComputedStyle` measurement before the
`max-height` fix). This gives the embedded product's own sidebar and content area a single,
correctly-scoped internal scroll region — verified via
`e2e/founder-store-live-pilot.spec.js`'s scroll test that Founder's own `.fdr-content` does not
gain extra scroll height from the embedded Lab.

**Operator's "返回旧版后台" button:** `OperatorNav.jsx` (uneditable per ADR-0002A) hardcodes this
label. Its `onBackToLegacy` callback is wired, via `OperatorLabWithExit.jsx`, to Founder's own
`ConsoleNavContext`, navigating back to Founder's default module rather than reloading the page —
the label is Operator's own copy (unavoidable without editing a protected file), but the behavior
is Founder-appropriate.

## 3. P1 — Store Platform Adapter + credential boundary + sync domain model

New domain layer at `frontend/src/shared/storePlatform/`, deliberately layered **on top of** — not
duplicating — the real, already-existing backend shop service (`backend/app/models/shop_db.py` /
`shop_api.py` / `shop_service.py`, Stage 8E) that already owns real shop CRUD, encrypted
credentials, OAuth, and connection testing (`frontend/src/services/shopApi.js`). That backend
explicitly stores **no** business data (products/orders/GMV/inventory — see `shop_db.py`'s own
comment: "不保存任何虚假经营数据"); this new layer is exactly the piece that was missing to
represent, sync, and honestly report on that business data.

| File | Purpose |
|---|---|
| `types.js` | `AccessMode` enum (`MODE_MOCK`/`MODE_SANDBOX`/`MODE_LIVE_READONLY`/`MODE_LIVE_APPROVAL`/`MODE_LIVE_AUTOMATED`), `CapabilityClass` enum, `StorePlatformAdapter` JSDoc contract (connect/disconnect/validateCredentials/refreshAuthorization/getStoreProfile/listProducts/getProduct/listOrders/getOrder/listCustomers/getCustomer/getInventory/getMetrics/createProductDraft/updateProductDraft/publishProduct/updatePrice/updateInventory/createCampaignDraft), plus `Store`/`Product`/`Order`/`Customer`/`SyncJob`/`SyncCursor`/`SyncError`/`PlatformAuthorization` typedefs |
| `capabilities.js` | `capabilityClassFor(method)`, `isCapabilityAllowedInMode(mode, class)`, `requiresApproval(mode, class)` — single source of truth for what each `AccessMode` may attempt |
| `featureFlags.js` | `FEATURE_FLAGS.storePlatform.liveAutomatedEnabled = false` (frozen), `defaultAccessModeForNewStore = MODE_LIVE_READONLY`, `defaultAutomationRiskLevel = "L1"`, `assertLiveAutomatedAllowed()` guard |
| `credentialStore.js` | `toPlatformAuthorization(shop)` — maps the real backend's `ShopItemResponse` (masked credential summaries only, never raw secrets) into `PlatformAuthorization`; never stores or logs a secret value |
| `mockAdapter.js` | Full `StorePlatformAdapter` implementation for `MODE_MOCK`, localStorage-backed, `is_demo`-tagged, real read/write round-trips against synthetic data |
| `liveReadonlyAdapter.js` | Full `StorePlatformAdapter` implementation for real stores — connection/profile methods forward to the real backend; business-data reads honestly return empty results (`SYNC_NOT_IMPLEMENTED` message) since no real platform sync backend exists yet; every write method returns `ok:false` with an explicit reason, never a fabricated success |
| `storeConnectionRepository.js` | Per-store `AccessMode`/automation-risk-level policy (localStorage, same pattern as `store/shopScopeStore.js`), `initializeAccessModeForNewStore()` (always writes `MODE_LIVE_READONLY`, never accepts a caller-supplied initial value), `setAccessMode()` (throws on `MODE_LIVE_AUTOMATED`), sync-job history |
| `syncService.js` | `runSync(storeId, adapter, opts)` — paginated multi-resource sync orchestration; one resource's failure never blocks the others (`partially_failed` status); records a `SyncJob` |

**Store Connection Center** (`console/labs/StoreConnectionCenter.jsx`, nav key
`storeConnectionCenter`) lists real shops (`getShops()`), and for each shows: real credential
status (via `toPlatformAuthorization`), an access-mode selector defaulting to and initialized as
`MODE_LIVE_READONLY`, an automation-risk-level selector defaulting to `L1` (L3/L4 flagged as
requiring extra confirmation, never silently accepted), and a "运行只读同步" action that runs a real
`syncService.runSync()` against the store's adapter — for a real store with no platform sync
backend, this **honestly completes with 0 records processed** and a visible note
("平台数据同步尚未接入真实后端"), never a fabricated success count. A "运行 Mock 演练" action
exercises the same pipeline end-to-end against `mockAdapter` regardless of whether any real store
exists, satisfying the requirement that `MODE_MOCK` be fully walkable independent of real
credentials.

This page deliberately does **not** duplicate the existing per-store "平台连接器" tab
(`console/modules/storeCenter/PlatformConnectorTab.jsx` + `mock/platformConnectorMock.js`, from an
earlier phase) — that tab is a capability-matrix/health-status prototype with no `AccessMode`
concept and no real backend calls; this page is the new access-mode/sync layer, and links out to
"店铺中心" for actual credential configuration rather than re-implementing a credentials form.

## 4. Verification performed

- `npx vitest run` — 294/294 tests pass, including 52 new tests across 7 new
  `shared/storePlatform/*.test.js` files (capability-class matrix, feature-flag defaults,
  credential-mapping honesty, mock-adapter round-trips, live-adapter honesty — verified with a
  mocked `shopApi.js` that the adapter never fabricates a connected state or non-empty business
  data, storeConnectionRepository defaults/guards, syncService pagination/partial-failure
  semantics).
- `npx eslint` — clean on all new/changed files.
- `npm run build` — clean production build.
- `npx playwright test` — 40/40 pass, including 8 new tests in
  `e2e/founder-store-live-pilot.spec.js` (real-shop loading and `MODE_LIVE_READONLY` default,
  `MODE_LIVE_AUTOMATED` never selectable, honest Mock-drill and real-store sync results, Operator
  Lab and Studio Lab rendering with zero console errors, and the nested-scroll containment check).
- Manual browser verification (this session): loaded `/founder?module=storeConnectionCenter`
  against the real dev backend, observed real shops "新城"/"演示店铺" with genuinely
  `not_configured` credential status and `app_key` listed as the missing requirement; ran a real
  sync and confirmed the recorded `SyncJob` honestly shows `recordsProcessed: 0`,
  `status: succeeded`, with the "尚未接入真实后端" note.

## 5. Explicitly not done in this pass

- **P2** — Prompt/Model Arena, Agent Studio config field extensions for the live-pilot workflow.
- **P3** — Real Operation Task Workbench, Token Cost Ledger extensions for real-store tasks,
  Release Candidate pipeline recording.
- **P4** — Deeper Studio-lab R&D-specific view beyond the P0 reuse wrapper.
- **P5** — Marketplace cross-product shared-module skeleton (Founder dev/test/review, Operator
  Cloud package/license/OTA infrastructure, Operator/Studio browse-and-install surfaces).
- **MODE_LIVE_APPROVAL real action** (the phase's explicit stretch goal) — not attempted, because
  no real platform write channel exists in the backend yet; attempting it would have required
  either faking a write (prohibited) or building real platform API integration (out of scope for
  this pass). `liveReadonlyAdapter`'s write methods are already shaped to support this once a real
  write channel exists — `requiresApproval()` and `capabilityClassFor()` already gate
  `publishProduct`/`updatePrice` as `APPROVAL_REQUIRED`.
- No new `Product`/`Order`/`Customer`/`StoreMetric` typedefs were added to the shared
  `shared/domainTypes.js` file that P0/P1 code across all four products draws from — the new
  connection-scoped typedefs live in `shared/storePlatform/types.js` instead (see that file's
  top-of-file comment for why they are a distinct, non-duplicating projection of the same
  `storeId`).

## References

- [edition-architecture.md](edition-architecture.md) — four-product top-level architecture this
  phase builds on without adding a fifth product end.
- [distributed-compute-architecture.md](distributed-compute-architecture.md) — the precedent this
  phase's `featureFlags.js`/honest-mock-data conventions follow.
- `backend/app/models/shop_db.py`, `shop_api.py`, `shop_service.py` — the real backend this
  phase's credential/connection layer wraps rather than duplicates.
