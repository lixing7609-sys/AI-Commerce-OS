from fastapi import APIRouter

from app.models.supplier import Supplier
from app.models.supplier_create import SupplierCreate
from app.models.supplier_update import SupplierUpdate
from app.services.supplier_service import SupplierService

router = APIRouter(
    prefix="/suppliers",
    tags=["Suppliers"],
)


@router.get("", response_model=list[Supplier])
def get_suppliers():
    return SupplierService.get_all_suppliers()


@router.post("", response_model=Supplier)
def create_supplier(supplier: SupplierCreate):
    return SupplierService.create_supplier(supplier)


@router.put("/{supplier_code}", response_model=Supplier)
def update_supplier(
    supplier_code: str,
    supplier: SupplierUpdate,
):
    return SupplierService.update_supplier(
        supplier_code,
        supplier,
    )


@router.delete("/{supplier_code}")
def delete_supplier(supplier_code: str):
    return {
        "success": SupplierService.delete_supplier(
            supplier_code
        )
    }