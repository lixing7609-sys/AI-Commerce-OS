import logging
from datetime import datetime, timezone

from app.database.db import SessionLocal
from app.models.task_db import TaskDB
from app.services.task_consumer_service import task_consumer_service

logger = logging.getLogger("app.task_recovery_actions")


class TaskNotFoundError(Exception):
    """未找到指定任务。"""


class InvalidTaskTransitionError(Exception):
    """
    当前任务状态不允许执行请求的动作。

    detail 只描述状态本身，不包含任何内部异常信息。
    """

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class TaskRecoveryActionService:
    """
    人工处置服务：对 pending/running 任务执行受控的 requeue 或
    mark-failed 写操作。

    单事务 + 行级锁（SELECT ... FOR UPDATE），确保并发下同一任务
    只有一次状态转换能成功；不调用 RuntimeEngine 或 AgentRegistry，
    不立即执行任务，不修改 system_runtime_state，不做批量操作，
    不做自动重试。

    requeue 成功提交后会调用 task_consumer_service.wake()，只是
    唤醒后台消费者提前重新检查一次（而不是等待其空闲轮询间隔），
    本身不执行任务、不等待执行结果；消费者被唤醒后仍然只在
    Runtime running 时才会真正领取该任务。
    """

    @staticmethod
    def get_task_for_update(db, task_id: str) -> TaskDB:
        """
        在调用方已开启的事务内，用 SELECT ... FOR UPDATE 锁定目标
        任务行，直到该事务 commit 或 rollback 为止。任务不存在时
        抛出 TaskNotFoundError。
        """

        task = (
            db.query(TaskDB)
            .filter(TaskDB.id == task_id)
            .with_for_update()
            .first()
        )

        if task is None:
            raise TaskNotFoundError(f"未找到任务：{task_id}")

        return task

    @staticmethod
    def validate_transition(current_status: str, action: str) -> None:
        """
        校验当前状态是否允许该动作，不允许时抛出
        InvalidTaskTransitionError。
        """

        if action == "requeue":
            if current_status != "running":
                raise InvalidTaskTransitionError(
                    f"当前任务状态 {current_status}，不允许重新排队"
                )
            return

        if action == "mark_failed":
            if current_status not in ("pending", "running"):
                raise InvalidTaskTransitionError(
                    f"当前任务状态 {current_status}，不允许标记失败"
                )
            return

        raise ValueError(f"未知动作：{action}")

    @staticmethod
    def requeue_task(task_id: str) -> TaskDB:
        """
        running → pending。

        清空 started_at/completed_at/result/error，保留 id、
        task_type、assigned_agent、priority、payload、created_at。
        只写库，不重新执行任务，不调用 RuntimeEngine/AgentRegistry。
        """

        db = SessionLocal()

        try:
            task = TaskRecoveryActionService.get_task_for_update(
                db, task_id
            )
            TaskRecoveryActionService.validate_transition(
                task.status, "requeue"
            )

            task.status = "pending"
            task.started_at = None
            task.completed_at = None
            task.result = None
            task.error = None

            db.commit()
            db.refresh(task)

            try:
                task_consumer_service.wake()
            except Exception as error:
                logger.error(
                    "task consumer wake after requeue failed: %s",
                    type(error).__name__,
                )

            return task

        except Exception:
            db.rollback()
            raise

        finally:
            db.close()

    @staticmethod
    def mark_task_failed(task_id: str, reason: str) -> TaskDB:
        """
        pending/running → failed。

        写入 completed_at=当前时间、error=人工提供的 reason，
        清空 result；started_at 保留原值不变。
        """

        db = SessionLocal()

        try:
            task = TaskRecoveryActionService.get_task_for_update(
                db, task_id
            )
            TaskRecoveryActionService.validate_transition(
                task.status, "mark_failed"
            )

            task.status = "failed"
            task.completed_at = datetime.now(timezone.utc)
            task.error = reason
            task.result = None

            db.commit()
            db.refresh(task)

            return task

        except Exception:
            db.rollback()
            raise

        finally:
            db.close()
