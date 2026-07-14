from pydantic import BaseModel


class StoreUpdate(BaseModel):

    name: str
    platform: str
    owner: str
    status: str