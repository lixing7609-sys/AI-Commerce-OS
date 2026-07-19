import logging

from app.agents.agent_registry import AgentRegistry
from app.models.task_api import ExternalTaskSubmitRequest, TaskSubmitRequest
from app.models.task_db import TaskDB
from app.runtime.task import Task
from app.services.task_consumer_service import task_consumer_service
from app.services.task_service import TaskService

logger = logging.getLogger("app.task_submission")


class AgentNotFoundError(Exception):
    """
    请求中的 assigned_agent 未在 AgentRegistry 注册。
    """

    def __init__(self, agent_name: str) -> None:
        self.agent_name = agent_name
        super().__init__(f"未找到 Agent：{agent_name}")


class TaskSubmissionService:
    """
    任务提交核心逻辑，供内部 POST /tasks/submit 与外部
    POST /integrations/tasks/submit 复用同一套"校验 Agent 存在 ->
    构造任务 -> 写库 commit -> commit 成功后 wake 后台 consumer"
    流程，避免两个入口各自实现一份重复的 commit/wake/error 逻辑。

    只做 assigned_agent 的存在性校验（是否已在 AgentRegistry
    注册），不检查该 Agent 当前运行状态——Runtime stopped 时
    Agent 本来就可能处于 stopped，必须仍然允许提前排队。commit
    成功后才 wake；wake 失败只记录日志，不回滚已经成功入队的
    任务。
    """

    @staticmethod
    def validate_agent_exists(agent_name: str) -> None:
        if AgentRegistry.get(agent_name) is None:
            raise AgentNotFoundError(agent_name)

    @staticmethod
    def build_task(
        *,
        assigned_agent: str,
        task_text: str,
        context: dict,
        priority: str,
    ) -> Task:
        payload = {**context, "task": task_text}

        return Task(
            task_type=task_text,
            payload=payload,
            assigned_agent=assigned_agent,
            priority=priority,
        )

    @staticmethod
    def _wake_consumer(task_id: str) -> None:
        try:
            task_consumer_service.wake()
        except Exception as error:
            logger.warning(
                "task consumer wake failed: task_id=%s error_type=%s",
                task_id,
                type(error).__name__,
            )

    @staticmethod
    def submit_internal_task(request: TaskSubmitRequest) -> TaskDB:
        """
        对应 POST /tasks/submit：不做幂等去重，每次调用都创建一条
        新任务，行为与阶段 5A 完全一致。
        """

        TaskSubmissionService.validate_agent_exists(request.assigned_agent)

        task = TaskSubmissionService.build_task(
            assigned_agent=request.assigned_agent,
            task_text=request.task,
            context=request.context,
            priority=request.priority,
        )

        task_db = TaskService.create_task(task)

        TaskSubmissionService._wake_consumer(task_db.id)

        return task_db

    @staticmethod
    def submit_external_task(
        request: ExternalTaskSubmitRequest,
    ) -> tuple[TaskDB, bool]:
        """
        对应 POST /integrations/tasks/submit：按
        (source, request_id) 幂等去重，返回
        (任务行, 是否为已存在的重复请求)。

        流程：先查询已有任务 -> 没有则尝试 INSERT -> 若因唯一约束
        冲突失败（另一个并发请求先一步插入成功），rollback 后按
        source + request_id 重新查询 -> 返回已有任务、
        duplicate=true。真正的并发安全由数据库唯一约束保证，
        "先查后插"只是减少无意义插入尝试的优化，不是唯一保障。
        """

        TaskSubmissionService.validate_agent_exists(request.assigned_agent)

        existing = TaskService.find_by_external_request(
            request.source, request.request_id
        )

        if existing is not None:
            return existing, True

        task = TaskSubmissionService.build_task(
            assigned_agent=request.assigned_agent,
            task_text=request.task,
            context=request.context,
            priority=request.priority,
        )

        created = TaskService.create_external_task(
            task,
            external_source=request.source,
            external_request_id=request.request_id,
        )

        if created is not None:
            TaskSubmissionService._wake_consumer(created.id)
            return created, False

        # 插入因唯一约束冲突失败：另一个并发请求已经先一步创建了
        # 同一 (source, request_id) 的任务，本请求不再创建第二条，
        # 重新查询并返回该已有任务。
        winner = TaskService.find_by_external_request(
            request.source, request.request_id
        )

        if winner is None:
            # 理论上不应发生：INSERT 因唯一约束冲突失败必然意味着
            # 冲突行存在；若重新查询仍为空说明出现了无法解释的
            # 数据不一致，交由调用方作为服务端错误处理，不静默
            # 伪造一个成功结果。
            raise RuntimeError(
                "external task idempotency conflict but no existing "
                "row found on requery"
            )

        return winner, True
