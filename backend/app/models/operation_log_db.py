from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class OperationLogDB(Base):
    """
    通用操作日志表：只追加，不影响任何余额。

    不是 Token 专属的架构概念——`domain` 是自由文本（不加数据库
    CheckConstraint），未来 Shop/Device Admin/Advertising/Operator
    Cloud 等域可以直接复用这张表，各自约定自己的 domain/entity_type
    /action 取值，不需要新的 migration 才能接入。已知取值（目前只有
    Token 域）的校验放在服务层（OperationLogService），不放在数据库
    层（见 Token Economy Phase 1 Revision 3 §"Operation log domain"）。

    本表现阶段只覆盖敏感/管理性操作的问责留痕（人工发放、人工调整、
    Provider 成本快照发布、Token 计价快照发布）；日常自动结算不需要
    在这里留痕，因为 ledger 本身已经是"发生了什么"的记录——本表只
    回答"谁、为什么"。

    仓库目前没有任何真实的用户身份/登录体系，所以 actor_id 只是一个
    调用方提供的字符串引用（比如 "system"、"developer_internal"），
    不冒充一个尚不存在的认证身份。
    """

    __tablename__ = "operation_logs"

    __table_args__ = (
        Index("ix_operation_logs_domain_entity", "domain", "entity_type", "entity_id"),
        Index(
            "ix_operation_logs_owner_scope",
            "owner_scope_type",
            "owner_scope_id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    domain: Mapped[str] = mapped_column(String(40), nullable=False, index=True)

    entity_type: Mapped[str] = mapped_column(String(60), nullable=False)

    entity_id: Mapped[str] = mapped_column(String(60), nullable=False)

    action: Mapped[str] = mapped_column(String(60), nullable=False)

    owner_scope_type: Mapped[str | None] = mapped_column(String(30), nullable=True)

    owner_scope_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    actor_type: Mapped[str] = mapped_column(String(30), nullable=False)

    actor_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    reason_code: Mapped[str | None] = mapped_column(String(60), nullable=True)

    reason_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    reference_ids: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
