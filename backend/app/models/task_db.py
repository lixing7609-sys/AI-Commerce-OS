from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, String, Text, UniqueConstraint
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