from app.database.db import SessionLocal

from app.models.dashboard import Dashboard
from app.models.dashboard_agent import DashboardAgent
from app.models.dashboard_card import DashboardCard
from app.models.inventory_db import InventoryDB
from app.models.listing_db import ListingDB
from app.models.order_db import OrderDB
from app.models.product_db import ProductDB

from app.runtime.engine.runtime_engine import runtime_engine


class DashboardService:
    @staticmethod
    def get_dashboard():
        """
        获取 Dashboard 完整展示数据。
        """

        runtime_status = runtime_engine.status()
        agent_items = runtime_status["agents"]["items"]

        return Dashboard(
            cards=[
                DashboardCard(
                    title="Products",
                    value=128,
                    icon="📦",
                ),
                DashboardCard(
                    title="Stores",
                    value=8,
                    icon="🏪",
                ),
                DashboardCard(
                    title="Listings",
                    value=1256,
                    icon="🛒",
                ),
                DashboardCard(
                    title="Inventory",
                    value=9872,
                    icon="📦",
                ),
                DashboardCard(
                    title="Orders",
                    value=358,
                    icon="📄",
                ),
            ],
            agents=[
                DashboardAgent(
                    name=agent["name"],
                    status=agent["status"],
                    task=agent["current_task"] or "等待新任务",
                )
                for agent in agent_items
            ],
        )

    @staticmethod
    def get_summary():
        """
        获取 Dashboard 实时汇总数据。

        数据库统计、Runtime 状态和 Agent 状态
        统一从该接口返回。
        """

        db = SessionLocal()

        try:
            runtime_status = runtime_engine.status()

            return {
                "products": db.query(ProductDB).count(),
                "listings": db.query(ListingDB).count(),
                "inventories": db.query(InventoryDB).count(),
                "orders": db.query(OrderDB).count(),
                "runtime": {
                    "running": runtime_status["running"],
                    "status": runtime_status["status"],
                    "started_at": runtime_status["started_at"],
                    "stopped_at": runtime_status["stopped_at"],
                },
                "agents": runtime_status["agents"],
            }

        finally:
            db.close()