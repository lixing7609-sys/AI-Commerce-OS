# Foundation Reset Phase 2.3
# Frontend Canonical Asset Adoption Audit V1

## Audit Baseline

- Repository: `AI-Commerce-OS`
- Branch: `feature/foundation-reset-integration`
- Baseline: `553266fc3fa68490f0919fcf0b3d9c299accf2ca`
- Scope: read-only frontend route, component and API dependency audit.
- No frontend files, routes or API contracts were changed.

## 1. Frontend Route Audit

### Canonical Asset Pages

当前没有独立的 Founder canonical asset 页面或 frontend service 接入以下 API：

- `/api/v1/task-assets`
- `/api/v1/artifacts`
- `/api/v1/memories`

Conversation/Context/Decision/TaskAsset/ArtifactAsset/MemoryAsset 的 canonical backend 已存在，但前端体验层尚未形成对应的真实数据页面。

### Legacy Pages

- `frontend/src/App.jsx`：旧 Developer edition application shell。
- `frontend/src/pages/TaskCenter.jsx`：TaskDB 任务中心。
- `frontend/src/pages/DeliverableCenter.jsx`、`DeliverableCenterContent.jsx`：旧 Deliverable 页面。
- `frontend/src/pages/KnowledgeBase.jsx`：Knowledge 文档页面。
- `frontend/src/pages/Dashboard.jsx`、`Overview.jsx`、`Analytics.jsx`：旧 Dashboard/TaskDB 聚合页面。
- `frontend/src/components/tasks/*`：旧任务提交、恢复、详情组件。
- `frontend/src/components/deliverables/*`：旧 Deliverable/Follow-up Task 组件。
- `frontend/src/components/runtime/*`：Runtime 状态控制组件。
- `frontend/src/operator-preview/pages/DeliverablesPage.jsx`、`BusinessMemoryPage.jsx`、`DashboardPage.jsx`：Operator 预览侧 Legacy/演示页面。

### Internal Product Shells

- `frontend/src/console/`：Founder/Console 产品壳和大量内部能力模块。
- `frontend/src/cloud/`：Cloud 基础设施应用。
- `frontend/src/studio/`：Studio 应用。
- `frontend/src/operator-preview/`：Operator 预览应用。

这些不是本轮删除目标；需要在 Application System 页面架构中明确归属。

## 2. API Usage Map

| API | Frontend service / consumer | 分类 | Adoption 状态 |
|---|---|---|---|
| `/api/v1/tasks` | `services/api.js`、`services/taskApi.js`、TaskCenter、Agents、Dashboard、Overview、Secretary、Operator shared pages | Legacy TaskDB | 高依赖，需 adapter 后迁移 |
| `/api/v1/task-assets` | 未发现真实调用 | Canonical TaskAsset | 尚未接入 |
| `/api/v1/deliverables` | `services/deliverableApi.js`、DeliverableCenter、ApprovalCenter、Operator shared products | Legacy Deliverable | 高依赖，需版本/导出兼容 |
| `/api/v1/artifacts` | 未发现真实调用 | Canonical ArtifactAsset | 尚未接入 |
| `/api/v1/knowledge` | `services/knowledgeApi.js`、KnowledgeBase、Operator real-data adapter | Knowledge source | 保持独立，不能直接替换 MemoryAsset |
| `/api/v1/memories` | 未发现真实调用 | Canonical MemoryAsset | 尚未接入 |
| `/api/v1/runtime` | `services/runtimeApi.js`、RuntimeStatusPanel、Dashboard、Operator Settings | Runtime infrastructure | 保持 Legacy/Internal |
| `/api/v1/analytics/tasks` | `services/analyticsApi.js`、Analytics、Overview、Dashboard | TaskDB aggregate | 依赖 Legacy TaskDB |
| `/api/v1/agents` | `services/agentApi.js`、Agents、Agent Studio、Model Router | Agent capability | 内部能力，非 asset 页面 |

说明：代码中 `history` 主要作为版本/历史语义出现，未发现独立 `/api/v1/history`；`business-memory` 路由也未发现。

## 3. Founder AI Experience Audit

### Home

- 现有 `App.jsx` 默认进入 `Dashboard`，不是 canonical Founder AI Home。
- `frontend/src/console/modules/founderWorkbench/` 提供 Founder 工作台模块，但内容以 Dashboard/聚合视角为主。
- 尚未发现通过 `/conversations` 创建或恢复 Conversation 的 Founder Home service。

### Sidebar

- 旧 `frontend/src/components/layout/Sidebar.jsx` 服务于 Developer edition。
- `frontend/src/console/shell/ConsoleSidebar.jsx` 服务于 Console，并包含 Founder/Capability/Operator/Studio/Cloud 等产品组织概念。
- 尚未形成“Conversation History + Projects + canonical assets”的统一 Founder Sidebar。

### Workspace / Task / Artifact / Memory

- Task 体验依赖 TaskDB (`TaskCenter`, `TaskSubmitPanel`, Recovery panels)。
- Artifact 体验依赖 Deliverable (`DeliverableCenter`, Approval Center, export/version actions)。
- Memory 体验主要是 KnowledgeBase、BusinessMemory 演示和历史状态，未接 `/memories`。
- 因此当前 Founder Experience 与 canonical asset chain 尚未闭环。

## 4. Component Dependency Audit

| 组件/页面 | 当前数据来源 | 分类 | 迁移方向 |
|---|---|---|---|
| `TaskCenter` | `/tasks` + TaskDB | Legacy | 逐步投影到 TaskAsset，Runtime 操作保留 |
| `TaskSubmitPanel` / `RecoveryCandidatesPanel` / `TaskDetailDrawer` | `/tasks/*` | Legacy/Internal | 先保留，未来拆分 TaskAsset 查看与 Runtime 执行 |
| `DeliverableCenter*` | `/deliverables` | Legacy | 迁移到 ArtifactAsset 读取，保留导出/版本能力 |
| `CreateFollowUpTaskDialog` | Deliverable → TaskDB | Legacy coupling | 通过 TaskAsset adapter 重连 |
| `KnowledgeBase` | `/knowledge` | Knowledge product | 保持独立；MemoryAsset 仅引用/提炼 |
| `Dashboard` / `Overview` / `Analytics` | Dashboard + TaskDB/analytics/runtime | Legacy aggregate | 降级为内部能力，避免作为 Founder canonical Home |
| `RuntimeStatusPanel` / runtime controls | `/runtime` | Infrastructure | 保持内部 Runtime 控制，不迁移为 Memory/Task 页面 |
| `BusinessMemoryPage` | Operator preview/demo | Legacy/demo | 先标记来源，不与 canonical MemoryAsset 混用 |

## 5. Experience Gap

当前缺口：

1. Founder Home 未以 Conversation 为唯一入口。
2. Sidebar 没有 canonical Conversation History / Projects 结构。
3. 前端没有 TaskAsset、ArtifactAsset、MemoryAsset service/page。
4. Legacy TaskDB、Deliverable 和 Dashboard 仍承担主要用户体验。
5. TaskDB 的执行状态和 TaskAsset 的执行资产尚未分层展示。
6. Knowledge、History、BusinessMemory 与 MemoryAsset 的语义边界尚未在 UI 中体现。

## 6. Final Adoption Plan

### Phase A — TaskAsset Adoption

- 新增 canonical `taskAssetApi` 只读/创建适配层。
- 建立 TaskDB → TaskAsset projection 和字段映射。
- 先迁移 Founder-facing task summary，保留 Runtime/Recovery 旧页面。
- 验证 system isolation、历史任务显示和执行链路不变。

### Phase B — ArtifactAsset Adoption

- 新增 `artifactApi` 与 ArtifactAsset list/detail 页面。
- 将 Deliverable version、location、content_ref 映射为 ArtifactAsset 视图。
- 保留旧导出、审批、再生成和 follow-up 行为。
- 完成内容/版本一致性后再标记 Deliverable UI deprecated。

### Phase C — MemoryAsset Adoption

- 新增 `memoryApi` 与 MemoryAsset 只读视图。
- 明确 Decision/Experience/Knowledge/Pattern 等 memory type 的来源。
- KnowledgeBase 继续作为 source knowledge，不直接替换。
- 不引入 Vector DB、Embedding 或 Evolution 行为。

### Phase D — Legacy UI Deprecation

- 将 Dashboard、TaskCenter、DeliverableCenter、旧 Runtime panel 降级为内部能力。
- Founder Home/Sidebar 只暴露 Application System、Conversation、Projects 与 canonical assets。
- 迁移全部 frontend consumers 后，再版本化或隐藏 Legacy API/UI。

## 7. Verification Requirements

- Canonical pages 只能读取对应 canonical API，不能偷偷回退为 TaskDB/Deliverable 数据。
- Legacy pages 在迁移期间继续通过原 API 工作。
- TaskAsset、ArtifactAsset、MemoryAsset 的 `system_id` 隔离可验证。
- Founder Home、Conversation、Project、Asset Detail 的导航和历史恢复需端到端回归。
- 迁移期间不得改变 Runtime、Approval、Deliverable export 的既有行为。

## 8. Conclusion

当前前端仍是 Legacy-first：TaskDB、Deliverable、Knowledge 和 Runtime API 承担主要体验；canonical asset API 尚未被真实页面消费。建议按 TaskAsset → ArtifactAsset → MemoryAsset 顺序增量接入，完成真实 API 和状态映射后，再进行 Legacy UI/API 弃用。
