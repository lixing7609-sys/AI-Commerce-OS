from pydantic import BaseModel


class StoreCreate(BaseModel):

    store_code: str
    name: str
    platform: str
    owner: str