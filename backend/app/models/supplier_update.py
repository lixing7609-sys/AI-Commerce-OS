from pydantic import BaseModel


class SupplierUpdate(BaseModel):
    name: str
    contact: str
    phone: str
    status: str