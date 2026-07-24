# Founder V4 Architecture Freeze

Version

4.0

Date

2026-07-24

Status

Frozen

Scope

`frontend/src/console/` — the Founder Operator Edition console (`?mode=founder`), built as the
upstream edition per [ADR-0002 Edition Boundary](../10-adr/ADR-0002-edition-boundary.md) and
[ADR-0002A Experience Surface Preservation](../10-adr/ADR-0002A-experience-surface-preservation.md).
Formal decision record: [ADR-0002B Founder V4 Commerce Operating Architecture Freeze](../10-adr/ADR-0002B-founder-v4-architecture-freeze.md).

---

## 1. Frozen navigation architecture

The following 18 modules, grouped into 5 sections, are the complete and final Founder V4
navigation tree (`frontend/src/console/nav/navConfig.js`):

```
经营总览 (overview)
  AI 秘书处 (secretary)          — default landing page
  今日经营 (dashboard)

店铺经营 (storeOps)
  店铺中心 (storeCenter)
  商品中心 (productCenter)
  内容中心 (contentCenter)
  AI直播中心 (liveCenter)
  订单中心 (orderCenter)
  客服中心 (customerServiceCenter)

增长与资金 (growth)
  流量网络中心 (trafficNetworkCenter)
  广告中心 (adCenter)
  Token 中心 (tokenCenter)

AI与自动化 (aiAutomation)
  Agent 工作室 (agentStudio)
  模型路由 (modelRouter)
  自动化策略 (automationPolicy)
  审批中心 (approvalCenter)

分析与系统 (analysisSystem)
  基准测试中心 (benchmarkCenter)
  回放中心 (replayCenter)
  评估中心 (evaluationCenter)
  系统中心 (systemCenter)
```

**No other first-class navigation module exists.** In particular:

- **Campaign Center is not part of V4.** It is explicitly deferred to V5 and must not be added
  without a new ADR/unfreeze decision (see §12).
- **Deliverables Center does not exist as a module** (removed in V4.2 — see §5).
- **After-sales Center does not exist as a standalone module** — it was renamed and absorbed into
  Customer Service Center in V4.3 (see §3).

---

## 2. Role of every first-class module

| Module | Role |
|---|---|
| AI 秘书处 (secretary) | Default landing page. CEO Morning Brief: command input, current operating state, actions requiring attention, active Agent executions, condensed financial/operational strip. Cross-links out to every other module; does not replicate any module's full data (see §8). |
| 今日经营 (dashboard) | Deeper analytics drill-down of the same operating data Secretary condenses — date-range toggles, trend charts, cross-system stat grid, recent activity. |
| 店铺中心 (storeCenter) | Real store CRUD/OAuth/credentials/connection test (`ShopCenterContent`, unchanged since Checkpoint A), plus the Founder-only Unified Platform Connector panel. |
| 商品中心 (productCenter) | Mock product catalog: listing, pricing, inventory, AI-generated listing content, publishing workflow. |
| 内容中心 (contentCenter) | Trend discovery → content production → compliance/originality checks → publishing → content ROI/review. Business deliverables (scripts, videos, copy) surface inline in each content project's detail view — not in a separate center. |
| AI直播中心 (liveCenter) | Livestream planning, lineup, script, digital-human/anchor config, live floor-control, review. Live plan deliverables surface inline in the unified live plan detail page. |
| 订单中心 (orderCenter) | Order list/detail, exception handling. |
| 客服中心 (customerServiceCenter) | Daily customer service + after-sales customer service, unified. Full scope in §3. |
| 流量网络中心 (trafficNetworkCenter) | Official accounts, matrix accounts, KOC/influencer collaboration, content supply distribution, traffic ROI/analytics — the one-to-many distribution layer between content production and every channel (accounts, live, ads). |
| 广告中心 (adCenter) | Independent advertising wallet and campaign management — financially separate from Token Center per ADR-0003's three-way separation (Token quota / advertising cash / RMB billing). |
| Token 中心 (tokenCenter) | AI usage/credit account: balance, ledger, grants, provider cost vs. selling price margin. |
| Agent 工作室 (agentStudio) | Store-scoped configuration instances of standard system Agent templates (Prompt/Skill/Knowledge/Tools/Model bindings). Founder cannot create new Agent types — only configure instances. Boundary detailed in §11. |
| 模型路由 (modelRouter) | Per-task-type model provider/routing configuration, shared with Agent Studio's Model Router tab. |
| 自动化策略 (automationPolicy) | Threshold/classification rules (automatic / requires approval / prohibited) governing ad budget, price changes, refunds, publishing, etc. |
| 审批中心 (approvalCenter) | Single queue for every pending decision across modules. Boundary detailed in §9. |
| 基准测试中心 (benchmarkCenter) | Agent benchmark suites and run comparisons. |
| 回放中心 (replayCenter) | Step-by-step Agent execution trace playback. Boundary detailed in §10. |
| 评估中心 (evaluationCenter) | Dataset-based Agent evaluation runs and version comparison. |
| 系统中心 (systemCenter) | Runtime status (real: start/stop/auto-resume), integration/LLM status, mock hardware/container/log panels. |

---

## 3. Customer Service Center (客服中心) scope

Built in V4.3, correcting the V4 After-sales Center to properly cover both business areas the
Founder operates day to day, not just after-sales resolution.

**Two business areas, one center:**
1. **日常客服 (Daily Customer Service)** — pre-sale and in-sale conversations: product/size/
   material/inventory/discount consultation, shipping-time and logistics enquiries, usage/
   installation guidance, campaign rules, order modification, purchase recommendation, product
   comparison, repeat-purchase recommendation.
2. **售后客服 (After-sales Customer Service)** — the full after-sales case workflow preserved
   unchanged from the former After-sales Center: refund only, return+refund, exchange, reshipment,
   missing/wrong/damaged item, quality issue, logistics exception, package not received, price
   dispute, negative-review handling, platform complaint/intervention, IP complaint. Flow: rule
   matching → responsibility determination → resolution proposal → customer communication →
   approval → execution → tracking → review — unchanged.

**8 sections:** 客服总览, 统一会话, 日常客服, 售后客服, 人工接管, 客服规则, 客服 Knowledge, 客服复盘.

**Store scope:** every conversation, queue, case, rule, and Agent assignment carries an explicit
store scope. "All stores" (全部店铺) is an administrative filter view only — every individual
conversation belongs to one specific store, platform, customer, and (where applicable) order.
统一会话 (Unified Conversations) is a read-only normalization layer over two independently
persisted mock repositories (daily conversations, after-sales cases) — it does not merge or
duplicate the underlying data models.

**Human takeover — AI never disappears:** every active conversation supports 7 mock hand-off
actions (立即接管, 交还 AI, AI 辅助回复, 仅生成回复草稿, 暂停自动回复, 转交其他客服, 升级
Founder) across 8 states and 3 automation modes (AI 全自动 / AI 生成草稿，人工发送 / 人工接管，
AI 辅助). After a human takes over, the AI assistant panel continues showing suggested reply,
product/order information, platform rules, knowledge sources, customer sentiment, risk warnings,
and recommended next action. All takeover/hand-back actions are mock-only.

**Preserved, not deleted:** the internal `afterSalesMock.js` module (case data, rules, mock flows,
detail views, localStorage key `afterSalesCenter.state`) was kept unchanged — only its top-of-file
documentation comment was updated. "售后" remains valid vocabulary as the 售后客服 subsection
label; it is the standalone "After-sales Center" as a first-class module that was retired.

---

## 4. Deliverable data model — preserved, not a module

`Deliverable` remains a real backend data model (AI-generated business result object, real
`deliverableApi.js` CRUD). It is **not** a first-class navigation module. Business outputs surface
inline in the module that owns them:

| Output type | Owning module |
|---|---|
| Product content | 商品中心 |
| Content assets | 内容中心 (inline in content project detail) |
| Traffic/distribution assets | 流量网络中心 |
| Livestream assets | AI直播中心 (inline in unified live plan detail) |
| Customer-service outcomes | 客服中心 |
| Advertising assets | 广告中心 |
| Pending decisions on any deliverable | 审批中心 (as 待审批事项, not a generic results repository) |
| Execution history | 回放中心 |
| Agent technical detail | Agent 工作室 |
| Executive summaries | AI 秘书处 |

---

## 5. Deliverables Center removal — final

Removed completely in V4.2 and reconfirmed in V4.3: no module, route, nav entry, capability key,
folder, or reference named 成果中心 / Deliverables Center / Deliverable Center exists anywhere in
`frontend/src/console/`. No generic replacement (Results Center, Asset Center, Output Center, Task
Results Center) exists or may be added without an explicit ADR/unfreeze decision. The old
`?module=deliverableCenter` URL falls back gracefully to the default module (AI 秘书处) — verified,
no crash, no console error.

---

## 6. Traffic Network Center role

流量网络中心 is the one-to-many distribution layer sitting between content production and every
consumption channel: official accounts, matrix accounts, KOC/influencer collaborations, live, and
ads. It is not a duplicate of 内容中心 (which produces content) or 广告中心 (which spends money) —
it is the routing/supply layer connecting them, with its own account-growth, ROI, and content-
supply analytics. Introduced in V4.1, unchanged in V4.3.

---

## 7. Mock-only safety boundary

No workflow in the Founder console executes any of the following as a real action: platform
login, OAuth, messaging, customer-service replies, publishing, livestreaming, advertising,
refunds, exchanges, order modifications, browser automation, or platform API connections. The
only real, non-mock mutating calls anywhere in the console are the pre-existing Store Center
(`ShopCenterContent`), Deliverable approve/reject (`deliverableApi.js`), and System Center runtime
start/stop/auto-resume calls that existed before the Founder console was built. Every mock module
visibly tags its data (`is_demo: true` + a "演示数据" badge in the UI).

---

## 8. AI Secretary boundary

AI 秘书处 is the CEO Morning Brief: a fixed vertical section order (command input → operating
state → actions requiring attention → active Agent executions → condensed financial/operational
strip), summarizing critical opportunities, risks, pending approvals, human-takeover requests,
traffic anomalies, advertising anomalies, livestream readiness, customer-service exceptions, order
exceptions, and Token/model-cost anomalies. It does not attempt to display every module's full
data, and it is not expanded into its own module directory beyond
`frontend/src/console/modules/secretary/`. Cross-system alert labels and targets were corrected in
V4.3 to point at 客服中心 (`customerServiceCenter`) instead of the retired After-sales Center.

---

## 9. Approval Center boundary

审批中心 is the single queue for every pending decision requiring Founder confirmation across
content, live, after-sales, advertising, and Agent-publish sources, plus real pending
`Deliverable` records. It is presented with Founder-oriented language (待审批事项) — never as a
generic results/output repository. It must not be turned into a second Deliverables-Center-style
generic module.

---

## 10. Replay Center boundary

回放中心 is step-by-step Agent execution trace playback, grounded against real task metadata where
available (`getTask(taskId)`). It surfaces execution history; it does not own or duplicate any
business deliverable data — those stay in their owning module per §4.

---

## 11. Agent Studio boundary

Agent 工作室 merges the real backend core Agents (`getAgents()`) with a frontend-only system
template catalog (`agentTemplatesMock.js`), all sharing one generic store-scoped configuration
architecture (`defaultConfigFor(agentName, storeId)`). The Founder can configure Prompt/Skill/
Knowledge/Tools/Model bindings per store-level instance; the Founder cannot create a new Agent
type. As of V4.3 this includes two customer-service categories — 日常客服 Agent (8 templates:
咨询受理/商品问答/订单查询/物流查询/销售转化/客户情绪/客服风控/会话总结) and 售后客服 Agent (8
templates, unchanged from V4) — both mapped to the same "客服运营" chain stage in the operating-
chain visualization (`AgentOperatingChain.jsx`), which now shows a single combined "客服 Agent
（日常客服 + 售后客服）" stage between Order and Knowledge Feedback.

---

## 12. Deferred: Campaign Center (V5)

Campaign Center is explicitly deferred to V5. It is not part of the V4 frozen navigation tree and
must not be added, referenced, or scaffolded under any name in V4 work.

## Unfreeze rule

**Any new first-class navigation module, any restoration of Deliverables Center or After-sales
Center as standalone modules, or any structural change to the frozen navigation tree in §1
requires an explicit ADR and an unfreeze decision before implementation** — following the same
governance chain established by the backend Reference Architecture freeze
(`architecture-freeze.md`): ADR → Architecture Review → Architecture Approval → Architecture
Update. No architecture change may be made directly against this frozen document.

---

## 13. Verification results (2026-07-24)

- `npm run lint` — 0 errors, 4 pre-existing warnings unrelated to this work (`react-hooks/
  exhaustive-deps` in `OrderCenterModule.jsx:150` and `ProductCenterModule.jsx:42-58`, predating
  V4.3).
- `npm run build` — succeeds (`vite build`), one pre-existing chunk-size advisory (not an error).
- `npm run test` (vitest) — 13 test files, 92 tests, all passing.
- Browser regression pass (`?mode=founder`, live dev server): full nav renders with zero console
  errors; Customer Service Center's 8 tabs all render; store-scope filtering (统一会话) confirmed
  functional; human-takeover action (立即接管) confirmed to update status/owner/automation mode,
  append a system message, and keep the AI assistant panel visible; 日常客服 and 售后客服 tabs
  both render their respective mock data; Agent Studio shows all 58 Agent types (5 core + 53
  templates) including the 8 new 日常客服 Agent templates; the Agent 关系图 chain visualization
  renders the corrected 客服 Agent stage; Dashboard's 售后工单数/退款率 stat cards correctly
  navigate to Customer Service Center; the old `?module=afterSalesCenter` and
  `?module=deliverableCenter` URLs both fall back gracefully to the default module with zero
  console errors; Approval Center and Automation Policy render without error.

## 14. Commit

This freeze document is delivered in the same commit as the V4.3 Customer Service Center
correction and Founder V4 architecture freeze: see `git log --oneline -1` at the time this
document was committed (commit message: `feat(founder): freeze V4 commerce operating
architecture`).

---

Chief Software Architect

AI Commerce OS
