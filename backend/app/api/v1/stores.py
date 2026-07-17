from fastapi import APIRouter

from app.models.store import Store
from app.models.store_create import StoreCreate
from app.models.store_update import StoreUpdate
from app.services.store_service import StoreService

router = APIRouter(
    prefix="/stores",
    tags=["Stores"],
)


@router.get("", response_model=list[Store])
def get_stores():
    return StoreService.get_all_stores()


@router.post("", response_model=Store)
def create_store(store: StoreCreate):
    return StoreService.create_store(store)


@router.put("/{store_code}", response_model=Store)
def update_store(
    store_code: str,
    store: StoreUpdate,
):
    return StoreService.update_store(
        store_code,
        store,
    )


@router.delete("/{store_code}")
def delete_store(store_code: str):
    return {
        "success": StoreService.delete_store(
            store_code
        )
    }