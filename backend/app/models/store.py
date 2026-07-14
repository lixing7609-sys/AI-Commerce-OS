from pydantic import BaseModel


class Store(BaseModel):

    id: str
    name: str
    platform: str
    owner: str
    status: str