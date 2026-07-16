from pydantic import BaseModel


class ListingUpdate(BaseModel):

    title: str

    price: float

    status: str