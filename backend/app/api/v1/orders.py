from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.models.order import Order
from app.models.order_create import OrderCreate
from app.models.order_update import OrderUpdate
from app.services.order_service import OrderService

router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


@router.get("", response_model=list[Order])
def get_orders():
    return OrderService.get_all_orders()


@router.post("", response_model=Order)
def create_order(order: OrderCreate):
    return OrderService.create_order(order)


@router.put("/{order_code}", response_model=Order)
def update_order(
    order_code: str,
    order: OrderUpdate,
):
    return OrderService.update_order(
        order_code,
        order,
    )


@router.delete("/{order_code}")
def delete_order(order_code: str):
    return {
        "success": OrderService.delete_order(
            order_code
        )
    }