from fastapi import APIRouter

from app.runtime.engine.runtime_engine import runtime_engine


router = APIRouter(
    prefix="/runtime",
    tags=["Runtime"],
)


@router.get("/status")
def get_runtime_status():
    """
    获取 RuntimeEngine 当前运行状态。
    """

    return runtime_engine.status()


@router.post("/start")
def start_runtime():
    """
    启动 RuntimeEngine。
    """

    status = runtime_engine.start()

    return {
        "success": True,
        "message": "RuntimeEngine 已启动",
        **status,
    }


@router.post("/stop")
def stop_runtime():
    """
    停止 RuntimeEngine。
    """

    status = runtime_engine.stop()

    return {
        "success": True,
        "message": "RuntimeEngine 已停止",
        **status,
    }