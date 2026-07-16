from pydantic import BaseModel


class Order(BaseModel):

    id: str

    order_code: str

    listing_code: str

    quantity: int

    amount: float

    customer: str

    status: str