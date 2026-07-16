from pydantic import BaseModel


class OrderCreate(BaseModel):

    listing_code: str

    quantity: int

    amount: float

    customer: str