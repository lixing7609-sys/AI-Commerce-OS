from pydantic import BaseModel


class OrderUpdate(BaseModel):

    quantity: int

    amount: float

    status: str