from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class TokenPricingSnapshotDB(Base):
    """
    Token 计价快照表（Phase 1A）：记录"某次用量应该折算成多少
    Token"的内部规则，与 ProviderCostSnapshot（外部成本测量）彻底
    分离——Provider 成本变化不需要跟着改 Token 计价，Token 计价
    变化也不会重写 Provider 成本历史。

    provider/model_or_service 允许为空，表示这条规则是更宽泛的
    默认规则。每个 version 独立、不可变，发布后不做任何更新。这一
    阶段只搭建发布/读取机制，不写入任何权威商业数值，也不实现
    "用量 -> 计价快照解析"的结算逻辑（那是 Phase 1C 的工作）。

    结算时如果找不到适用的 TokenPricingSnapshot，对应的用量必须
    保持 pending，不允许在没有计价规则的情况下擅自结算——这条规则
    在 Phase 1A 还没有消费方，先在这里把约束写清楚。
    """

    __tablename__ = "token_pricing_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    version: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)

    provider: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)

    model_or_service: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )

    usage_unit_mapping: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    token_charge_rule: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    published_by: Mapped[str] = mapped_column(String(100), nullable=False)

    operation_log_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
