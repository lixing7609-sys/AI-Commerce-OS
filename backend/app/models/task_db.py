from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class TaskDB(Base):
    """
    PostgreSQL 任务记录表。
    """

    __tablename__ = "tasks"

    __table_args__ = (
        UniqueConstraint(
            "external_source",
            "external_request_id",
            name="uq_tasks_external_source_request_id",
        ),
        UniqueConstraint(
            "parent_task_id",
            "delegation_key",
            name="uq_tasks_parent_delegation_key",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(32),
        primary_key=True,
        index=True,
    )

    task_type: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
    )

    assigned_agent: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )

    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="normal",
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )

    payload: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    result: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )

    error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    external_source: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    external_request_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )

    # 阶段 8B：父子任务委派。普通任务 parent_task_id 为 NULL；
    # root_task_id 对所有任务（含历史任务，见对应 migration 的
    # 回填语句）都非空，等于所在委派链最上层任务的 id（无委派链
    # 的任务其 root_task_id 等于自身 id）。delegation_key 只在
    # 子任务上非空，与 parent_task_id 组成唯一约束，用于防止同一
    # 父任务重复执行时重复创建同一条子任务。
    parent_task_id: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
        index=True,
    )

    root_task_id: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
        index=True,
    )

    delegation_depth: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    created_by_agent: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    delegation_key: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )