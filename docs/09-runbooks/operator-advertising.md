# Operator Advertising (广告投放)

Version

1.0

Date

2026-07-26

Status

Implemented (mock data, no live platform integration)

Scope

The Operator edition's advertising operations module — navigation key `adOps`, sidebar label
"广告投放". Documents the operating model, data model, and safety constraints; not a process/tooling
runbook (see [developer-bootstrap.md](./developer-bootstrap.md) for that).

---

## 1. Purpose and relationship to Founder's Advertisement Center

This is the Operator (customer-facing, single-owner) edition's advertising module — a real,
navigable destination (`status: "ready"`, not a "coming soon" skeleton). It models the full
operating path an operator goes through to run ad campaigns for their store(s):

```
店铺绑定 → 广告账户绑定 → AI 策略草案 → 预算审批 → 广告执行 → 效果数据回流 → 贡献利润归因 → AI 优化
Store binding → Ad account binding → AI strategy draft → Budget approval → Execution →
Performance data return → Contribution-profit attribution → AI optimization
```

It is conceptually related to, but intentionally **not the same mock state** as, Founder's
`console/mock/adCenterMock.js` — Founder's Advertisement Center is the unrestricted developer-facing
build-out of a store's real advertising account; the Operator module here is the "customer-safe"
restricted operating view (approval-gated, no unrestricted ad-development tooling exposed). The two
only share one thing: the same `computeContributionProfit()` calculation
(`shared/agentEvolution/evolutionMock.js`) so profit figures never diverge between editions.

Source: [`frontend/src/operator-preview/helpers/adOpsMock.js`](../../frontend/src/operator-preview/helpers/adOpsMock.js)
(data/logic layer) and
[`frontend/src/operator-preview/pages/AdOpsPage.jsx`](../../frontend/src/operator-preview/pages/AdOpsPage.jsx)
(UI). Follows the same shared-mock-repository pattern as every other Operator module
(`createLocalRepository`), not page-local hardcoded state.

## 2. Three budget-source models (never merged into one number)

| Source | Meaning |
|---|---|
| `operator_owned` | The operator connects their own advertising platform account. AI only generates recommendations; it executes only actions the operator has explicitly approved. |
| `aicos_wallet` | AI Commerce OS's own advertising service wallet — split into **four separate line items**, never combined into one "ad spend" figure: platform advertising budget, advertising operating service fee, content/Token creative budget, AI optimization service fee. |
| (data-model only) centralized procurement / platform-agency | Fields reserved in the account model for a future centralized-buying arrangement; **not** claimed as live anywhere in the UI. |

## 3. Advertising account model

Each account (`accounts[]` in `adOpsMock.js`) carries: operator, tenant, store, commerce platform,
advertising platform, account identifier, authorization status, connection status, budget source,
execution mode, last sync time, data status. Example commerce-platform → ad-platform mappings
(`PLATFORM_AD_MAPPING`, product-mapping documentation only, not a live integration):

| Commerce platform | Ad platform |
|---|---|
| 抖音小店 | 巨量千川 |
| 淘宝 / 天猫 | 阿里妈妈 |
| 拼多多 | 多多进宝 |
| 京东 | 京准通 |
| 小红书 | 聚光 |
| 视频号 | 腾讯广告 |

## 4. Approval workflow — AI never spends without approval

Campaign status machine: `draft → pending_approval → approved → running ⇄ paused → completed`,
with `rejected` reachable from `pending_approval`/`approved`.

- `approveCampaign(id)` — only transitions `pending_approval → approved`, and refuses if
  `proposedBudget` exceeds the account budget ceiling.
- `startCampaign(id)` — only transitions `approved → running` (a `pending_approval` campaign
  cannot be started directly — enforced and covered by
  [`adOpsMock.test.js`](../../frontend/src/operator-preview/helpers/adOpsMock.test.js)).
- `rejectCampaign(id, reason)` — requires a non-empty reason, returns `{ ok: false }` without one.
- `pauseCampaign(id)` / `resumeCampaign(id)` — toggle `running ⇄ paused` without ever deleting the
  campaign record (used for both a manual pause and the "emergency stop" UI action).

Safety constraints enforced in the mock/UI layer: per-campaign approval required before spend,
daily/account/store-level budget ceilings (`budgetCeilings` in state), a high-risk warning banner
for `riskLevel: "high"` campaigns, an insufficient-balance state on the wallet, an abnormal-spend
alert (the seeded "无线降噪耳机 Pro" campaign: ROAS 0.8, negative contribution profit, auto-paused
awaiting operator confirmation), and no automatic budget increase without approval.

## 5. Contribution-profit attribution

Every campaign computes contribution profit via the same shared formula used across Founder and
Operator:

```
贡献利润 = 归因营收 − 商品成本 − 平台佣金 − 广告花费 − 退款损失 − 履约成本 − 内容/Token成本 − 广告服务费
Contribution profit = attributed revenue − product cost − platform commission − ad spend −
                       refund loss − fulfillment cost − content/Token cost − ad service fee
```

The UI states this explicitly as its optimization principle: **"广告优化目标是提升贡献利润，不只是
GMV 或表面 ROAS"** (advertising optimization targets contribution profit, not just GMV or surface
ROAS) — and includes a worked example where a positive-looking ROAS still nets a lower/negative
contribution profit once the full cost stack is applied (see the seeded "无线降噪耳机 Pro" campaign:
ROAS 0.8 but the underlying principle generalizes — a campaign can show ROAS > 1 and still be
contribution-profit-negative once product cost, refunds, and service fees are included; covered by
the "positive-looking ROAS still nets lower contribution profit" test case in `adOpsMock.test.js`).

## 6. Edition boundaries respected

The Operator advertising page does **not** expose Founder-only unrestricted advertising
development controls (e.g. Founder's Prompt Asset Library, Model Router) or Cloud-only
fleet/cross-tenant controls (cross-tenant management, platform-level OTA) — verified by
[`frontend/e2e/startup-smoke.spec.js`](../../frontend/e2e/startup-smoke.spec.js)'s
"does not expose Founder-only or Cloud-only controls" test.

## 7. Mock data labeling

All non-live values are tagged `is_demo` at the data layer (`tagDemo()` from
`shared/localRepository.js`) and visibly labeled "原型数据" in the UI — no advertising figure here
is presented as if it were a real payment, ad account, or execution integration.
