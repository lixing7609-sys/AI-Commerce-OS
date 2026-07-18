import logging
from datetime import datetime, timezone

from app.agents.agent_registry import AgentRegistry
from app.models.runtime_state_db import RuntimeStateDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.runtime_state_service import RuntimeStateService
from app.services.task_service import TaskService

logger = logging.getLogger("app.runtime_recovery")

MAX_RECOVERY_FAILURE_COUNT = 3
EXPECTED_AGENT_COUNT = 5

FAILURE_LIMIT_ERROR_MESSAGE = "自动恢复已连续失败 3 次，请人工检查"
UNFINISHED_TASKS_ERROR_MESSAGE = "检测到未完成任务，拒绝自动恢复"


class RuntimeRecoveryService:
    """
    Backend startup 自动恢复决策服务。

    只在 FastAPI lifespan 启动阶段被调用一次，负责读取
    system_runtime_state 和未完成任务数量，判断是否应该
    自动恢复 Runtime，并调用 runtime_engine.start() 执行恢复、
    写入恢复结果。不做重试循环，不修改任务数据，不修改
    AgentRegistry 架构。内部任何异常都会被捕获并转换为
    actual_state=error 记录，绝不向调用方抛出异常——
    Runtime 恢复失败不应该阻止 FastAPI 服务本身启动。
    """

    @staticmethod
    def get_unfinished_task_counts() -> dict[str, int]:
        """
        查询 pending / running 状态的任务数量。

        只读查询，不修改任何任务记录。
        """

        stats = TaskService.get_stats()

        return {
            "pending": stats["pending"],
            "running": stats["running"],
        }

    @staticmethod
    def should_attempt_recovery(state: RuntimeStateDB) -> bool:
        """
        仅基于 system_runtime_state 行本身判断是否满足自动恢复的
        基本前提：用户意图为 running、开启了自动恢复、且尚未达到
        连续失败上限。

        RuntimeEngine 是否已在运行、AgentRegistry 是否就绪、
        任务表是否存在未完成任务，不属于 state 行本身的字段，
        由调用方 attempt_startup_recovery() 另行判断。
        """

        return (
            state.desired_state == "running"
            and state.auto_resume_enabled
            and state.recovery_failure_count < MAX_RECOVERY_FAILURE_COUNT
        )

    @staticmethod
    def build_recovery_result(
        attempted: bool,
        recovered: bool,
        reason: str,
    ) -> dict:
        """
        构造本次恢复决策结果，供日志与测试观察，不作为 API 响应使用。
        """

        return {
            "attempted": attempted,
            "recovered": recovered,
            "reason": reason,
        }

    @staticmethod
    def attempt_startup_recovery() -> dict:
        """
        Startup 自动恢复决策入口。

        每次 backend 启动只应被调用一次（由 main.py lifespan 保证），
        本方法自身不做重试、不做循环等待。
        """

        try:
            state = RuntimeStateService.get_or_create_state()
        except Exception as error:
            logger.error(
                "startup runtime recovery skipped: 状态读取失败（%s）",
                type(error).__name__,
            )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=False, recovered=False, reason="state_read_failed"
            )

        if runtime_engine.running:
            logger.info(
                "startup runtime recovery skipped: RuntimeEngine 已在运行，不重复启动"
            )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=False, recovered=False, reason="already_running"
            )

        if not RuntimeRecoveryService.should_attempt_recovery(state):
            if state.desired_state != "running" or not state.auto_resume_enabled:
                logger.info(
                    "startup runtime recovery skipped: desired_state=%s, "
                    "auto_resume_enabled=%s",
                    state.desired_state,
                    state.auto_resume_enabled,
                )
                try:
                    RuntimeStateService.update_state(actual_state="stopped")
                except Exception as error:
                    logger.error(
                        "startup runtime recovery: 状态对齐失败（%s）",
                        type(error).__name__,
                    )
                return RuntimeRecoveryService.build_recovery_result(
                    attempted=False, recovered=False, reason="not_desired"
                )

            logger.error(
                "startup runtime recovery blocked: %s",
                FAILURE_LIMIT_ERROR_MESSAGE,
            )
            try:
                RuntimeStateService.update_state(
                    actual_state="error",
                    last_error=FAILURE_LIMIT_ERROR_MESSAGE,
                )
            except Exception as error:
                logger.error(
                    "startup runtime recovery: 失败上限状态写入失败（%s）",
                    type(error).__name__,
                )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=False, recovered=False, reason="failure_limit_reached"
            )

        if AgentRegistry.count() != EXPECTED_AGENT_COUNT:
            logger.error(
                "startup runtime recovery skipped: AgentRegistry 未完成默认 "
                "Agent 注册（count=%d）",
                AgentRegistry.count(),
            )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=False, recovered=False, reason="agents_not_ready"
            )

        task_counts = RuntimeRecoveryService.get_unfinished_task_counts()

        if task_counts["pending"] > 0 or task_counts["running"] > 0:
            logger.error(
                "startup runtime recovery rejected: %s (pending=%d, running=%d)",
                UNFINISHED_TASKS_ERROR_MESSAGE,
                task_counts["pending"],
                task_counts["running"],
            )
            try:
                RuntimeStateService.update_state(
                    actual_state="error",
                    last_error=UNFINISHED_TASKS_ERROR_MESSAGE,
                    recovery_failure_count=state.recovery_failure_count + 1,
                )
            except Exception as error:
                logger.error(
                    "startup runtime recovery: 拒绝恢复后状态写入失败（%s）",
                    type(error).__name__,
                )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=True, recovered=False, reason="unfinished_tasks"
            )

        try:
            RuntimeStateService.update_state(actual_state="starting")
        except Exception as error:
            logger.error(
                "startup runtime recovery aborted: 恢复前状态写入失败（%s），"
                "不调用 RuntimeEngine.start()",
                type(error).__name__,
            )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=False, recovered=False, reason="pre_write_failed"
            )

        try:
            runtime_engine.start()
        except Exception as error:
            safe_message = f"RuntimeEngine 启动失败（{type(error).__name__}）"
            logger.error("startup runtime recovery failed: %s", safe_message)

            try:
                RuntimeStateService.update_state(
                    actual_state="error",
                    last_error=safe_message,
                    recovery_failure_count=state.recovery_failure_count + 1,
                )
            except Exception as write_error:
                logger.error(
                    "startup runtime recovery: 失败后状态写入也失败（%s）",
                    type(write_error).__name__,
                )

            return RuntimeRecoveryService.build_recovery_result(
                attempted=True, recovered=False, reason="engine_start_failed"
            )

        try:
            RuntimeStateService.update_state(
                desired_state="running",
                actual_state="running",
                last_started_at=datetime.now(timezone.utc),
                clear_last_error=True,
                recovery_failure_count=0,
            )
        except Exception as error:
            logger.error(
                "startup runtime recovery: 恢复成功后状态写入失败（%s），"
                "RuntimeEngine 已实际启动，内存与持久化状态可能暂时不一致",
                type(error).__name__,
            )
            return RuntimeRecoveryService.build_recovery_result(
                attempted=True, recovered=True, reason="post_write_failed"
            )

        logger.info("startup runtime recovery completed")

        return RuntimeRecoveryService.build_recovery_result(
            attempted=True, recovered=True, reason="success"
        )
