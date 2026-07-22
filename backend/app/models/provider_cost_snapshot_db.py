from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Integer, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

PROVIDER_COST_ESTIMATION_STATUSES = ("reported", "estimated")


class ProviderCostSnapshotDB(Base):
    """
    外部 Provider 成本快照表（Phase 1A）：记录"某个 Provider 的某个
    模型/服务，按什么单位、花了/预计花了多少钱"，与 Token 定价规则
    彻底分离（见 Token Economy Phase 1 Revision 3 §"Split provider
    cost from Token pricing"）。

    每个 version 独立、不可变——发布后不做任何更新，回滚是发布一个
    新版本，不是修改旧版本。这一阶段只搭建发布/读取机制本身，不在
    迁移数据或测试之外写入任何权威商业数值；测试里使用的数值必须
    明确标注为测试夹具，不代表真实商业决策。

    provider_unit_cost 缺失/未知不阻塞 Token 结算（结算依据的是
    TokenPricingSnapshot，不是这张表）——这张表只影响成本报告和
    毛利分析，Phase 1A 尚未实现任何"消费明细 -> 成本快照"的解析
    逻辑。
    """

    __tablename__ = "provider_cost_snapshots"

    __table_args__ = (
        CheckConstraint(
            "estimation_status IN ('"
            + "','".join(PROVIDER_COST_ESTIMATION_STATUSES)
            + "')",
            name="ck_provider_cost_snapshots_estimation_status",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    version: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)

    provider: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    model_or_service: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )

    unit_type: Mapped[str] = mapped_column(String(40), nullable=False)

    provider_currency: Mapped[str] = mapped_column(String(10), nullable=False)

    provider_unit_cost: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)

    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    effective_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    source_reference: Mapped[str] = mapped_column(String(255), nullable=False)

    estimation_status: Mapped[str] = mapped_column(String(20), nullable=False)

    published_by: Mapped[str] = mapped_column(String(100), nullable=False)

    operation_log_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
