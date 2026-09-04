# Foundation Reset Phase 2.4.3
# Legacy Data Source Switch Plan V1

基线：`686c58f1e09bb3200358e3aed6c4e5d554962fda`（Founder canonical asset views）。

本文件是只读审计与迁移规划，不执行页面、API、数据库或 Legacy 功能修改。

## Current Mapping

| 页面/能力 | 当前数据源 | Canonical 目标 | 结论 |
| --- | --- | --- | --- |
| `frontend/src/pages/TaskCenter.jsx` | `services/api.js` 的 `/tasks`、`/tasks/stats`；`taskApi.js` 的 recovery/requeue/mark-failed/submit | `taskAssetApi.js` 的 `/task-assets` | 列表与详情应迁移到 TaskAsset；恢复、重试、提交等运行控制仍由 Runtime/Legacy adapter 承担，不能直接替换。 |
| `frontend/src/pages/DeliverableCenterContent.jsx`、`DeliverableCenter.jsx` | `services/deliverableApi.js` 的 `/deliverables`、版本、导出及审核操作 | `artifactApi.js` 的 `/artifacts` | 展示模型可迁移；版本、导出、归档/恢复、后续派工需要 Artifact adapter 保留旧能力。 |
| `frontend/src/pages/KnowledgeBase.jsx` | `services/knowledgeApi.js` 的 `/knowledge/documents` | Knowledge 仍是知识源；仅被明确提炼的长期内容才进入 `memoryApi.js` | 不应把 Knowledge 直接改名或复制成 MemoryAsset。 |
| History/对话历史 | 当前由 Conversation/历史 UI 语义承载；未发现独立 `/history` 或 `/business-memory` Canonical API | Conversation History；可产生 MemoryAsset，但不是 MemoryAsset 本身 | 保留时间线、消息和恢复语义，禁止用 MemoryAsset 替代历史记录。 |
| Runtime 面板（如 `components/runtime/RuntimeStatusPanel.jsx`） | `runtimeApi.js` 的 `/runtime/*`，以及 TaskDB 执行状态 | Runtime/Execution 基础设施 | 不切换为 TaskAsset 的数据源；TaskAsset 只投影任务资产边界。 |
| Founder Canonical Views | `services/taskAssetApi.js`、`artifactApi.js`、`memoryApi.js` | 同上 | 已是目标读模型，可作为迁移后的验收基准；目前不替换旧页面。 |

## Task Migration

### 当前实现

`TaskCenter` 通过 `getTasks`/`getTaskStats` 读取旧 `/tasks`，并依赖旧字段、分页、店铺范围过滤及 5 秒轮询；详情抽屉和 `RecoveryCandidatesPanel` 还依赖 `taskApi` 的运行恢复接口。`TaskSubmitPanel` 继续使用 `/tasks/submit`。这些接口与 `/task-assets` 的领域边界、字段和生命周期并不等价。

### 目标映射

| Legacy TaskDB 字段/语义 | TaskAsset 目标 |
| --- | --- |
| `id` | `id` |
| `title`/任务名称 | `title` |
| 任务说明、payload、目标摘要 | `description`/`scope`（需明确投影规则） |
| `status` | `status` |
| 旧执行状态 | `execution_status` |
| 旧审批或人工门禁（若存在） | `approval_status` |
| 结果/错误摘要 | `result` |
| 系统边界、会话、决策关联 | `system_id`、`conversation_id`、`decision_id` |

### 推荐方案

不直接改写 `TaskCenter` 的 API 调用。先建立 `TaskAdapter` 作为兼容读模型：统一 TaskDB 与 TaskAsset 的显示字段、状态映射和分页形状；新 Founder 资产页面继续使用 `taskAssetApi`。当所有只读消费者通过 adapter 并完成字段/过滤验收后，再将 TaskCenter 的列表与详情切换到 TaskAsset。Recovery、requeue、mark-failed、submit 必须保留旧 Runtime 调用，直到有明确的 TaskAsset→Execution adapter。

## Artifact Migration

### 当前实现

成果中心使用 `deliverableApi.js`：列表、详情、版本、导出、approve/reject、archive/restore 以及从成果继续派工均来自 DeliverableDB/DeliverableVersion。`Deliverable` 还携带旧业务筛选、店铺范围和导出格式语义。

### 目标映射

| Deliverable 语义 | ArtifactAsset 目标 |
| --- | --- |
| `id` | `id` |
| `title`、摘要 | `title`、`description` |
| 成果类别 | `artifact_type` |
| 文件/版本位置 | `location`、`content_ref` |
| 当前版本 | `version` |
| 生命周期状态 | `status` |
| 来源任务/对话/决策 | `task_asset_id`、`conversation_id`、`decision_id` |

版本列表、导出文件、审核/归档、恢复和 follow-up task 不应在第一次切换中丢失。`DeliverableAdapter` 应将旧版本与 ArtifactAsset 投影为统一只读卡片；写操作仍路由到旧服务，直到 Artifact API 提供等价能力并完成双路径验收。

## Memory Migration

### 语义边界

- **Knowledge**：可检索的知识文档与来源，当前由 `/knowledge/documents` 管理。
- **History**：Conversation 消息、历史恢复和时间线；不是长期记忆资产。
- **MemoryAsset**：Founder AI 明确沉淀的 decision、knowledge、experience、pattern 或 rule，具有 `system_id`、来源关联、置信度和状态。

当前未发现独立 `/history` 或 `business-memory` Canonical 路由；因此不能以“统一接口”为由把 History 或 Knowledge 批量复制进 MemoryAsset。MemoryAsset 应通过显式提炼/创建或经 Founder 确认的投影产生，并保留 `conversation_id`、`decision_id`、`task_asset_id`、`artifact_id` 来源。

### Adoption Strategy

1. 继续以 Knowledge API 提供文档检索，以 Conversation 数据提供历史恢复。
2. Founder Memory View 使用 `memoryApi` 读取真正的 MemoryAsset。
3. 对需要长期保留的知识、决策或执行经验，新增明确的 `MemoryAdapter`/提炼入口；默认不自动写入。
4. 历史和知识的迁移只做可追溯的来源投影，不删除原表、不覆盖原语义。

## Adapter Strategy

### TaskAdapter

- 输入：旧 `/tasks`、`/tasks/stats`、必要时 `/tasks/{id}`，以及 `/task-assets`。
- 输出：统一的 `{ id, title, description, scope, status, approval_status, execution_status, result, system_id, conversation_id, decision_id }` 读模型。
- 旧执行控制（recovery/requeue/mark-failed/submit）保持原 endpoint；adapter 只负责投影与兼容，不伪造 TaskAsset 的审批或执行状态。
- Founder 查询必须带 `system_id=founder_ai` 的边界；旧数据无边界时只能进入兼容标记，不能静默归入其他系统。

### DeliverableAdapter

- 输入：`/deliverables`、详情、版本、导出及状态操作与 `/artifacts`。
- 输出：统一 ArtifactAsset 卡片和版本摘要。
- 对 location/content_ref、版本号、导出链接保留来源标识；写操作在 Canonical API 能力齐备前继续走 Legacy service。

### MemoryAdapter

- 输入：MemoryAsset、Knowledge 文档和 Conversation History 的明确来源。
- 输出：按 `memory_type`、`status`、`confidence` 和来源资产分组的 Founder Memory 读模型。
- 严格区分 Knowledge、History、MemoryAsset；没有显式来源或 Founder 确认时不创建 MemoryAsset。

### 切换原则

- 先读后写：先把只读页面接入 adapter，再迁移写操作。
- 单一显示模型：页面不同时拼接两套字段；adapter 负责归一化。
- 不删除、不双写：在回滚窗口内保留 Legacy API 和旧表；避免未经验证的双写造成重复资产。
- 逐页面 feature flag/回滚开关，Canonical API 失败时显示明确错误，不静默降级为错误数据源。

## Risk

### High

- `/tasks` 是现有 TaskDB/运行恢复入口，与 TaskAsset 不是同一生命周期；直接替换可能破坏 recovery、重试和执行状态。
- Deliverable 的版本、导出、审核和 follow-up 派工没有一一对应的 Artifact API 能力。
- Legacy 数据缺少 `system_id`/资产关联时，自动归属 Founder 可能造成跨系统污染。

### Medium

- 旧分页、店铺筛选、轮询和状态枚举与 Canonical response shape 不一致。
- Knowledge、History、MemoryAsset 的用户语义容易混淆；历史恢复不能被“记忆列表”替代。
- 旧页面与新 Founder Views 并存时，导航和缓存可能展示不同数据源。

### Low

- 只读 Founder Canonical Views 已有独立 service、类型和空/错状态，可作为 adapter 验收基线。
- 新增 adapter 类型和映射测试不会改变后端合同或数据库。

## Recommended Sequence

1. 冻结当前 Legacy 页面与 API，记录字段/状态/过滤快照。
2. 先实现并测试三个 adapter 的只读映射，覆盖空、错误、分页、边界和来源追踪。
3. 以 Founder Canonical Views 对照验证 TaskAsset、ArtifactAsset、MemoryAsset 数据。
4. 将 TaskCenter 仅切换列表/详情读路径；保留 Runtime 操作路径，观察后再处理写入。
5. 将 DeliverableCenter 仅切换成果读路径；完成版本/导出/审核等能力对照后再迁移操作。
6. 明确 Knowledge→MemoryAsset 的提炼入口，保持 History 独立。
7. 最后再规划 Legacy 页面下线；本阶段不删除页面、API 或数据库表。
