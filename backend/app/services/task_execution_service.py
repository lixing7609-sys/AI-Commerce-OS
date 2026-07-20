import logging
from datetime import datetime, timezone

from sqlalchemy import case

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.llm.exceptions import SAFE_LLM_ERROR_TYPES
from app.models.task_db import TaskDB
from app.models.task_execution import ClaimedTask, TaskExecutionResult
from app.runtime.engine.runtime_engine import runtime_engine

logger = logging.getLogger("app.task_execution")


class AgentNotFoundError(Exception):
    """assigned_agent 为空，或在 AgentRegistry 中找不到对应 Agent。"""


class AgentExecutionError(Exception):
    """
    Agent 执行失败的安全包装异常。

    error_type 只携带安全的异常类型名或固定安全分类标签，绝不
    携带原始异常文本（str(error)）——现有项目已确认原始异常文本
    可能包含数据库连接串、API Key 等敏感信息（详见
    app/models/task_recovery.py 中对 agents.py mark_failed(str(error))
    的说明），本服务不重复该不安全模式。
    """

    def __init__(self, error_type: str):
        self.error_type = error_type
        super().__init__(error_type)


# priority 是自由文本 VARCHAR(20)，没有数据库 CHECK 约束或 Python
# 枚举；实际数据中只出现过 high/normal/low 三个值（项目语义：高/
# 普通/低）。字符串字典序是 high < low < normal，与语义顺序不符，
# 因此必须显式建立 rank 映射，不能依赖字符串排序。未知/非法
# priority 值统一归入最低优先级（rank=3），排在 low 之后，保证
# 排序稳定且不会因为脏数据而抛异常或乱序。
_PRIORITY_RANK = case(
    (TaskDB.priority == "high", 0),
    (TaskDB.priority == "normal", 1),
    (TaskDB.priority == "low", 2),
    else_=3,
)


class TaskExecutionService:
    """
    单次原子领取并执行一条 pending 任务的核心服务。

    严格分三个阶段：

    阶段 A（claim_next_pending_task）：独立短事务，
    SELECT ... FOR UPDATE SKIP LOCKED 领取一条 pending 任务，
    立即写 running 并 commit，锁在 commit 时释放。

    阶段 B（execute_claimed_task）：不持有任何数据库事务或行锁，
    只用领取阶段返回的快照对象调用 Agent 的标准执行协议
    （agent.run(context, task_name)），与
    POST /agents/{name}/run 使用的协议完全一致。

    阶段 C（complete_task / fail_task）：独立短事务，重新锁定
    任务行，确认仍为 running 后才写回 completed/failed，否则
    返回 state_conflict、不覆盖。

    本服务每次调用最多处理一条任务，不包含常驻循环、定时消费、
    批量领取或自动重试；不调用 RuntimeRecoveryService，不修改
    system_runtime_state，不写 heartbeat。
    """

    @staticmethod
    def get_agent(assigned_agent: str | None):
        """
        根据 assigned_agent 从 AgentRegistry 查找 Agent。

        找不到时抛出 AgentNotFoundError，不把 Registry 内部对象
        或状态信息写入异常消息。
        """

        if not assigned_agent:
            raise AgentNotFoundError("assigned_agent 为空")

        agent = AgentRegistry.get(assigned_agent)

        if agent is None:
            raise AgentNotFoundError("未找到对应 Agent")

        return agent

    @staticmethod
    def claim_next_pending_task() -> ClaimedTask | None:
        """
        阶段 A：短事务原子领取一条 pending 任务。

        排序：priority rank 升序（high 优先）、created_at 升序、
        id 升序兜底。使用 SELECT ... FOR UPDATE SKIP LOCKED，
        确保多个并发调用者不会领取同一行；没有可领取任务时返回
        None，不修改任何数据。
        """

        db = SessionLocal()

        try:
            task = (
                db.query(TaskDB)
                .filter(TaskDB.status == "pending")
                .order_by(
                    _PRIORITY_RANK,
                    TaskDB.created_at.asc(),
                    TaskDB.id.asc(),
                )
                .with_for_update(skip_locked=True)
                .first()
            )

            if task is None:
                db.rollback()
                return None

            started_at = datetime.now(timezone.utc)

            task.status = "running"
            task.started_at = started_at
            task.completed_at = None
            task.result = None
            task.error = None

            snapshot = ClaimedTask(
                task_id=task.id,
                task_type=task.task_type,
                assigned_agent=task.assigned_agent,
                priority=task.priority,
                payload=dict(task.payload) if task.payload else {},
                created_at=task.created_at,
                started_at=started_at,
                delegation_depth=task.delegation_depth,
                root_task_id=task.root_task_id,
                parent_task_id=task.parent_task_id,
            )

            db.commit()

            return snapshot

        except Exception:
            db.rollback()
            raise

        finally:
            db.close()

    @staticmethod
    def execute_claimed_task(task: ClaimedTask) -> dict:
        """
        阶段 B：不持有数据库事务，调用 Agent 现有执行协议。

        复用 agent.run(context, task_name) —— 与
        POST /agents/{name}/run 完全一致的同步调用方式；context
        直接使用任务的 payload（该 payload 本身就是历史上由
        /agents/{name}/run 写入时的 context 字典），task_name
        优先取 payload 里的 "task" 字段，取不到则退回 task_type。

        agent.run() 按其自身约定不会向外抛出异常，内部失败会转成
        {"success": False, "error": str(原始异常)}；该 error 字段
        的原始文本按项目既定安全约定不可信、不可外泄，因此本方法
        对 success!=True 的情况统一归类为固定安全标签
        "AgentReportedFailure"，不读取、不透传其中的原始文本。

        若 agent.run() 本身直接抛出异常（不符合其自身契约的情况，
        例如测试用的 fake Agent），则捕获后只保留
        type(error).__name__ 作为 error_type。
        """

        agent = TaskExecutionService.get_agent(task.assigned_agent)

        task_name = None

        if isinstance(task.payload, dict):
            task_name = task.payload.get("task")

        task_name = task_name or task.task_type

        try:
            result = agent.run(
                context=task.payload,
                task_name=task_name,
                task_id=task.task_id,
                delegation_depth=task.delegation_depth,
                root_task_id=task.root_task_id,
                parent_task_id=task.parent_task_id,
            )
        except Exception as error:
            raise AgentExecutionError(type(error).__name__) from error

        if not isinstance(result, dict) or result.get("success") is not True:
            # 大多数 Agent 的 error 字段是不可信的原始异常文本（见
            # 上方类注释），因此默认仍归类为通用 "AgentReportedFailure"。
            # 例外：LLM Gateway 定义的一小组固定安全分类标签（见
            # app.llm.exceptions.SAFE_LLM_ERROR_TYPES）本身就是安全
            # 的枚举值而非自由文本，命中时原样传递，让 Task.error
            # 携带更精确的失败语义（configuration_error/
            # authentication_failed/rate_limited/...）。
            error_label = (
                result.get("error") if isinstance(result, dict) else None
            )

            if (
                isinstance(error_label, str)
                and error_label in SAFE_LLM_ERROR_TYPES
            ):
                raise AgentExecutionError(error_label)

            raise AgentExecutionError("AgentReportedFailure")

        return result

    @staticmethod
    def complete_task(task_id: str, result: dict) -> TaskExecutionResult:
        """
        阶段 C（成功分支）：短事务重新锁定任务，确认仍为 running
        后才写 completed，否则返回 state_conflict、不覆盖。
        """

        db = SessionLocal()
        previous_status: str | None = None

        try:
            task = (
                db.query(TaskDB)
                .filter(TaskDB.id == task_id)
                .with_for_update()
                .first()
            )

            if task is None:
                db.rollback()
                logger.warning(
                    "task finalization conflict: task_id=%s status=missing",
                    task_id,
                )
                return TaskExecutionResult(
                    outcome="state_conflict",
                    task_id=task_id,
                    message="任务在写回前已不存在",
                )

            previous_status = task.status

            if task.status != "running":
                db.rollback()
                logger.warning(
                    "task finalization conflict: task_id=%s status=%s",
                    task_id,
                    task.status,
                )
                return TaskExecutionResult(
                    outcome="state_conflict",
                    task_id=task_id,
                    assigned_agent=task.assigned_agent,
                    previous_status=previous_status,
                    final_status=task.status,
                    message="任务状态已被人工或其他流程修改，未覆盖",
                )

            completed_at = datetime.now(timezone.utc)

            task.status = "completed"
            task.result = result
            task.error = None
            task.completed_at = completed_at

            started_at = task.started_at
            assigned_agent = task.assigned_agent

            db.commit()

            logger.info(
                "task execution completed: task_id=%s assigned_agent=%s",
                task_id,
                assigned_agent,
            )

            return TaskExecutionResult(
                outcome="completed",
                task_id=task_id,
                assigned_agent=assigned_agent,
                previous_status=previous_status,
                final_status="completed",
                started_at=started_at,
                completed_at=completed_at,
                message="任务执行成功",
            )

        except Exception as error:
            db.rollback()
            logger.error(
                "task finalization database failure: task_id=%s error_type=%s",
                task_id,
                type(error).__name__,
            )
            return TaskExecutionResult(
                outcome="failed",
                task_id=task_id,
                previous_status=previous_status,
                error_type=type(error).__name__,
                message="写回完成结果时发生数据库错误，任务可能仍处于 running",
            )

        finally:
            db.close()

    @staticmethod
    def fail_task(task_id: str, error_type: str) -> TaskExecutionResult:
        """
        阶段 C（失败分支）：短事务重新锁定任务，确认仍为 running
        后才写 failed，否则返回 state_conflict、不覆盖。

        error 字段只写入安全摘要，格式为
        "AgentExecutionError:{error_type}"，不写入 str(原始异常)。
        """

        db = SessionLocal()
        previous_status: str | None = None

        try:
            task = (
                db.query(TaskDB)
                .filter(TaskDB.id == task_id)
                .with_for_update()
                .first()
            )

            if task is None:
                db.rollback()
                logger.warning(
                    "task finalization conflict: task_id=%s status=missing",
                    task_id,
                )
                return TaskExecutionResult(
                    outcome="state_conflict",
                    task_id=task_id,
                    error_type=error_type,
                    message="任务在写回前已不存在",
                )

            previous_status = task.status

            if task.status != "running":
                db.rollback()
                logger.warning(
                    "task finalization conflict: task_id=%s status=%s",
                    task_id,
                    task.status,
                )
                return TaskExecutionResult(
                    outcome="state_conflict",
                    task_id=task_id,
                    assigned_agent=task.assigned_agent,
                    previous_status=previous_status,
                    final_status=task.status,
                    error_type=error_type,
                    message="任务状态已被人工或其他流程修改，未覆盖",
                )

            completed_at = datetime.now(timezone.utc)

            task.status = "failed"
            task.result = None
            task.error = f"AgentExecutionError:{error_type}"
            task.completed_at = completed_at

            started_at = task.started_at
            assigned_agent = task.assigned_agent

            db.commit()

            logger.info(
                "task execution failed: task_id=%s assigned_agent=%s error_type=%s",
                task_id,
                assigned_agent,
                error_type,
            )

            return TaskExecutionResult(
                outcome="failed",
                task_id=task_id,
                assigned_agent=assigned_agent,
                previous_status=previous_status,
                final_status="failed",
                started_at=started_at,
                completed_at=completed_at,
                error_type=error_type,
                message="任务执行失败",
            )

        except Exception as error:
            db.rollback()
            logger.error(
                "task finalization database failure: task_id=%s error_type=%s",
                task_id,
                type(error).__name__,
            )
            return TaskExecutionResult(
                outcome="failed",
                task_id=task_id,
                previous_status=previous_status,
                error_type=type(error).__name__,
                message="写回失败结果时发生数据库错误，任务可能仍处于 running",
            )

        finally:
            db.close()

    @staticmethod
    def process_next_pending_task() -> TaskExecutionResult:
        """
        单次调用最多处理一条 pending 任务的核心入口。

        1. Runtime 未运行：不查询、不领取、不调用 Agent，返回
           runtime_stopped。
        2. 领取阶段数据库失败：rollback、不调用 Agent，返回安全
           失败结果。
        3. 没有 pending 任务：返回 no_task。
        4. 领取成功后执行 Agent（不持有事务），成功写 completed，
           失败写 failed；写回时任务已不再是 running 则返回
           state_conflict、不覆盖。
        """

        logger.info("task execution requested")

        if not runtime_engine.running:
            logger.info("task execution skipped: runtime stopped")
            return TaskExecutionResult(
                outcome="runtime_stopped",
                message="RuntimeEngine 未运行，跳过任务领取",
            )

        try:
            task = TaskExecutionService.claim_next_pending_task()
        except Exception as error:
            logger.error(
                "task claim database failure: error_type=%s",
                type(error).__name__,
            )
            return TaskExecutionResult(
                outcome="failed",
                error_type=type(error).__name__,
                message="领取任务时发生数据库错误",
            )

        if task is None:
            logger.info("no pending task available")
            return TaskExecutionResult(
                outcome="no_task",
                message="当前没有待处理任务",
            )

        logger.info(
            "task claimed: task_id=%s assigned_agent=%s",
            task.task_id,
            task.assigned_agent,
        )
        logger.info("task execution started: task_id=%s", task.task_id)

        try:
            result = TaskExecutionService.execute_claimed_task(task)
        except AgentNotFoundError:
            logger.error(
                "task execution failed: task_id=%s error_type=AgentNotFoundError",
                task.task_id,
            )
            return TaskExecutionService.fail_task(
                task.task_id, "AgentNotFoundError"
            )
        except AgentExecutionError as error:
            logger.error(
                "task execution failed: task_id=%s error_type=%s",
                task.task_id,
                error.error_type,
            )
            return TaskExecutionService.fail_task(
                task.task_id, error.error_type
            )
        except Exception as error:
            logger.error(
                "task execution failed: task_id=%s error_type=%s",
                task.task_id,
                type(error).__name__,
            )
            return TaskExecutionService.fail_task(
                task.task_id, type(error).__name__
            )

        return TaskExecutionService.complete_task(task.task_id, result)
