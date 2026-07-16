from pydantic import BaseModel

from app.models.dashboard_agent import DashboardAgent
from app.models.dashboard_card import DashboardCard


class Dashboard(BaseModel):

    cards: list[DashboardCard]

    agents: list[DashboardAgent]