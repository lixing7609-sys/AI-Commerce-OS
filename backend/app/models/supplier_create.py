from pydantic import BaseModel


class SupplierCreate(BaseModel):
    supplier_code: str
    name: str
    contact: str
    phone: str