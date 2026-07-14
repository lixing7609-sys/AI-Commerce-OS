from pydantic import BaseModel


class ProductCreate(BaseModel):
    product_code: str
    title: str
    platform: str
    price: float