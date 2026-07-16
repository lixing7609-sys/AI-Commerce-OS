from pydantic import BaseModel


class Inventory(BaseModel):

    id: str

    listing_code: str

    quantity: int

    reserved: int

    available: int

    warehouse: str

    status: str