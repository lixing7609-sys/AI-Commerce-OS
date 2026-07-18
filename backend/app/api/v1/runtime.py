import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models.runtime_api import (
    AutoResumeUpdateRequest,
    RuntimeStatusResponse,
    TaskConsumerStatusResponse,
)
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.runtime_state_service import RuntimeStateService
from app.services.task_consumer_service import task_consumer_service

logger = logging.getLogger("app.runtime_api")

router = APIRouter(
    prefix="/runtime",
    tags=["Runtime"],
)


def _build_consumer_status_response() -> TaskConsumerStatusResponse:
    """
    把 TaskConsumerService.get_status() 的内部字典转换成安全的
    响应模型。healthy 定义为 healthy = running：见
    TaskConsumerStatusResponse 的字段说明。

    只读取内存状态，不访问数据库，不 wake/start/stop 消费者，
    不触发任何任务执行，不改变任何计数。
    """

    status = task_consumer_service.get_status()

    return TaskConsumerStatusResponse(
        running=status["running"],
        healthy=status["running"],
        stop_requested=status["stop_requested"],
        current_task_id=status["current_task_id"],
        processed_count=status["processed_count"],
        completed_count=status["completed_count"],
        failed_count=status["failed_count"],
        conflict_count=status["conflict_count"],
        last_outcome=status["last_outcome"],
        last_error_type=status["last_error_type"],
        started_at=status["started_at"],
        stopped_at=status["stopped_at"],
    )


def _build_status_response() -> RuntimeStatusResponse:
    """
    合并 RuntimeEngine 内存状态、system_runtime_state 持久化状态与
    TaskConsumerService 内存状态。

    system_runtime_state 不存在时只补默认单行，不做任何自动恢复，
    不改变任何 Agent 状态；consumer 部分同样只读，不产生副作用。
    """

    engine_status = runtime_engine.status()
    persisted_state = RuntimeStateService.get_or_create_state()

    return RuntimeStatusResponse(
        running=engine_status["running"],
        status=engine_status["status"],
        started_at=engine_status["started_at"],
        stopped_at=engine_status["stopped_at"],
        agents=engine_status["agents"],
        desired_state=persisted_state.desired_state,
        actual_state=persisted_state.actual_state,
        auto_resume_enabled=persisted_state.auto_resume_enabled,
        last_started_at=persisted_state.last_started_at,
        last_stopped_at=persisted_state.last_stopped_at,
        last_heartbeat_at=persisted_state.last_heartbeat_at,
        last_shutdown_type=persisted_state.last_shutdown_type,
        last_error=persisted_state.last_error,
        recovery_failure_count=persisted_state.recovery_failure_count,
        updated_at=persisted_state.updated_at,
        consumer=_build_consumer_status_response(),
    )


@router.get("/status", response_model=RuntimeStatusResponse)
def get_runtime_status():
    """
    获取 RuntimeEngine 当前运行状态（内存）及持久化状态。
    """

    return _build_status_response()


@router.get("/consumer-status", response_model=TaskConsumerStatusResponse)
def get_consumer_status():
    """
    只读查看后台任务消费者（TaskConsumerService）的运行状态。

    只调用 task_consumer_service.get_status()，不访问或修改数据库，
    不 wake/start/stop 消费者，不修改 Runtime，不触发任何任务
    执行，不改变任何计数。
    """

    return _build_consumer_status_response()


@router.post("/start", response_model=RuntimeStatusResponse)
def start_runtime():
    """
    启动 RuntimeEngine，并将启停意图和结果持久化到
    system_runtime_state。
    """

    logger.info("manual runtime start requested")

    was_already_running = runtime_engine.running

    try:
        RuntimeStateService.get_or_create_state()
        RuntimeStateService.update_state(
            desired_state="running",
            actual_state="starting",
            clear_last_error=True,
        )
    except Exception as error:
        logger.error(
            "manual runtime start failed: 启动前状态写入失败（%s）",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="启动前状态写入失败，请检查数据库连接",
        ) from error

    try:
        runtime_engine.start()
    except Exception as error:
        safe_message = f"RuntimeEngine 启动失败（{type(error).__name__}）"
        logger.error("manual runtime start failed: %s", safe_message)

        try:
            RuntimeStateService.update_state(
                actual_state="error",
                last_error=safe_message,
            )
        except Exception:
            logger.error(
                "manual runtime start failed: 最终状态写入也失败，"
                "内存与持久化状态可能暂时不一致"
            )

        raise HTTPException(status_code=500, detail=safe_message) from error

    try:
        current_state = RuntimeStateService.get_or_create_state()

        should_stamp_started_at = (
            not was_already_running or current_state.last_started_at is None
        )

        RuntimeStateService.update_state(
            desired_state="running",
            actual_state="running",
            last_started_at=(
                datetime.now(timezone.utc) if should_stamp_started_at else None
            ),
            clear_last_error=True,
            recovery_failure_count=0,
        )
    except Exception as error:
        logger.error(
            "manual runtime start failed: 最终状态写入失败（%s），"
            "RuntimeEngine 已实际启动，内存与持久化状态可能暂时不一致",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="RuntimeEngine 已启动，但状态持久化失败，请检查数据库连接",
        ) from error

    # 本路由是同步 def，FastAPI 会放到线程池工作线程执行，那里没有
    # 运行中的事件循环，不能安全调用 asyncio.create_task()——因此
    # 这里只 wake()，从不调用 task_consumer_service.start()。消费者
    # 由 main.py lifespan 在 backend 启动时唯一创建一次、持续存在；
    # 若它已经因未预期异常提前退出，wake() 是安全的空操作，这里
    # 只记录一条明确日志、不在线程池线程里尝试重建，也不影响本
    # 接口对 RuntimeEngine 状态本身的正常返回——避免调用方误以为
    # "Runtime 已启动"等价于"待处理任务会被自动消费"。
    try:
        task_consumer_service.wake()

        if not task_consumer_service.is_running():
            logger.error(
                "task consumer is not running after manual runtime "
                "start; pending tasks will not be processed "
                "automatically until backend restart"
            )
    except Exception as error:
        logger.error(
            "task consumer wake after manual runtime start failed: %s",
            type(error).__name__,
        )

    logger.info("manual runtime start completed")

    return _build_status_response()


@router.post("/stop", response_model=RuntimeStatusResponse)
def stop_runtime():
    """
    停止 RuntimeEngine，并将启停意图和结果持久化到
    system_runtime_state。

    这是应用层面的主动停止，与后端进程退出无关，
    不会在 FastAPI lifespan 中被调用。

    对后台任务消费者是 graceful drain 语义：只停止领取新的
    pending 任务，不强制中断当前已经进入 Agent 执行阶段的任务
    ——允许其自然完成并写回结果。本接口不等待该任务执行完成，
    不把它强制标记为 failed，也不把它重新改回 pending。
    """

    logger.info("manual runtime stop requested")

    was_already_stopped = not runtime_engine.running

    try:
        RuntimeStateService.get_or_create_state()
        RuntimeStateService.update_state(
            desired_state="stopped",
            actual_state="stopping",
        )
    except Exception as error:
        logger.error(
            "manual runtime stop failed: 停止前状态写入失败（%s）",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="停止前状态写入失败，请检查数据库连接",
        ) from error

    try:
        runtime_engine.stop()
    except Exception as error:
        safe_message = f"RuntimeEngine 停止失败（{type(error).__name__}）"
        logger.error("manual runtime stop failed: %s", safe_message)

        try:
            RuntimeStateService.update_state(
                actual_state="error",
                last_error=safe_message,
            )
        except Exception:
            logger.error(
                "manual runtime stop failed: 最终状态写入也失败，"
                "内存与持久化状态可能暂时不一致"
            )

        raise HTTPException(status_code=500, detail=safe_message) from error

    try:
        current_state = RuntimeStateService.get_state()

        should_stamp_stopped_at = (
            not was_already_stopped or current_state.last_stopped_at is None
        )

        RuntimeStateService.update_state(
            desired_state="stopped",
            actual_state="stopped",
            last_stopped_at=(
                datetime.now(timezone.utc) if should_stamp_stopped_at else None
            ),
            last_shutdown_type="graceful",
            clear_last_error=True,
        )
    except Exception as error:
        logger.error(
            "manual runtime stop failed: 最终状态写入失败（%s），"
            "RuntimeEngine 已实际停止，内存与持久化状态可能暂时不一致",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail="RuntimeEngine 已停止，但状态持久化失败，请检查数据库连接",
        ) from error

    try:
        task_consumer_service.wake()
    except Exception as error:
        logger.error(
            "task consumer wake after manual runtime stop failed: %s",
            type(error).__name__,
        )

    logger.info(
        "manual runtime stop completed (graceful drain: consumer stops "
        "claiming new pending tasks, in-flight task allowed to finish)"
    )

    return _build_status_response()


@router.put("/auto-resume", response_model=RuntimeStatusResponse)
def update_auto_resume(request: AutoResumeUpdateRequest):
    """
    设置自动恢复开关（auto_resume_enabled）。

    只保存用户意图，不立即启动或停止 RuntimeEngine，不触发
    startup 自动恢复，不改变 desired_state/actual_state/
    recovery_failure_count/last_error。下一次 backend startup 时，
    由现有的 RuntimeRecoveryService 读取该开关决定是否自动恢复。
    """

    logger.info("runtime auto-resume update requested")

    try:
        RuntimeStateService.set_auto_resume(request.enabled)
    except Exception as error:
        safe_message = f"自动恢复开关写入失败（{type(error).__name__}）"
        logger.error("runtime auto-resume update failed: %s", safe_message)
        raise HTTPException(status_code=500, detail=safe_message) from error

    logger.info("runtime auto-resume update completed")

    return _build_status_response()
