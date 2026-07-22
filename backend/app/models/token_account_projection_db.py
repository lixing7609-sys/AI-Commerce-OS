from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class TokenAccountProjectionDB(Base):
    """
    Token 账户余额投影表（Phase 1A）。

    available_balance/reserved_balance 是从 token_ledger_entries 的
    available_delta/reserved_delta 求和得到的缓存投影，不是独立的
    记账事实——只有 TokenProjectionService 允许写这张表。本表任意
    一行都可以被删除并从 ledger 重建，重建结果必须与删除前一致
    （见 ADR-0003 Token Domain Model §1/§9）。

    last_ledger_entry_id 是增量重算的游标（"本投影已经反映到哪一条
    ledger 记录为止"），配合 projection_version 一起用于判断投影
    是否需要重算，而不是每次都全表 SUM()。
    """

    __tablename__ = "token_account_projections"

    __table_args__ = (
        UniqueConstraint(
            "token_account_id",
            name="uq_token_account_projections_account",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    token_account_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True
    )

    available_balance: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    reserved_balance: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    projection_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    last_ledger_entry_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True
    )

    last_reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    last_discrepancy_found_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
