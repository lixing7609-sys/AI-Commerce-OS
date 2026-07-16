from pydantic import BaseModel


class Listing(BaseModel):

    id: str

    product_code: str

    store_code: str

    platform: str

    title: str

    price: float

    status: str