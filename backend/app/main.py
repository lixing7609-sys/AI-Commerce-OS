import asyncio
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
from app.services.runtime_state_service import RuntimeStateService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger("app.startup")

HEARTBEAT_INTERVAL_SECONDS = 15


async def _heartbeat_loop(interval_seconds: float) -> None:
    """
    后台心跳循环：每隔 interval_seconds 秒调用一次
    RuntimeStateService.record_heartbeat()。

    单次心跳写入失败只记录日志并等待下一周期重试，
    不中断循环、不让进程退出。取消信号（asyncio.CancelledError）
    只会在 asyncio.sleep 处产生，不做拦截，交由调用方处理。
    """

    while True:
        await asyncio.sleep(interval_seconds)

        try:
            RuntimeStateService.record_heartbeat()
        except Exception as error:
            logger.error(
                "heartbeat write failed: %s", type(error).__name__
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI 生命周期。

    数据库表结构统一由 Alembic 管理（`uv run alembic upgrade head`），
    应用启动时不再自动创建或修改表结构。启动前会执行一次只读的
    数据库就绪检查（连接是否可用、revision 是否与代码一致、
    必需表是否存在），检查失败则阻止应用启动，且不会启动心跳任务。

    就绪检查通过后启动一个后台心跳任务，进程退出（无论
    desired_state 当时是什么）时只记录一次"优雅关闭"，
    不改变 desired_state，不调用 RuntimeEngine 或 AgentRegistry。

    预留给后续阶段接入 startup 自动恢复。
    """

    try:
        DatabaseReadinessService.check_ready()
    except DatabaseReadinessError as error:
        logger.error("application startup aborted: %s", error)
        raise

    heartbeat_task = asyncio.create_task(
        _heartbeat_loop(HEARTBEAT_INTERVAL_SECONDS)
    )
    logger.info("heartbeat task started")

    try:
        yield
    finally:
        heartbeat_task.cancel()

        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass

        logger.info("heartbeat task stopped")

        try:
            RuntimeStateService.record_graceful_shutdown()
            logger.info("graceful shutdown recorded")
        except Exception as error:
            logger.error(
                "failed to record graceful shutdown: %s",
                type(error).__name__,
            )


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