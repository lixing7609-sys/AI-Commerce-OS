from pydantic import BaseModel


class DashboardAgent(BaseModel):

    name: str

    status: str

    task: str