from pydantic import BaseModel


class Product(BaseModel):
    id: str
    title: str
    price: float
    platform: str