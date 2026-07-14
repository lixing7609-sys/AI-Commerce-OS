from pydantic import BaseModel


class ProductUpdate(BaseModel):
    title: str
    platform: str
    price: float