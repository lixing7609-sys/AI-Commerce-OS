from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.models.inventory import Inventory
from app.models.inventory_create import InventoryCreate
from app.models.inventory_update import InventoryUpdate
from app.services.inventory_service import InventoryService

router = APIRouter(
    prefix="/inventories",
    tags=["Inventories"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


@router.get("", response_model=list[Inventory])
def get_inventories():
    return InventoryService.get_all_inventory()


@router.post("", response_model=Inventory)
def create_inventory(inventory: InventoryCreate):
    return InventoryService.create_inventory(inventory)


@router.put("/{inventory_code}", response_model=Inventory)
def update_inventory(
    inventory_code: str,
    inventory: InventoryUpdate,
):
    return InventoryService.update_inventory(
        inventory_code,
        inventory,
    )


@router.delete("/{inventory_code}")
def delete_inventory(inventory_code: str):
    return {
        "success": InventoryService.delete_inventory(
            inventory_code
        )
    }