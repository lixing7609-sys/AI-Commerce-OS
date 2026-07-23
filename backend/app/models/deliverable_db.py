from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

DELIVERABLE_TYPES = (
    "ceo_analysis",
    "sales_analysis",
    "product_analysis",
    "general_result",
)

DELIVERABLE_STATUSES = (
    "draft",
    "pending_review",
    "approved",
    "rejected",
    "converted_to_task",
    "archived",
)


class DeliverableDB(Base):
    """
    成果表（阶段 8E）：AI 员工已完成任务的正式交付入口，独立于
    Task.result——不复制保存 Provider 原始响应、system prompt、
    API Key、完整内部 Context 或 traceback，只保存经过白名单清洗
    后的可交付字段（见 app.services.deliverable_service）。
    """

    __tablename__ = "deliverables"

    __table_args__: Any = (
        CheckConstraint(
            "deliverable_type IN ('" + "','".join(DELIVERABLE_TYPES) + "')",
            name="ck_deliverables_deliverable_type",
        ),
        CheckConstraint(
            "status IN ('" + "','".join(DELIVERABLE_STATUSES) + "')",
            name="ck_deliverables_status",
        ),
        UniqueConstraint(
            "source_task_id", name="uq_deliverables_source_task_id"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    deliverable_code: Mapped[str] = mapped_column(
        String(40), unique=True, nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)

    deliverable_type: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="pending_review",
        server_default="pending_review",
        index=True,
    )

    source_task_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("tasks.id"),
        nullable=False,
        index=True,
    )

    root_task_id: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True
    )

    parent_task_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    shop_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("shops.id"),
        nullable=True,
        index=True,
    )

    agent_name: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    current_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    rejected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class DeliverableVersionDB(Base):
    """
    成果版本表（阶段 8E）：只读历史版本，current_version 指向的
    版本即"当前成果"。structured_content 是经过白名单清洗的字典
    （直接复用 app.agents.*_response 已经产出的安全结构），content
    是对应的纯文本/Markdown 渲染，供导出和详情展示复用同一份数据。
    """

    __tablename__ = "deliverable_versions"

    __table_args__ = (
        UniqueConstraint(
            "deliverable_id",
            "version_number",
            name="uq_deliverable_versions_deliverable_id_version_number",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    deliverable_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("deliverables.id"),
        nullable=False,
        index=True,
    )

    version_number: Mapped[int] = mapped_column(Integer, nullable=False)

    format: Mapped[str] = mapped_column(
        String(20), nullable=False, default="structured"
    )

    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    structured_content: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    created_by: Mapped[str] = mapped_column(
        String(50), nullable=False, default="system", server_default="system"
    )

    source_task_id: Mapped[str] = mapped_column(String(32), nullable=False)
