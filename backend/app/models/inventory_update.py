from pydantic import BaseModel


class InventoryUpdate(BaseModel):

    quantity: int

    reserved: int

    available: int

    status: str