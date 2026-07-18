import logging
from contextlib import asynccontextmanager

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
from app.services.database_readiness_service import (
    DatabaseReadinessError,
    DatabaseReadinessService,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger("app.startup")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI 生命周期。

    数据库表结构统一由 Alembic 管理（`uv run alembic upgrade head`），
    应用启动时不再自动创建或修改表结构。启动前会执行一次只读的
    数据库就绪检查（连接是否可用、revision 是否与代码一致、
    必需表是否存在），检查失败则阻止应用启动。

    预留给后续阶段接入 Runtime startup/shutdown。
    """

    try:
        DatabaseReadinessService.check_ready()
    except DatabaseReadinessError as error:
        logger.error("application startup aborted: %s", error)
        raise

    yield


app = FastAPI(
    title="AI-Commerce-OS",
    version="0.1.0",
    lifespan=lifespan,
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