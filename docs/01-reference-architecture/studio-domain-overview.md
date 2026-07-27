# Studio Domain Overview

Version

1.0

Date

2026-07-27

Status

Implemented (mock data / prototype), frozen as product direction. Part of the "AI Commerce OS
Four-Product Architecture V1" freeze — see
[edition-architecture.md](edition-architecture.md) §13 for Studio's formal product identity and
top-level boundary; this document covers Studio's internal domain shape only.

---

## 1. Purpose

AI Commerce OS Studio (Content Plane) produces content, operates matrix accounts, and turns
accumulated traffic into sellable advertising resources. This document describes the domain model
and page structure implemented in `frontend/src/studio/` — a real, navigable, 13-item product
prototype, not a placeholder.

## 2. Content production pipeline

```
选题 → 脚本 → 分镜 → 生成 → 剪辑 → 审核 → 发布 → 数据回收 → 流量资产沉淀
(topic → script → storyboard → generation → editing → review → publish → data recovery →
 traffic-asset accumulation)
```

Every `ContentProject` (`shared/domainTypes.js`) carries a `stage` field describing its current
position in this pipeline, independent of its coarser `status`
(`planning`/`in_production`/`in_review`/`published`/`archived`).

## 3. Navigation and pages

`frontend/src/studio/navConfig.js` defines 13 nav items; `frontend/src/studio/pages/index.jsx`
maps each to a real page component (`PAGE_COMPONENTS`, same registry pattern as Founder's
`moduleRegistry.jsx`, Operator's `pageRegistry.jsx`, Cloud's inline `PAGE_COMPONENTS`):

| Key | Label | Content |
|---|---|---|
| `overview` | Studio 概览 | Today/week production+publishing counts, matrix account/follower/traffic stats, sellable ad resources, monthly ad revenue, content-share revenue, compute usage; the production pipeline; the Studio↔Operator collaboration model |
| `contentProjects` | 内容项目 | All content projects (short drama/short video/live/ad creative/brand column/matrix content), filterable by type, with stage/owner/budget/Token+compute usage/monetization model |
| `shortDrama` | AI 短剧 | Short-drama projects, cast/voice profiles, per-episode script/storyboard/voiceover/generation/editing/review progress, distribution+revenue by platform |
| `aiVideo` | AI 视频 | Video generation tasks, template, script/storyboard/asset readiness, generation model, Token/compute cost, publish platform, performance |
| `aiLive` | AI 直播 | Live-stream projects, digital human, script, topic/product, platform, session count, viewers/traffic/revenue, compliance risk |
| `matrixAccounts` | 矩阵账号 | Cross-platform matrix accounts — platform, positioning, IP, followers, health, monetization status, sellable ad-resource estimate |
| `contentAssets` | 内容资产 | The reusable asset library — copyright status, reuse flag, generation source, Token/compute cost, published platforms, cumulative plays/revenue, commercial license status |
| `trafficPool` | 流量池 | Traffic resources, explicitly modeling content → account → audience → traffic → ad product → ad revenue, not just a play-count number |
| `adResources` | 广告资源 | Sellable advertising inventory (account posts, content/shortdrama placement, live mentions, custom video, traffic packages, audience targeting, IP co-branding) with quantity/price/status |
| `adOrders` | 广告订单 | Advertising orders, distinguishing Operator-originated demand (`customerType: "operator"`) from external customers, contract/collected amount, delivery/exposure progress, settlement status |
| `computeTasks` | 算力任务 | Read-only view into the shared distributed-compute mock state — see [distributed-compute-architecture.md](distributed-compute-architecture.md) |
| `dataAnalytics` | 数据分析 | Cross-cutting rollups (content-type distribution, platform play distribution, ad-order settlement) derived from the same mock state, not separately maintained numbers |
| `settings` | 设置 | Product identity, relationship to the other three products, quick links |

## 4. Data layer

`frontend/src/studio/mock/studioMock.js` — a `shared/localRepository.js`-backed mock repository
(same infrastructure Founder/Operator/Cloud already use), not hardcoded static JSX. Every read
function returns `is_demo`-tagged data (see `tagDemo()`); every write function
(`reserveAdResource`, `advanceProjectStage`) is `async`, simulates latency, and only mutates the
mock repository — no real platform-account or payment integration exists.

Field shapes are aligned with `shared/domainTypes.js`'s `ContentProject` / `ContentAsset` /
`MatrixAccount` / `TrafficResource` / `AdvertisingResource` / `AdvertisingOrder` typedefs, so a
future real backend can replace this file's implementation without changing page components.

## 5. Product-language rule

Studio's user-facing copy uses **平台账号 / 账号授权 / 发布状态 / 账号健康** — never the bare word
"Connector," and never surfaces API/Webhook/Rate-Limit/Connector-version details to a content
creator (those stay in Founder's diagnostic tooling or Cloud's technical operations pages, per
[edition-architecture.md](edition-architecture.md) §9/§13).

## 6. Visual design

`frontend/src/studio/studioConsole.css` extends the same shared design system as the other three
products (`theme.css` tokens: `--bg`/`--surface`/`--text`/`--border`/`--radius`/`--shadow`), with
a dark sidebar + light content-area layout matching the Founder/Operator/Cloud family, and its own
accent color (teal, `--st-accent: #0D9488`) to visually distinguish it as a distinct product without
diverging into a different design language — no gradients, neon, or "entertainment app" styling;
Studio is still an enterprise operating system.

Scroll architecture follows the pattern fixed after a real regression found in Founder this session
(see the `fix(founder): restore vertical content scrolling` commit): `.st-shell` is a fixed
`height: 100vh; overflow: hidden` shell; `.st-content` is the actual scroll container
(`min-height: 0; overflow-y: auto`), not a document/body-level scroll dependency.

## 7. Deferred / not implemented

- Real platform-account OAuth or publishing integration (matrix accounts are entirely mock).
- Real advertising-order payment/settlement.
- Real content generation (short drama/video/live are mock production pipelines with mock
  Token/compute cost figures).
- Cross-product advertising settlement with Operator — see
  [edition-architecture.md](edition-architecture.md) §14.3's "future closed loop."
