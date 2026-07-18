from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskRecoveryCandidate(BaseModel):
    """
    单个恢复候选任务（status=pending 或 status=running）。

    只读诊断字段，均取自 TaskDB 真实存在的列；TaskDB 没有
    updated_at 列，年龄与 stale 判断只使用 started_at/created_at。
    不返回 payload/result，避免意外暴露业务敏感数据。

    不返回 error：现有 tasks.error 至少有一条写入路径
    （backend/app/api/v1/agents.py 中 mark_failed(str(error))）
    直接写入原始异常文本的 str() 结果，而不是像项目里其它"安全
    错误"约定那样只写 type(error).__name__，无法保证其中不包含
    数据库连接串、API Key、Token 或完整 traceback 等敏感信息，
    因此本诊断接口不返回该字段，也不做脱敏处理。
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    assigned_agent: str | None
    task_type: str
    created_at: datetime | None
    started_at: datetime | None
    age_seconds: float | None
    is_stale: bool
    stale_reason: str | None
    recommended_actions: list[str]


class TaskRecoverySummary(BaseModel):
    """
    恢复候选任务的全库汇总。

    统计口径固定为全库 pending/running 任务，不受本次请求的
    status、assigned_agent、limit、offset 参数影响——这些参数
    只筛选/分页下面的 items 列表。blocks_runtime_recovery 与
    blocking_reason 因此反映的是当前真实、完整的 Runtime 自动
    恢复阻塞状态，而不是"筛选后可见的那部分"。
    """

    pending_count: int = Field(
        description="全库 status=pending 的任务数量，不受本次请求参数影响"
    )
    running_count: int = Field(
        description="全库 status=running 的任务数量，不受本次请求参数影响"
    )
    stale_running_count: int = Field(
        description=(
            "全库 status=running 且按 stale_after_minutes 判定为 "
            "stale 的任务数量，不受本次请求参数影响"
        )
    )
    total_candidates: int = Field(
        description="pending_count + running_count，全库口径"
    )
    blocks_runtime_recovery: bool = Field(
        description=(
            "当且仅当全库 pending_count>0 或 running_count>0 时为 "
            "true；与 RuntimeRecoveryService 实际使用的阻塞条件一致"
        )
    )
    blocking_reason: str = Field(
        description="blocks_runtime_recovery 的事实性文字说明，全库口径"
    )


class TaskRecoveryCandidatesResponse(BaseModel):
    """
    GET /api/v1/tasks/recovery-candidates 的完整响应结构。

    summary 为全库口径；items/limit/offset/returned_count 才是
    本次请求 status/assigned_agent 过滤、分页之后的结果。
    """

    summary: TaskRecoverySummary
    items: list[TaskRecoveryCandidate]
    limit: int
    offset: int
    returned_count: int
