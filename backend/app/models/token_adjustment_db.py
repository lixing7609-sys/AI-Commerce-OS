from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class TokenAdjustmentDB(Base):
    """
    Token 人工调整来源记录表（Phase 1A）：账户级别的人工修正
    （不绑定具体批次），创建后不可变更。

    adjustment_reference 是本次调整的业务幂等标识（调用方提供），
    配合 token_account_id 的唯一约束防止重复调整；reason/actor
    强制非空——不允许匿名或无理由的余额变更（见 Token Economy
    Phase 1 Revision 3 §"Operation logs" 和 ADR-0003 Accounting
    Invariants #4）。
    """

    __tablename__ = "token_adjustments"

    __table_args__ = (
        UniqueConstraint(
            "token_account_id",
            "adjustment_reference",
            name="uq_token_adjustments_account_reference",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    token_account_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True
    )

    amount: Mapped[int] = mapped_column(Integer, nullable=False)

    adjustment_reference: Mapped[str] = mapped_column(String(128), nullable=False)

    reason: Mapped[str] = mapped_column(Text, nullable=False)

    actor: Mapped[str] = mapped_column(String(100), nullable=False)

    operation_log_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
