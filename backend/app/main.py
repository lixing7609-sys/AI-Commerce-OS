from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.agents import router as agents_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.inventories import router as inventories_router
from app.api.v1.listings import router as listings_router
from app.api.v1.orders import router as orders_router
from app.api.v1.products import router as products_router
from app.api.v1.runtime import router as runtime_router
from app.api.v1.stores import router as stores_router
from app.api.v1.suppliers import router as suppliers_router
from app.api.v1.tasks import router as tasks_router


app = FastAPI(
    title="AI-Commerce-OS",
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    dashboard_router,
    prefix="/api/v1",
)

app.include_router(
    products_router,
    prefix="/api/v1",
)

app.include_router(
    stores_router,
    prefix="/api/v1",
)

app.include_router(
    suppliers_router,
    prefix="/api/v1",
)

app.include_router(
    listings_router,
    prefix="/api/v1",
)

app.include_router(
    inventories_router,
    prefix="/api/v1",
)

app.include_router(
    orders_router,
    prefix="/api/v1",
)

app.include_router(
    runtime_router,
    prefix="/api/v1",
)

app.include_router(
    agents_router,
    prefix="/api/v1",
)

app.include_router(
    tasks_router,
    prefix="/api/v1",
)


@app.get("/health", tags=["System"])
def health():
    return {
        "status": "ok",
        "service": "AI-Commerce-OS",
        "version": "0.1.0",
    }