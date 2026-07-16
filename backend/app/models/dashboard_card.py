from pydantic import BaseModel


class DashboardCard(BaseModel):

    title: str

    value: int

    icon: str