from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

# Phase 1A 只支持通过人工发放（TokenAdministrationService.issue_grant）
# 产生批次，因此只开放 grant 类的来源；purchased（购买）和
# plan_included（订阅自动发放）目前没有任何触发路径，不在这个
# 阶段的枚举里（见 Token Economy Phase 1 Revision 3 §"Token lots"）。
TOKEN_LOT_SOURCE_TYPES = (
    "promotional",
    "compensation",
    "manually_granted",
)


class TokenLotDB(Base):
    """
    Token 批次表（Phase 1A）：按来源和到期时间分别保留，不合并成
    一个匿名余额。

    remaining_amount 是投影/缓存，只有 TokenProjectionService 允许
    写它；发放批次时的初始值等于 original_amount，之后的每一次
    重算都必须能单独从该批次自己的 ledger 分配记录（lot_delta）
    推导出来，不依赖这里存的缓存值本身（见 ADR-0003 Token Domain
    Model §2）。
    """

    __tablename__ = "token_lots"

    __table_args__ = (
        CheckConstraint(
            "source_type IN ('" + "','".join(TOKEN_LOT_SOURCE_TYPES) + "')",
            name="ck_token_lots_source_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    token_account_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True
    )

    source_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # 触发这个批次产生的 origin 记录（Phase 1A 恒为 TokenGrantDB 的
    # 一行）。
    source_reference_type: Mapped[str] = mapped_column(String(40), nullable=False)

    source_reference_id: Mapped[int] = mapped_column(Integer, nullable=False)

    original_amount: Mapped[int] = mapped_column(Integer, nullable=False)

    remaining_amount: Mapped[int] = mapped_column(Integer, nullable=False)

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class TokenGrantDB(Base):
    """
    Token 发放来源记录表（Phase 1A）：一次人工/内部发放操作的事实
    记录，创建后不可变更——修正一律用新的补偿性 ledger 记录，
    不编辑本表已有行。

    grant_reference 是本次发放的业务幂等标识（调用方提供），配合
    token_account_id 的唯一约束防止重复发放；并发重复插入靠数据库
    唯一约束 + IntegrityError 捕获后回查解决，不靠应用层加锁。
    """

    __tablename__ = "token_grants"

    __table_args__ = (
        UniqueConstraint(
            "token_account_id",
            "grant_reference",
            name="uq_token_grants_account_reference",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    token_account_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True
    )

    source_type: Mapped[str] = mapped_column(String(30), nullable=False)

    amount: Mapped[int] = mapped_column(Integer, nullable=False)

    grant_reference: Mapped[str] = mapped_column(String(128), nullable=False)

    reason: Mapped[str] = mapped_column(Text, nullable=False)

    actor: Mapped[str] = mapped_column(String(100), nullable=False)

    operation_log_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
