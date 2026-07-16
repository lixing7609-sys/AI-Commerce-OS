from app.models.dashboard import Dashboard
from app.models.dashboard_agent import DashboardAgent
from app.models.dashboard_card import DashboardCard


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