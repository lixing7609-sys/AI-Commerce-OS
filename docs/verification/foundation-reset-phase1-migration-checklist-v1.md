# Foundation Reset Phase 1 Migration Checklist V1

目标：将 Founder AI Core 安全接入 AI-Commerce-OS 主仓库，不改变最终架构，不引入第二产品。

主仓库：`AI-Commerce-OS`

集成分支：`feature/foundation-reset-integration`

## Migration Rules

- Founder Core schema/API 作为 canonical contract。
- AI-Commerce-OS Runtime、Execution、Provider、Agent、Workflow 作为基础设施。
- 先完成只读审计、adapter 设计和测试，再进行写入迁移。
- 不直接覆盖现有 TaskDB、Deliverable 或 Runtime 表。
- 每一步必须有独立 checkpoint、测试和回滚点。

## Migration Order

### 1. ApplicationSystem

- [ ] 建立 ApplicationSystem canonical model/API。
- [ ] 初始化 `founder_ai`。
- [ ] 为所有新资产注入 `system_id`。
- [ ] 验证其他 Application System 仍为 placeholder 且不被嵌套。
- [ ] 建立 schema/API 测试。

### 2. Conversation

- [ ] 盘点现有客服、秘书和 Founder Conversation 实现。
- [ ] 统一 `conversation_id` 和 `system_id` boundary。
- [ ] 保留旧会话读取兼容层。
- [ ] 验证新 Conversation 默认绑定 `founder_ai`。
- [ ] 验证历史 Conversation 可恢复。

### 3. Context

- [ ] 接入 `ConversationContext`。
- [ ] 保存 user goal、constraints、decision summary、task/artifact refs。
- [ ] 将现有领域 context 转为 projection/reference。
- [ ] 验证 Context 不跨 Application System。

### 4. DecisionAsset

- [ ] 接入 DecisionAsset model、service 和 API。
- [ ] 支持 Conversation/TaskAsset 关联。
- [ ] 将 Approval Center 决策动作映射为 Decision/Approval 事件。
- [ ] 验证 Founder Decision 查询隔离。

### 5. TaskAsset

- [ ] 建立 Provider-independent TaskAsset。
- [ ] 为旧 TaskDB 建立 adapter 和外部 ID 映射。
- [ ] 接入 Approval、Execution 状态和 Task Package 版本。
- [ ] 验证未授权 Task 不得进入 executing。
- [ ] 验证 Runtime 仅作为 TaskAsset 的执行器。

### 6. ArtifactAsset

- [ ] 接入 ArtifactAsset model、service 和 API。
- [ ] 将 Deliverable 映射为 Artifact projection。
- [ ] 保留 location/content_ref/version 和旧外部 ID。
- [ ] 验证 Artifact 可关联 Task、Decision、Conversation。

### 7. MemoryAsset

- [ ] 接入 MemoryAsset model、service 和 API。
- [ ] 将 BusinessMemory/agent memory 作为只读来源或迁移 projection。
- [ ] 验证 Memory 可关联 Decision、Artifact、Task Result。
- [ ] 验证 Memory 的 Application System 隔离。

### 8. Founder Experience Layer

- [ ] 将 Founder Home、Conversation、Context Assistant 接入 AI-Commerce-OS UI Shell。
- [ ] 接入 Decisions、Tasks、Artifacts、Memory 只读视图。
- [ ] 隐藏或降级 Developer Workspace、Builder、Capability Center、Runtime Center 一级入口。
- [ ] 保留 Runtime/Approval 作为内部能力和上下文状态。
- [ ] 验证 Founder AI 是唯一当前运行 Application System。

## Per-Phase Verification

每个阶段完成前必须确认：

- [ ] 代码与数据库 schema 可回滚。
- [ ] 旧数据仍可读取。
- [ ] 新数据有 `system_id` boundary。
- [ ] API 不产生第二套 SSOT。
- [ ] 前端不新增第二 AI 身份或独立聊天系统。
- [ ] 单元测试、API 测试和隔离测试通过。

## Current Preparation Checkpoint

```text
Commit: 5aab65fa257b57094aa9e91daec22a6d41a8f22f
Message: chore: checkpoint before founder core integration
```

本阶段仅完成 checkpoint、集成分支和迁移清单；尚未迁移代码、数据库或 API。
