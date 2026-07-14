from fastapi import FastAPI

from app.models.product import Product
from app.models.product_create import ProductCreate
from app.models.product_update import ProductUpdate
from app.services.product_service import ProductService

app = FastAPI(title="AI-Commerce-OS")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/product", response_model=Product)
def get_product():
    return ProductService.get_demo_product()


@app.get("/products", response_model=list[Product])
def get_products():
    return ProductService.get_all_products()


@app.post("/products", response_model=Product)
def create_product(product: ProductCreate):
    return ProductService.create_product(product)


@app.put("/products/{product_code}", response_model=Product)
def update_product(product_code: str, product: ProductUpdate):

    return ProductService.update_product(product_code, product)