# 后端复用审查（Backend Reuse Audit）

状态：初稿，V2-001 任务第十二条要求的复用分类。审查对象：`backend/`（FastAPI + SQLAlchemy + Alembic，Python ≥3.12）。
**不删除、不直接复制**现有后端，仅分类，接入与否由后续 Phase 6 开发时按需决定。

## 1. 分类总览

| 能力域 | 现状 | 分类 | 理由 |
|---|---|---|---|
| 认证（Edition 门控） | `app/core/edition.py`：`Edition` 枚举（DEVELOPER/OPERATOR/DEVICE_ADMIN/OPERATOR_CLOUD），`require_edition()` 依赖注入按环境变量 `EDITION` 门控路由可达性 | **需要适配** | 已经是"同一 Core、不同 Edition 门控可见路由"的架构，与 [01-architecture.md](01-architecture.md) 3.1 节"同一内核、不同权限边界"的方向一致；但 Edition 是进程级环境变量，不是请求级 Tenant/Role，需要在此基础上加一层请求级 Tenant/Role 解析，而不是重写 |
| 外部任务鉴权 | `app/core/external_task_auth.py`：`X-Task-API-Key` Header + HMAC 校验，503/401 语义区分明确 | **可以直接复用** | 是 Connector/外部 Workflow 接入网关的合理鉴权模式，可直接用于 V2 的 Connector 对象鉴权 |
| Token/AI 经营额度账本 | `app/models/token_account_db.py` + `token_ledger_entry_db.py` + `token_lot_db.py` + `token_adjustment_db.py` + `token_pricing_snapshot_db.py`（ADR-0003 Token Domain Model，账户身份与余额投影分离，`owner_scope_type` 目前只有 `installation` 单例，代码注释已预留"未来引入真实 Operator/Business Cell"的迁移路径） | **需要适配** | 这是 [02-domain-model.md](02-domain-model.md) 4.1 节 **AIQuota** 对象最接近的现有实现，账本/投影分离的设计本身值得保留；需要适配的地方是把 `owner_scope_type="installation"` 单例扩展为真实 Tenant 维度，并接入新的 Device/License 对象 |
| 数据库基座 | `app/database/base.py` / `db.py`（SQLAlchemy + Alembic 迁移） | **可以直接复用** | 与技术栈无关的基础设施，V2 新增表结构可以直接在此基础上加 migration，不需要另起数据库层 |
| 商品/订单/库存/店铺/供应商模型 | `app/models/product*.py`、`order*.py`、`inventory*.py`、`store*.py`、`supplier*.py`、`shop_*.py` 及对应 `app/api/v1/*.py` 路由 | **需要适配** | 字段设计成熟（create/update/db 三段式模式一致），是 [02-domain-model.md](02-domain-model.md) 中 Product/Order/Store 等经营对象的良好起点；需要适配处：补充与 Brand/Campaign/Profit 等 V2 新对象的外键关系，字段命名从"电商 ERP 视角"向"经营闭环视角"做少量调整（如显式增加 profit 归集字段） |
| 平台连接器（Connector） | `app/integrations/platforms/{amazon,douyin,shopee,taobao}.py` + `base.py` + `registry.py` + `mock_or_unconfigured.py` | **可以直接复用** | 已经是"统一 base 接口 + 平台适配器 + registry 注册 + mock 兜底"的 Connector 架构范式，与 [02-domain-model.md](02-domain-model.md) 的 Connector 对象定义高度吻合，可直接作为 V2 Connector 层的实现基础 |
| 运行时引擎（Runtime/Agent 调度） | `app/runtime/engine/runtime_engine.py` + `events/`、`executor/`、`memory/`、`scheduler/`、`task.py`、`task_queue.py` | **需要适配** | 已有事件驱动的调度骨架（events/executor/scheduler/memory 分层与 [01-architecture.md](01-architecture.md) L2 能力层的 Agent/Workflow/Memory 划分一致），需要适配处：接入 Tenant/Role 解析（见上）、接入 Capability 对象的验证状态门控，调度前先判断 Capability 是否"已验证" |
| Agent 实现 | `app/agents/`：`ai_ceo_agent.py`、`product_agent.py`、`sales_agent.py`、`operational_agent.py` + 各自 context/prompt/response 模块 + `agent_registry.py` | **需要适配** | Prompt/Context/Response 三段式结构可直接沿用为 V2 Agent 的实现范式；`ai_ceo_agent` 的定位需要重新对照 V2 的"SinoFUT 秘书 vs 各 Agent"边界重新划分职责，不能整体照搬其业务逻辑（V1 的 ai_ceo 是电商 ERP 决策视角，不是 V2 的四身份验证视角） |
| 看板/Dashboard | `app/models/dashboard*.py` + `app/api/v1/dashboard.py` | **暂不接入** | V2 的 Founder 驾驶舱是"六问"结构（见 [03-information-architecture.md](03-information-architecture.md) 2.2 节），与 V1 dashboard 的卡片模型不是同一套信息架构，第一阶段先用前端 mock 数据跑通六问驾驶舱，暂不接入此后端能力 |
| 知识/交付物 | `app/api/v1/knowledge.py`、`deliverables.py` + `app/models/deliverable_*.py` | **暂不接入** | 对应 V2 的 Knowledge/Content 对象，但字段设计还是 V1 视角，第一阶段用演示数据代替，第二阶段再评估适配成本 |
| 操作日志 | `app/models/operation_log_db.py` + `app/services/operation_log_service.py` | **可以直接复用** | 通用审计日志能力，与具体业务视角无关，可直接复用于 V2 的 Approval/Task 审计轨迹 |
| WeCom 集成 | `app/api/v1/wecom.py` | **已废弃但暂时保留** | V1 特定渠道集成，V2 尚未定义是否需要企业微信通道，暂时保留代码但不在 V2 中引用 |

## 2. 与 V2 领域模型的映射小结

| V2 领域对象（见 02-domain-model.md） | 最接近的后端现状 | 复用结论 |
|---|---|---|
| Product / Order / Store / Customer（经 Supplier/Shop 间接） | `models/product*`、`order*`、`store*`、`shop_*` | 需要适配 |
| AIQuota | `models/token_account_db.py` 系列 | 需要适配（owner_scope 从单例扩展为 Tenant 维度） |
| Connector | `integrations/platforms/*` | 可直接复用 |
| Agent / Workflow / Memory | `runtime/*` + `agents/*` | 需要适配（接入 Tenant/Role + Capability 验证门控） |
| Tenant / Role-Permission / Device / License | 无对应实现（`Edition` 枚举是最接近的雏形） | 必须重写（在 Edition 门控基础上新建，见第1节"认证"行） |
| Approval / Task 审计 | `operation_log_db.py` + `operation_log_service.py` | 可直接复用 |
| Brand / Campaign / Profit / Opportunity / Strategy / Capability | 无对应实现 | 必须重写 |

## 3. 第一阶段接入建议

Phase 5/6 的应用壳层与首批页面**优先使用前端演示数据层**（见 V2-001 任务第十七条），暂不强依赖后端接入，理由：

1. Tenant/Role/Device/License/Capability/Opportunity/Strategy/Brand/Campaign/Profit 均需要重写或全新建模，短期内接入真实后端反而拖慢首个可视化闭环的交付。
2. Connector（可直接复用）与 Token/AIQuota 账本（需要适配）是价值最高、值得优先真实接入的两块，建议列为 Phase 6 之后第一批后端适配任务。
3. 运行时引擎（Runtime/Agent 调度）架构方向正确，但要等 Tenant/Role/Capability 验证门控在前端/领域层跑通后，再反向定义后端适配的具体接口契约，避免接口先行、业务后补的返工。

## 4. 结论

不废弃现有后端；本阶段 V2 前端与其解耦独立推进，后端按上表逐项在后续迭代中适配接入。
