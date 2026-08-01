import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Float, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


def _new_run_id() -> str:
    return f"run-{uuid.uuid4().hex[:20]}"


class ConnectorRunDB(Base):
    """
    Sino Connector 调用记录（Brain 一次问答 / Executor 一次 Claude
    Code 执行）统一审计与状态表。

    kind="brain"：一次 GPT Brain 调用，通常 started_at≈completed_at
    （同步请求），detail 里不存对话原文，只存安全摘要。

    kind="executor"：一次 Claude Code 执行，生命周期可能跨越
    数分钟，status 会经历 running -> waiting_for_input（可反复）
    -> completed/failed/cancelled；detail 承载任务包快照、当前
    步骤、澄清问题、Claude 会话 id（用于 --resume 续传澄清回答）、
    产物（改动文件/diff 摘要/lint/build/test/commit/开发服务器
    地址/截图路径）等 executor 专属字段，不建独立表，避免 V1 阶段
    过度设计。
    """

    __tablename__ = "connector_runs"

    id: Mapped[str] = mapped_column(
        String(40),
        primary_key=True,
        default=_new_run_id,
    )

    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    conversation_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    decision_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    task_package_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="running", index=True
    )

    input_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    output_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    detail: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
