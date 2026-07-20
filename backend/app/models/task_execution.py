from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

TaskExecutionOutcome = Literal[
    "completed",
    "failed",
    "no_task",
    "runtime_stopped",
    "state_conflict",
]


class ClaimedTask(BaseModel):
    """
    claim_next_pending_task() 领取成功后返回的轻量快照。

    与领取事务的 SessionLocal 完全脱离，Agent 执行阶段（阶段 B）
    不依赖、也不持有任何数据库 session 或行锁。
    """

    task_id: str
    task_type: str
    assigned_agent: str | None
    priority: str
    payload: dict[str, Any]
    created_at: datetime
    started_at: datetime
    delegation_depth: int = 0
    root_task_id: str | None = None
    parent_task_id: str | None = None


class TaskExecutionResult(BaseModel):
    """
    process_next_pending_task() 单次调用的结构化执行结果。

    failed / state_conflict 场景下只暴露安全的 error_type（异常
    类名或固定安全分类标签），不包含原始异常文本（str(error)）、
    payload、result 内容或数据库连接信息。
    """

    outcome: TaskExecutionOutcome
    task_id: str | None = None
    assigned_agent: str | None = None
    previous_status: str | None = None
    final_status: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_type: str | None = None
    message: str
