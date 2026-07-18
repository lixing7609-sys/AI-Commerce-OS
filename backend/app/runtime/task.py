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
        }