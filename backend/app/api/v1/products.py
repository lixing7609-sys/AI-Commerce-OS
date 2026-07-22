from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.models.product import Product
from app.models.product_create import ProductCreate
from app.models.product_update import ProductUpdate
from app.services.product_service import ProductService

router = APIRouter(
    prefix="/products",
    tags=["Products"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)


@router.get("", response_model=list[Product])
def get_products():
    return ProductService.get_all_products()


@router.get("/demo", response_model=Product)
def get_demo_product():
    return ProductService.get_demo_product()


@router.post("", response_model=Product)
def create_product(product: ProductCreate):
    return ProductService.create_product(product)


@router.put("/{product_code}", response_model=Product)
def update_product(
    product_code: str,
    product: ProductUpdate,
):
    return ProductService.update_product(
        product_code,
        product,
    )


@router.delete("/{product_code}")
def delete_product(product_code: str):
    return {
        "success": ProductService.delete_product(
            product_code
        )
    }