from pydantic import BaseModel


class Supplier(BaseModel):
    id: str
    name: str
    contact: str
    phone: str
    status: str