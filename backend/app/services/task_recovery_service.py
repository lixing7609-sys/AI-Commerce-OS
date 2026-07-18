from datetime import datetime, timezone

from sqlalchemy import case

from app.database.db import SessionLocal
from app.models.task_db import TaskDB

RECOVERY_CANDIDATE_STATUSES = ("pending", "running")

PENDING_RECOMMENDED_ACTIONS = ["inspect", "retry_later", "mark_failed"]
RUNNING_RECOMMENDED_ACTIONS = ["inspect", "requeue", "mark_failed"]

MISSING_TIME_REASON = "缺少可用于判断的时间"


class TaskRecoveryService:
    """
    只读诊断服务：识别会阻止 Runtime startup 自动恢复的未完成任务
    （status=pending / status=running）。

    只做查询，不 commit 任何任务变更，不调用 RuntimeEngine 或
    RuntimeRecoveryService，不触发任何自动恢复、重试或状态修改。

    TaskDB 没有 updated_at 列，年龄与 stale 判断的参考时间优先级为
    started_at → created_at（而不是原计划中的
    started_at → updated_at → created_at）。
    """

    @staticmethod
    def calculate_task_age(
        reference_time: datetime | None,
        now: datetime | None = None,
    ) -> float | None:
        """
        计算参考时间距当前时间的秒数，参考时间为空时返回 None。
        """

        if reference_time is None:
            return None

        current = now or datetime.now(timezone.utc)

        if reference_time.tzinfo is None:
            reference_time = reference_time.replace(tzinfo=timezone.utc)

        return max(0.0, (current - reference_time).total_seconds())

    @staticmethod
    def determine_stale_state(
        task: TaskDB,
        stale_after_minutes: int,
        now: datetime | None = None,
    ) -> tuple[bool, str | None]:
        """
        仅对 status=running 的任务判断是否 stale。

        参考时间优先级：started_at → created_at。
        时间缺失时返回 (False, "缺少可用于判断的时间")，不因为
        无法判断而自动标记异常。
        """

        if task.status != "running":
            return False, None

        reference_time = task.started_at or task.created_at

        if reference_time is None:
            return False, MISSING_TIME_REASON

        age_seconds = TaskRecoveryService.calculate_task_age(
            reference_time, now
        )

        if age_seconds is None:
            return False, MISSING_TIME_REASON

        is_stale = age_seconds > stale_after_minutes * 60

        if is_stale:
            return True, f"运行时间超过 {stale_after_minutes} 分钟阈值"

        return False, None

    @staticmethod
    def build_recommended_actions(status: str) -> list[str]:
        if status == "pending":
            return list(PENDING_RECOMMENDED_ACTIONS)

        if status == "running":
            return list(RUNNING_RECOMMENDED_ACTIONS)

        return []

    @staticmethod
    def count_recovery_candidates(stale_after_minutes: int) -> dict:
        """
        全库统计 pending/running 数量（不受 list_recovery_candidates
        的 status/assigned_agent 过滤影响），并据此给出是否阻塞
        Runtime 自动恢复的事实性结论。
        """

        db = SessionLocal()

        try:
            pending_count = (
                db.query(TaskDB).filter(TaskDB.status == "pending").count()
            )

            running_tasks = (
                db.query(TaskDB).filter(TaskDB.status == "running").all()
            )

            now = datetime.now(timezone.utc)

            stale_running_count = sum(
                1
                for task in running_tasks
                if TaskRecoveryService.determine_stale_state(
                    task, stale_after_minutes, now
                )[0]
            )

            running_count = len(running_tasks)
            total_candidates = pending_count + running_count
            blocks_runtime_recovery = pending_count > 0 or running_count > 0

            if not blocks_runtime_recovery:
                blocking_reason = "没有未完成任务"
            elif pending_count > 0 and running_count > 0:
                blocking_reason = (
                    "存在待执行和运行中任务，Runtime 自动恢复已被阻止"
                )
            elif pending_count > 0:
                blocking_reason = "存在待执行任务，Runtime 自动恢复已被阻止"
            else:
                blocking_reason = "存在运行中任务，Runtime 自动恢复已被阻止"

            return {
                "pending_count": pending_count,
                "running_count": running_count,
                "stale_running_count": stale_running_count,
                "total_candidates": total_candidates,
                "blocks_runtime_recovery": blocks_runtime_recovery,
                "blocking_reason": blocking_reason,
            }

        finally:
            db.close()

    @staticmethod
    def list_recovery_candidates(
        status: str | None = None,
        assigned_agent: str | None = None,
        stale_after_minutes: int = 30,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        """
        查询 pending/running 候选任务，支持按 status、assigned_agent
        过滤和分页。

        排序：running 排在 pending 之前；同状态内按 created_at 升序；
        created_at 为空则按 id 升序兜底（created_at 实际为 NOT NULL，
        此兜底只是防御性处理）。

        返回值中每一项已经是可直接构造 TaskRecoveryCandidate 的字典，
        业务判断（年龄、stale、建议动作）全部在本方法内完成。
        """

        db = SessionLocal()

        try:
            query = db.query(TaskDB).filter(
                TaskDB.status.in_(RECOVERY_CANDIDATE_STATUSES)
            )

            if status is not None:
                query = query.filter(TaskDB.status == status)

            if assigned_agent is not None:
                query = query.filter(
                    TaskDB.assigned_agent == assigned_agent
                )

            filtered_total = query.count()

            status_order = case(
                (TaskDB.status == "running", 0),
                (TaskDB.status == "pending", 1),
                else_=2,
            )

            query = query.order_by(
                status_order,
                TaskDB.created_at.asc(),
                TaskDB.id.asc(),
            )

            if offset:
                query = query.offset(offset)

            query = query.limit(limit)

            tasks = query.all()
            now = datetime.now(timezone.utc)

            items = []

            for task in tasks:
                reference_time = task.started_at or task.created_at
                age_seconds = TaskRecoveryService.calculate_task_age(
                    reference_time, now
                )
                is_stale, stale_reason = (
                    TaskRecoveryService.determine_stale_state(
                        task, stale_after_minutes, now
                    )
                )

                items.append(
                    {
                        "id": task.id,
                        "status": task.status,
                        "assigned_agent": task.assigned_agent,
                        "task_type": task.task_type,
                        "created_at": task.created_at,
                        "started_at": task.started_at,
                        "age_seconds": age_seconds,
                        "is_stale": is_stale,
                        "stale_reason": stale_reason,
                        "recommended_actions": (
                            TaskRecoveryService.build_recommended_actions(
                                task.status
                            )
                        ),
                    }
                )

            return items, filtered_total

        finally:
            db.close()
