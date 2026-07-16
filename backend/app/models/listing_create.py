from pydantic import BaseModel


class ListingCreate(BaseModel):

    product_code: str

    store_code: str

    platform: str

    title: str

    price: float