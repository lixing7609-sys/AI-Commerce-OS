from fastapi import FastAPI

from app.models.product import Product
from app.models.product_create import ProductCreate
from app.models.product_update import ProductUpdate
from app.services.product_service import ProductService

from app.models.store import Store
from app.models.store_create import StoreCreate
from app.models.store_update import StoreUpdate
from app.services.store_service import StoreService

from app.models.supplier import Supplier
from app.models.supplier_create import SupplierCreate
from app.models.supplier_update import SupplierUpdate
from app.services.supplier_service import SupplierService

from app.models.listing import Listing
from app.models.listing_create import ListingCreate
from app.models.listing_update import ListingUpdate
from app.services.listing_service import ListingService

from app.models.inventory import Inventory
from app.models.inventory_create import InventoryCreate
from app.models.inventory_update import InventoryUpdate
from app.services.inventory_service import InventoryService

from app.models.order import Order
from app.models.order_create import OrderCreate
from app.models.order_update import OrderUpdate
from app.services.order_service import OrderService

app = FastAPI(title="AI-Commerce-OS")


@app.get("/health")
def health():
    return {"status": "ok"}


# =========================
# Product
# =========================

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


@app.delete("/products/{product_code}")
def delete_product(product_code: str):
    return {
        "success": ProductService.delete_product(product_code)
    }


# =========================
# Store
# =========================

@app.get("/stores", response_model=list[Store])
def get_stores():
    return StoreService.get_all_stores()


@app.post("/stores", response_model=Store)
def create_store(store: StoreCreate):
    return StoreService.create_store(store)


@app.put("/stores/{store_code}", response_model=Store)
def update_store(store_code: str, store: StoreUpdate):
    return StoreService.update_store(store_code, store)


@app.delete("/stores/{store_code}")
def delete_store(store_code: str):
    return {
        "success": StoreService.delete_store(store_code)
    }


# =========================
# Supplier
# =========================

@app.get("/suppliers", response_model=list[Supplier])
def get_suppliers():
    return SupplierService.get_all_suppliers()


@app.post("/suppliers", response_model=Supplier)
def create_supplier(supplier: SupplierCreate):
    return SupplierService.create_supplier(supplier)


@app.put("/suppliers/{supplier_code}", response_model=Supplier)
def update_supplier(supplier_code: str, supplier: SupplierUpdate):
    return SupplierService.update_supplier(supplier_code, supplier)


@app.delete("/suppliers/{supplier_code}")
def delete_supplier(supplier_code: str):
    return {
        "success": SupplierService.delete_supplier(supplier_code)
    }


# =========================
# Listing
# =========================

@app.get("/listings", response_model=list[Listing])
def get_listings():
    return ListingService.get_all_listings()


@app.post("/listings", response_model=Listing)
def create_listing(listing: ListingCreate):
    return ListingService.create_listing(listing)


@app.put("/listings/{listing_code}", response_model=Listing)
def update_listing(listing_code: str, listing: ListingUpdate):
    return ListingService.update_listing(listing_code, listing)


@app.delete("/listings/{listing_code}")
def delete_listing(listing_code: str):
    return {
        "success": ListingService.delete_listing(listing_code)
    }


# =========================
# Inventory
# =========================

@app.get("/inventories", response_model=list[Inventory])
def get_inventories():
    return InventoryService.get_all_inventory()


@app.post("/inventories", response_model=Inventory)
def create_inventory(inventory: InventoryCreate):
    return InventoryService.create_inventory(inventory)


@app.put("/inventories/{inventory_code}", response_model=Inventory)
def update_inventory(
    inventory_code: str,
    inventory: InventoryUpdate,
):
    return InventoryService.update_inventory(
        inventory_code,
        inventory,
    )


@app.delete("/inventories/{inventory_code}")
def delete_inventory(inventory_code: str):
    return {
        "success": InventoryService.delete_inventory(
            inventory_code
        )
    }


# =========================
# Order
# =========================

@app.get("/orders", response_model=list[Order])
def get_orders():
    return OrderService.get_all_orders()


@app.post("/orders", response_model=Order)
def create_order(order: OrderCreate):
    return OrderService.create_order(order)


@app.put("/orders/{order_code}", response_model=Order)
def update_order(
    order_code: str,
    order: OrderUpdate,
):
    return OrderService.update_order(
        order_code,
        order,
    )


@app.delete("/orders/{order_code}")
def delete_order(order_code: str):
    return {
        "success": OrderService.delete_order(
            order_code
        )
    }