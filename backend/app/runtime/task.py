from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


@dataclass
class Task:
    """
    AI-Commerce-OS 标准任务对象。
    """

    task_type: str
    payload: dict[str, Any]

    assigned_agent: str | None = None
    priority: str = "normal"

    id: str = field(
        default_factory=lambda: f"TASK-{uuid4().hex[:12].upper()}"
    )

    status: str = "pending"

    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    started_at: datetime | None = None
    completed_at: datetime | None = None

    result: dict[str, Any] | None = None
    error: str | None = None

    # 阶段 8B：父子任务委派。普通（非委派）任务 parent_task_id 为
    # None、delegation_depth=0；root_task_id 在 __post_init__ 里
    # 统一默认回填为自身 id（不区分"根任务"和"普通任务"两套语义，
    # 任何任务都能安全地用 root_task_id 查询整条委派链）。
    # AI CEO 创建子任务时会显式传入 parent_task_id/root_task_id/
    # delegation_depth=1/created_by_agent/delegation_key，不使用
    # 这里的默认值。
    parent_task_id: str | None = None
    root_task_id: str | None = None
    delegation_depth: int = 0
    created_by_agent: str | None = None
    delegation_key: str | None = None

    # 阶段 8E：店铺业务作用域，None 表示"未绑定店铺"。
    shop_id: int | None = None
    source_deliverable_id: int | None = None

    def __post_init__(self) -> None:
        if self.root_task_id is None:
            self.root_task_id = self.id

    def mark_running(self) -> None:
        """
        将任务标记为执行中。
        """

        self.status = "running"
        self.started_at = datetime.now(timezone.utc)
        self.completed_at = None
        self.error = None

    def mark_completed(
        self,
        result: dict[str, Any],
    ) -> None:
        """
        将任务标记为已完成。
        """

        self.status = "completed"
        self.result = result
        self.completed_at = datetime.now(timezone.utc)
        self.error = None

    def mark_failed(
        self,
        error: str,
    ) -> None:
        """
        将任务标记为执行失败。
        """

        self.status = "failed"
        self.error = error
        self.completed_at = datetime.now(timezone.utc)

    def to_dict(self) -> dict[str, Any]:
        """
        输出适用于 API 的任务数据。
        """

        return {
            "id": self.id,
            "task_type": self.task_type,
            "payload": self.payload,
            "assigned_agent": self.assigned_agent,
            "priority": self.priority,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": (
                self.started_at.isoformat()
                if self.started_at
                else None
            ),
            "completed_at": (
                self.completed_at.isoformat()
                if self.completed_at
                else None
            ),
            "result": self.result,
            "error": self.error,
            "parent_task_id": self.parent_task_id,
            "root_task_id": self.root_task_id,
            "delegation_depth": self.delegation_depth,
            "created_by_agent": self.created_by_agent,
            "shop_id": self.shop_id,
            "source_deliverable_id": self.source_deliverable_id,
        }
