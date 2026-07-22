from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

# Phase 1A 只支持两种记账事实：grant_credit（发放）、
# manual_adjustment（人工调整）。ADR-0003 Token Domain Model 定义的
# 其它类型（reservation_hold/consumption_settlement/... 等）现阶段
# 没有任何服务方法会写入，因此故意不出现在这个枚举里——枚举只列出
# 已经有对应服务操作、已经写了测试的类型，避免 schema 承诺系统还
# 不具备的行为（见 Token Economy Phase 1 Revision 3 §"Ledger" 的
# 明确要求）。扩展到 Phase 1B/1C 的类型时，用一次新的 migration
# 替换这个 CheckConstraint，而不是提前预留空位。
TOKEN_LEDGER_ENTRY_TYPES = (
    "grant_credit",
    "manual_adjustment",
)


class TokenLedgerEntryDB(Base):
    """
    Token 账本条目表（Phase 1A）：唯一的记账事实来源，只追加、
    永不更新或删除。

    每一行显式区分三个独立维度（"两维/多桶"账本效果模型，见
    ADR-0003 Token Domain Model §9 / Phase 1 Revision 3 §9）：

    - available_delta：对账户可用余额的影响；
    - reserved_delta：对账户预留余额的影响；
    - lot_delta：对所引用 Token 批次剩余额度的影响。

    replay 永远是同一套公式（按 token_account_id/lot_id 对这三列
    分别 SUM()），不需要针对 entry_type 做任何特判——具体每种
    entry_type 允许出现哪些 delta 组合，由服务层在写入前校验，
    不是本表自身的职责。
    """

    __tablename__ = "token_ledger_entries"

    __table_args__ = (
        CheckConstraint(
            "entry_type IN ('" + "','".join(TOKEN_LEDGER_ENTRY_TYPES) + "')",
            name="ck_token_ledger_entries_entry_type",
        ),
        # 同一个 origin 记录（比如一次 grant、一次 adjustment）在
        # Phase 1A 只产生恰好一条 ledger 记录；这个唯一约束是幂等性
        # 的第二道防线（第一道是 origin 表自身的唯一约束，见
        # TokenGrantDB/TokenAdjustmentDB）。Phase 1B/1C 引入
        # 多批次结算后，一次操作可能产生多条 ledger 记录，届时需要
        # 在这个约束里追加一个序号列，不在这次改动范围内。
        UniqueConstraint(
            "reference_type",
            "reference_id",
            name="uq_token_ledger_entries_reference",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    token_account_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True
    )

    entry_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    available_delta: Mapped[int] = mapped_column(Integer, nullable=False)

    reserved_delta: Mapped[int] = mapped_column(Integer, nullable=False)

    lot_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    lot_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 触发这条 ledger 记录的原始业务记录（比如 TokenGrantDB 的一行、
    # TokenAdjustmentDB 的一行），用于解释"这条账为什么存在"。
    reference_type: Mapped[str] = mapped_column(String(40), nullable=False)

    reference_id: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
