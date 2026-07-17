from fastapi import APIRouter

from app.runtime.engine.runtime_engine import RuntimeEngine


router = APIRouter(
    prefix="/runtime",
    tags=["Runtime"],
)


runtime_engine = RuntimeEngine()


@router.get("/status")
def get_runtime_status():
    """
    获取系统运行时状态。
    """

    return runtime_engine.status()


@router.post("/start")
def start_runtime():
    """
    启动系统运行时。
    """

    runtime_engine.start()

    return {
        "success": True,
        "message": "RuntimeEngine 已启动",
        **runtime_engine.status(),
    }


@router.post("/stop")
def stop_runtime():
    """
    停止系统运行时。
    """

    runtime_engine.stop()

    return {
        "success": True,
        "message": "RuntimeEngine 已停止",
        **runtime_engine.status(),
    }