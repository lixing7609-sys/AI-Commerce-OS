from app.database.db import SessionLocal

from app.models.dashboard import Dashboard
from app.models.dashboard_agent import DashboardAgent
from app.models.dashboard_card import DashboardCard

from app.models.product_db import ProductDB
from app.models.listing_db import ListingDB
from app.models.inventory_db import InventoryDB
from app.models.order_db import OrderDB


class DashboardService:

    @staticmethod
    def get_dashboard():

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
                    name="AI CEO",
                    status="Running",
                    task="Today's Planning",
                ),

                DashboardAgent(
                    name="Product Agent",
                    status="Idle",
                    task="Waiting",
                ),

                DashboardAgent(
                    name="Listing Agent",
                    status="Running",
                    task="Publishing",
                ),

                DashboardAgent(
                    name="Inventory Agent",
                    status="Running",
                    task="Sync Inventory",
                ),

                DashboardAgent(
                    name="Order Agent",
                    status="Idle",
                    task="Waiting",
                ),

            ],

        )
    
    @staticmethod
    def get_summary():

        db = SessionLocal()

        try:

            return {
                "products": db.query(ProductDB).count(),
                "listings": db.query(ListingDB).count(),
                "inventories": db.query(InventoryDB).count(),
                "orders": db.query(OrderDB).count(),
            }

        finally:

            db.close()