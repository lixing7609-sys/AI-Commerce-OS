# Founder Superset + First Real Store Live Pilot

Version

2.0 (M8 P0+P1 slice, then M8b Founder Product Shell Consolidation)

Date

2026-07-27 (P0+P1), 2026-07-28 (M8b)

Status

**Partially implemented, two phases merged into this one document to avoid duplicate architecture
files.** Phase 1 ("M8 Founder First Real Store Live Pilot") shipped P0 (Founder-superset nav +
Operator/Studio Lab reuse) and P1 (Store Platform Adapter + Store Connection Center) — §1-§5 below.
Phase 2 ("M8b Founder Product Shell Consolidation") collapsed Founder's duplicate top-level business
menus, made the Operator/Studio Lab reuse pattern the enforced single-source-of-truth architecture
(not just an initial prototype), and added the cross-product Marketplace — §6-§10 below. Phase 1's
P2-P5 items remain **not done** — see §5 for what's still outstanding (Marketplace is no longer in
that list; it shipped in M8b, see §9).

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

## 5. Explicitly not done in Phase 1 (M8 P0+P1)

- **P2** — Prompt/Model Arena, Agent Studio config field extensions for the live-pilot workflow.
- **P3** — Real Operation Task Workbench, Token Cost Ledger extensions for real-store tasks,
  Release Candidate pipeline recording.
- **P4** — Deeper Studio-lab R&D-specific view beyond the P0 reuse wrapper.
- ~~P5 — Marketplace cross-product shared-module skeleton~~ — **done in M8b, see §9.**
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

## 6. M8b — Founder Product Shell Consolidation: what changed

The user issued a follow-up, more binding instruction after Phase 1: **Founder becomes the single
daily development and acceptance entry point.** The owner will no longer open standalone Operator
or Studio to validate work — but standalone Operator/Studio must keep working, because they are the
future per-Mac-mini deployment shape. The concrete requirement: Founder's Operator Lab and Studio
Lab must be **provably** the same code as the standalone products (not just "reuses the registry at
the time it was written" — enforced going forward), and Founder must stop showing a second,
parallel set of business menus (店铺/商品/内容/直播/订单/客服/广告) alongside the Lab entries.

## 7. Edition boundary hardening (closes a real blind spot)

`scripts/editions/manifest.py`'s `FRONTEND_FORBIDDEN_PREFIXES` previously only forbade
`operator`'s customer package from containing `frontend/src/pages/` (the Developer edition's own
tree) — it never forbade `frontend/src/console/` (Founder's exclusive R&D shell). That meant
nothing would have caught it if a future change had made `operator-preview/` import from `console/`
directly — the UI could look collapsed while the code still secretly depended on Founder-only
logic. Fixed:

- `frontend/src/console/` added to the forbidden list for **operator**, **studio**, and
  **device-admin**.
- A new `studio` entry added to the manifest (`FRONTEND_INCLUDE_PREFIXES`/`FRONTEND_FORBIDDEN_PREFIXES`)
  — it didn't exist before this pass, meaning Studio's own customer-package boundary was previously
  unchecked entirely.
- Cross-product isolation: `operator` now also forbids `frontend/src/studio/` and
  `frontend/src/cloud/`; `studio` forbids `frontend/src/operator-preview/` and `frontend/src/cloud/`.
- `scripts/editions/test_check_boundary.py` gained a `M8FounderConsolidationBoundaryTests` class
  (4 tests) asserting these forbidden entries exist and that an `operator-preview/` file importing
  `console/modules/productCenter/...` is actually flagged by `check_import_boundary()`.

Running `python3 scripts/editions/check_boundary.py --edition all` against the real repo passes
clean both before and after every subsequent M8b change in this section — the hardening did not
break anything that already existed, it only closes a future gap.

## 8. Single-source Store/Shop: the reference pattern for every future shared module

`frontend/src/pages/ShopCenterContent.jsx` (real backend CRUD/OAuth/credential management, Stage
8E) used to live under `pages/` — forbidden for the `operator` customer package — so
`operator-preview/`'s own `shops` page was a **separate, thinner** implementation
(`ShopsPage.jsx`, no OAuth, different tabs). This was exactly the kind of drift the user's new
instruction is about. Fixed by establishing the pattern every future Operator/Studio shared page
must follow:

1. **Move, don't fork.** `ShopCenterContent.jsx` (already portable — takes `onNavigate`/
   `extraDetailTabs` props, never called `useConsoleNavContext()`/`useToast()` internally) moved
   from `pages/` to `frontend/src/shared/products/operator/ShopCenterContent.jsx`. `shared/` is
   allowed in every edition's include list.
2. **Retire the duplicate.** `operator-preview/pages/ShopsPage.jsx` deleted; `pageRegistry.jsx`'s
   `shops` key now renders the same `ShopCenterContent` Founder and the Developer edition
   (`pages/ShopCenter.jsx`) use.
3. **The one allowed difference is a `founderOverlay` prop**, not a fork. `pageRegistry.jsx`'s
   `shops` entry accepts `({ founderOverlay }) => <ShopCenterContent extraDetailTabs={founderOverlay?.storeExtraDetailTabs} />`.
   Only `OperatorLab.jsx` passes a non-`undefined` `founderOverlay` (injecting the "平台连接器"
   Founder-only diagnostic tab, see `console/modules/storeCenter/storeDetailExtraTabs.jsx`);
   standalone `OperatorPreviewApp.jsx` never does, so it renders the plain business view.
   Verified live and in `e2e/founder-store-live-pilot.spec.js`: the tab appears inside Founder's
   Operator Lab and never appears on `/operator`.

This is the concrete, working instance of the abstract "FounderOperatorOverlay" pattern the task
spec asked for — a props-based injection point, not a second page.

**Not yet migrated to this pattern (a real, tracked gap, not silently dropped):**
`console/modules/productCenter/`, `orderCenter/`, `customerServiceCenter/`, `approvalCenter/` are
still Founder-only implementations. `operator-preview/`'s own `products`/`orders`/
`customerService`/`approvals` pages remain the honest `ComingSoonPage` placeholders they already
were. These four Founder modules call `useConsoleNavContext()`/`useToast()` (Founder-only context)
directly inside their body — not just at the top like `ShopCenterContent` avoided doing — so
promoting them to shared status requires the same kind of Page/Content extraction Store went
through, done four more times, which is real follow-up work, not a trivial rename. Until that
lands: they stay registered in Founder (nothing is deleted or broken), grouped next to "Operator
实验室" in the nav, and each sidebar entry renders a visible "待同步" badge (see
`console/shell/ConsoleSidebar.jsx`) so the gap is honest in the UI rather than hidden. `adCenter` is
a different case — it was already, deliberately, Founder-only before this pass (see
`operator-preview/pages/AdOpsPage.jsx`'s own pre-existing code comment about not exposing "Founder
才有的无限制广告开发/策略配置工具" to Operator) — it is reclassified into 产品研发中心
("广告策略研发") rather than migrated, since Operator's real, safe "广告投放" already exists and is
untouched.

## 9. Founder nav collapse + Marketplace across three views

Founder's `FOUNDER_MODULES` (`console/nav/navConfig.js`) collapsed from an unstructured 5-group
list into the requested six groups: **Founder 总览 / 产品研发中心 / Operator 实验室 / Studio 实验室 /
Marketplace 中心 / 系统与发布**. `storeCenter`/`contentCenter`/`liveCenter`/`trafficNetworkCenter`
removed as standalone top-level entries — their real capability now lives only in Operator Lab
(店铺, via §8) and Studio Lab (`studio/`, already real for content/live/traffic, not a stub). A new
`MODULE_REDIRECTS` table (same file) means every old `?module=` bookmark still resolves correctly
— `contentCenter`→Studio Lab's `contentProjects`, `liveCenter`→`aiLive`,
`trafficNetworkCenter`→`matrixAccounts`, `storeCenter`→Operator Lab's `shops` — instead of 404ing
or silently falling back to the default module. `OperatorLab`/`StudioLab` gained an `initialPage`
prop (via new `OperatorLabWithExit`/`StudioLabConnected` adapters reading `subView` from
`ConsoleNavContext`) to land on the right sub-page after a redirect.

**Marketplace** (`frontend/src/shared/marketplace/`) is the new cross-product AI capability market
— not a fifth product end, a shared module three views read through:

- `types.js` — the full `CapabilityPackage` model from the task spec (`packageType` incl. `BUNDLE`,
  `targetProducts`, `PricingPolicy`/`LicensePolicy`/`TokenPolicy`, `PackageDependency`/
  `PackageCompatibility`, `permissions`, `riskLevel`, `EvaluationSummary`, `PackageVersion[]`,
  `DeveloperProfile`, `ReviewState`), plus Operator's and Studio's category lists from the spec.
- `mockMarketplaceRepository.js` — localStorage-backed, 13 seed packages deliberately spanning
  operator-only/studio-only/shared targeting, every `packageType` including one `BUNDLE`, and
  draft/in_review/third-party-submitted review states (needed real variety to prove the filtering
  actually filters, not just render an empty list correctly).
- `marketplaceService.js` — the single query boundary: `listConsumablePackages(viewProduct)`
  (approved + target-matches-product-or-shared, used by Operator/Studio) vs.
  `listAllPackagesForManagement()` (everything, Founder only) — one filter written once.
- `MarketplaceBrowser.jsx` — **one** browse/install component, `theme="operator"|"studio"` prop.
  Operator's and Studio's existing CSS aren't a simple prefix swap (`op-panel` vs `st-card`,
  `op-btn primary` vs `st-btn st-btn--primary`), so a small `THEME_CLASSES` lookup table handles
  that — the data, filtering, and install/uninstall logic are one implementation, not two. Wired
  into `operator-preview/pageRegistry.jsx`'s new `marketplace` key and `studio/pages/index.jsx`'s
  new `marketplace` key — both nav lists gained a "能力市场" item (`helpers/navigation.js`,
  `studio/navConfig.js`).
- `console/labs/MarketplaceCenter.jsx` — Founder's management view (`marketplaceCenter` module,
  new `marketplace` nav group): full package list regardless of review state, per-package review
  (submit/in-review/approve/reject), release-channel switch (灰度), version publish/rollback, and a
  developer directory tab. Reads the same `marketplaceService.js`, not a separate data source.

Verified live in-browser in all three hosts (screenshots taken this session, not reproduced here):
Founder sees all 13 packages including the draft/in-review/third-party ones; Operator's 能力市场
shows exactly the 6 approved operator-or-shared packages; Studio's shows exactly the 6 approved
studio-or-shared packages — draft/in-review packages and the other product's exclusive packages
never leak into either consumer view. `e2e/marketplace.spec.js` (4 tests) and 9 new
`marketplaceService.test.js` unit tests lock this in.

## 10. M8b verification

- `npx vitest run` — 303/303 (up from 294; +9 marketplace service tests).
- `npx playwright test` — 53/53 (1 pre-existing environment-dependent skip; up from 40, +8
  `founder-store-live-pilot.spec.js` extensions, +8 `founder-nav-consolidation.spec.js`, +4
  `marketplace.spec.js`).
- `npx eslint` — clean (4 pre-existing warnings in files this pass didn't touch the logic of).
- `npm run build` — clean; bundle actually shrank (~1475KB→~1304KB) since the four retired Founder
  modules (`contentCenter`/`liveCenter`/`trafficNetworkCenter`/old `storeCenter` wiring) are no
  longer imported into the graph.
- `python3 scripts/editions/check_boundary.py --edition all` — clean for `operator`/`studio`/
  `device-admin` throughout every commit in this phase.
- `python3 -m pytest scripts/editions` — 17/17 (up from 12, +5 boundary-hardening tests).

## References

- [edition-architecture.md](edition-architecture.md) — four-product top-level architecture this
  phase builds on without adding a fifth product end; §18 points here for the M8b nav-collapse and
  single-source-registry rules.
- [studio-domain-overview.md](studio-domain-overview.md) — Studio's own nav/page list, now 14 items
  after Marketplace, and its role as the real (not stub) destination for Founder's retired
  content/live/traffic menus.
- [distributed-compute-architecture.md](distributed-compute-architecture.md) — the precedent this
  phase's `featureFlags.js`/honest-mock-data conventions follow.
- `backend/app/models/shop_db.py`, `shop_api.py`, `shop_service.py` — the real backend this
  phase's credential/connection layer wraps rather than duplicates.
