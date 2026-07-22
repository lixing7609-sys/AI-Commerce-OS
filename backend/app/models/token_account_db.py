from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

# Phase 1A 只支持单一部署所有权范围：owner_scope_type="installation"，
# owner_scope_id="local"（单例，效仿 RuntimeStateDB id=1 的写法）。
# 未来引入真实 Operator/Business Cell 概念时，只需要对本表已有行做
# 一次 owner_scope_type/owner_scope_id 的 UPDATE 回填——ledger 条目
# 引用的是 token_account_id，不直接引用这两个字符串，因此这次迁移
# 不需要重写任何历史 ledger 行。见 ADR-0003 Token Domain Model /
# Phase 1 Revision 3 §1。
OWNER_SCOPE_TYPES = ("installation",)

TOKEN_ACCOUNT_STATUSES = ("active", "closed")


class TokenAccountDB(Base):
    """
    Token 账户身份/生命周期表（Phase 1A）。

    只保存账户身份信息，不保存任何余额字段——可用/预留余额是从
    token_ledger_entries 派生的投影，只存放在 TokenAccountProjectionDB，
    绝不直接写在本表上（见 ADR-0003 Token Domain Model §1/§2）。
    """

    __tablename__ = "token_accounts"

    __table_args__ = (
        CheckConstraint(
            "owner_scope_type IN ('" + "','".join(OWNER_SCOPE_TYPES) + "')",
            name="ck_token_accounts_owner_scope_type",
        ),
        CheckConstraint(
            "status IN ('" + "','".join(TOKEN_ACCOUNT_STATUSES) + "')",
            name="ck_token_accounts_status",
        ),
        UniqueConstraint(
            "owner_scope_type",
            "owner_scope_id",
            name="uq_token_accounts_owner_scope",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    owner_scope_type: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True
    )

    owner_scope_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active"
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
