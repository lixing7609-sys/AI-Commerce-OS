from pydantic import BaseModel


class InventoryCreate(BaseModel):

    listing_code: str

    quantity: int

    warehouse: str