from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RuntimeStateDB(Base):
    """
    系统 Runtime 运行状态持久化表。

    单行表，id 固定为 1。
    """

    __tablename__ = "system_runtime_state"

    __table_args__: Any = (
        CheckConstraint(
            "desired_state IN ('running', 'stopped')",
            name="ck_system_runtime_state_desired_state",
        ),
        CheckConstraint(
            "actual_state IN ('starting', 'running', 'stopping', 'stopped', 'error')",
            name="ck_system_runtime_state_actual_state",
        ),
        CheckConstraint(
            "last_shutdown_type IN ('graceful', 'unexpected', 'unknown')",
            name="ck_system_runtime_state_last_shutdown_type",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    desired_state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="stopped",
    )

    actual_state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="stopped",
    )

    auto_resume_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    last_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_stopped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_shutdown_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="unknown",
    )

    last_error: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    recovery_failure_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
