# Foundation Reset Phase 2 Cleanup Audit V1

## 审计范围与基线

- 仓库：`AI-Commerce-OS`
- 分支：`feature/foundation-reset-integration`
- 基线：`ada7b57f381cff2be9905058e473aa8d379196e8`
- 本报告仅记录审计结果和后续规划；本轮未删除、移动、重命名或迁移任何代码、表或 API。

## 1. Package Boundary Audit

### 当前结构

当前每个 canonical asset 同时存在两层实现：

- `backend/core/<domain>/model.py`：实际 SQLAlchemy domain model 来源。
- `backend/app/core/<domain>/model.py`：对 canonical model 的导入适配层；`api.py` 与 `service.py` 也位于此处。

### 分类

| 路径 | 当前角色 | 分类 | 规划 |
|---|---|---|---|
| `backend/core/application_system` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/core/conversation` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/core/context` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/core/decision` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/core/task_asset` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/core/artifact` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/core/memory` | canonical domain model | KEEP | 保持唯一 domain 来源 |
| `backend/app/core/<上述域>` | API/service/application adapter | KEEP → MERGE | 未来统一为 application layer，不再放置第二份 model |
| `backend/app/core/config.py`, `edition.py`, `external_task_auth.py` | 应用基础设施 | KEEP | 不属于 domain consolidation |
| `__pycache__` | 生成物 | REMOVE（安全清理时） | 不纳入源码或发布包 |

结论：不存在 domain model 重复定义，但存在容易误解为“双 Core”的 package 形态。建议保持 `backend/core` 为唯一 domain layer，逐步将 `backend/app/core` 收敛为 API/service adapter；不要在本阶段删除现有 wrapper。

## 2. Legacy Model Audit

| 领域 | Legacy 实现 | Canonical Model | 当前分类 | 后续处理 |
|---|---|---|---|---|
| Task | `app.models.task_db.TaskDB`、旧 task API、recovery/consumer services | `core.task_asset.TaskAssetDB` | KEEP（兼容） | MERGE/adapter 后再 DEPRECATE |
| Task | TaskPackage / job / execution task 概念（分散在服务和测试中） | `TaskAssetDB` | MERGE | 先建立字段映射，不删除运行能力 |
| Artifact | `DeliverableDB`、`DeliverableVersionDB`、导出服务 | `ArtifactAssetDB` | KEEP（兼容） | 建立 projection/adapter 后再迁移 |
| Artifact | file/output/result 相关结果 | `ArtifactAssetDB` | MERGE | 明确哪些是 content/location，保留旧导出链路 |
| Memory | knowledge 文档 (`app.services.knowledge_service`) | `MemoryAssetDB` | KEEP（不同职责） | Knowledge 先作为来源，不直接删除 |
| Memory | history / Deliverable version history | `MemoryAssetDB` | KEEP（历史记录） | 未来按资产来源投影 |
| Memory | runtime memory snapshot | `MemoryAssetDB` | INTERNAL | 不等同长期 MemoryAsset |
| Memory | `MemoryAssetDB` | `MemoryAssetDB` | KEEP | 当前 canonical 长期资产 |

Canonical 关系：

`ApplicationSystem → Conversation → Context → DecisionAsset → TaskAsset → ArtifactAsset → MemoryAsset`

Legacy 实现目前不能直接互换 canonical 数据，必须经过 adapter 或 projection。

## 3. API Route Audit

### Canonical API（KEEP）

- `/api/v1/application-systems`
- `/api/v1/conversations`
- `/api/v1/conversations/{id}/context`
- `/api/v1/decisions`
- `/api/v1/task-assets`
- `/api/v1/artifacts`
- `/api/v1/memories`

这些接口均按 `system_id=founder_ai` 进行边界过滤或注入。

### Legacy / Internal API

| 路由族 | 分类 | 说明 |
|---|---|---|
| `/api/v1/tasks` | KEEP → DEPRECATE | 现由 TaskDB、Runtime、Recovery 使用；与 canonical TaskAsset 路径不同，不能直接覆盖 |
| `/api/v1/deliverables` | KEEP → MERGE | 旧 Deliverable/版本/导出工作流，ArtifactAsset adapter 完成前不得删除 |
| `/api/v1/knowledge` | KEEP | 业务知识文档能力，不等同 MemoryAsset |
| `/api/v1/runtime` | KEEP（内部基础设施） | Runtime/Execution 不属于 TaskAsset domain |
| `/api/v1/agents`, `/integrations`, `/shops`, `/products`, `/orders` 等 | KEEP（业务/基础设施） | 不属于本轮 canonical asset cleanup |
| `/api/v1/dashboard`, `/analytics` | INTERNAL / DEPRECATE | 仅在产品入口收敛时评估，不在本轮移除 |

重要冲突：`/api/v1/tasks` 已被旧 TaskDB 占用，因此 TaskAsset 使用 `/api/v1/task-assets`，避免破坏现有 Runtime API。未来若要把 `/api/v1/tasks` 统一为 TaskAsset，必须先完成兼容迁移和旧 API 版本化。

## 4. Frontend Entry Audit

### Product Entry（KEEP）

- `frontend/src/App.jsx`、`frontend/src/main.jsx`：应用壳和入口分发。
- `frontend/src/console/`：Founder Console / Founder 工作台主产品入口。
- `frontend/src/operator-preview/`：Operator 独立预览应用入口。
- `frontend/src/studio/`：Studio 应用入口。
- `frontend/src/cloud/`：Cloud 基础设施入口。

### Internal Capability（降级为内部能力）

- `frontend/src/console/modules/founderWorkspace/`
- `frontend/src/console/modules/decisions/`
- `frontend/src/console/modules/agentCenter/`
- `frontend/src/console/modules/promptCenter/`
- `frontend/src/console/modules/skillCenter/`
- `frontend/src/console/modules/workflowCenter/`
- `frontend/src/console/modules/capabilityCenter/`
- `frontend/src/console/shell/`

这些模块应由 Founder Application System 统一承载，而不是继续演化为独立产品身份。

### Legacy / Prototype（后续审查）

- `frontend/src/components/dashboard/`
- `frontend/src/components/tasks/` 中直接面向旧 TaskDB 的面板
- `frontend/src/components/deliverables/` 中旧 Deliverable UI
- `frontend/src/console/mock/` 与 `demoData/` 中只用于原型的数据
- `frontend/src/console/modules/workspaceProto/`
- `frontend/src/console/labs/` 中未纳入 canonical Application System 的实验页

本轮仅分类，不删除或修改上述页面。

## 5. Database Table Audit

### Canonical（KEEP）

- `application_systems`
- `conversations`
- `conversation_contexts`
- `decision_assets`
- `task_assets`
- `artifact_assets`
- `memory_assets`

### 兼容保留 / 未来迁移

- `tasks`（TaskDB 及其运行字段）
- `deliverables`
- `deliverable_versions`
- knowledge 相关表（由现有 knowledge service 管理）
- runtime state、operation logs、provider/token 等基础设施表

这些表不能在未完成数据映射、双写/投影、回滚验证前废弃。

### 废弃候选（尚未执行）

- 仅属于 mock/prototype 的临时表或测试数据表（需逐项确认引用后处理）。

## 6. Canonical Cleanup Rules

1. Domain model 只能新增到 `backend/core/<domain>`。
2. `backend/app/core` 只承载 application service、schema、API adapter，不再定义第二份模型。
3. 新产品 API 优先使用 canonical asset 命名；旧路由必须通过 adapter 或版本化迁移退出。
4. TaskDB、Deliverable、Knowledge、History 不得被简单重命名为 canonical asset；先建立来源映射。
5. 不删除旧表，直到完成数据迁移、读写切换、回滚和历史数据验证。
6. Frontend 一级入口表达 Application System；Runtime、Capability、Builder、Dashboard 等只作为内部能力或兼容页面。

## 7. Cleanup Roadmap

### Phase 2.1 — Package Consolidation

- 固化 `backend/core` 唯一 domain 来源。
- 清点并消除反向 import 与重复 model 定义。
- 保留 `app/core` adapter，增加清晰的 boundary tests。

### Phase 2.2 — Legacy API Cleanup

- 为 TaskDB、Deliverable 建立 canonical adapter/projection。
- 规划 `/api/v1/tasks` 版本化或兼容别名，不能直接覆盖。
- 记录 deprecation headers 和消费方。

### Phase 2.3 — Frontend Cleanup

- 收敛一级入口到 Application Systems。
- 将旧 Developer/Builder/Capability/Runtime 页面降级为内部能力。
- 替换 mock/prototype 数据源前先完成真实 API 接入验证。

### Phase 2.4 — Database Cleanup

- 先双读/投影，再迁移历史 Task、Deliverable、Knowledge 数据。
- 完成一致性校验和回滚演练后，才评估旧表废弃。

### Phase 2.5 — Final Verification

- API contract、system isolation、历史数据、Runtime 兼容性和前端入口回归。
- 确认 canonical assets 作为唯一 SSOT，且旧能力仍可安全访问或已版本化退出。

## 8. 风险摘要

- 高风险：`/api/v1/tasks` 路由冲突、TaskDB/TaskAsset 双写不一致、Deliverable 历史版本迁移。
- 中风险：`backend/core` 与 `backend/app/core` import 边界、前端旧入口与 canonical API 并存。
- 低风险：mock 文件、生成的 `__pycache__`、未引用的 prototype 页面清理。

## 结论

当前 canonical asset 链路已经完整建立；主要清理风险来自旧 TaskDB/Deliverable API 与产品入口，而不是 canonical domain 缺失。建议先做 package boundary 和 adapter 设计，再进行任何 API 或数据库删除。
