from datetime import datetime, timedelta, timezone

from app.database.db import SessionLocal
from app.models.task_db import TaskDB
from app.services.task_result_sanitizer import format_safe_error

_VALID_RANGES = {"today", "7d", "30d"}
_DEFAULT_RANGE = "7d"
_TREND_DAYS = 7
_RECENT_FAILED_LIMIT = 10

_UNASSIGNED_AGENT_LABEL = "未分配"


def _range_start(range_key: str, now: datetime) -> datetime:
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if range_key == "today":
        return today_start

    if range_key == "30d":
        return today_start - timedelta(days=29)

    return today_start - timedelta(days=6)


class AnalyticsService:
    """
    任务数据聚合统计服务（阶段：管理后台数据分析页面）。

    只做只读聚合查询，不返回 payload/context/原始 result，
    失败任务的错误文本统一经 format_safe_error 脱敏和截断。
    所有聚合基于 PostgreSQL 中的真实 TaskDB 记录，不使用任何
    硬编码或示例数据。
    """

    @staticmethod
    def get_task_analytics(range_key: str | None = None) -> dict:
        normalized_range = (
            range_key if range_key in _VALID_RANGES else _DEFAULT_RANGE
        )

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        range_start = _range_start(normalized_range, now)
        trend_start = today_start - timedelta(days=_TREND_DAYS - 1)

        db = SessionLocal()

        try:
            all_tasks = db.query(TaskDB).all()

            ranged_tasks = [
                task
                for task in all_tasks
                if task.created_at is not None and task.created_at >= range_start
            ]

            totals = {
                "total": len(ranged_tasks),
                "pending": 0,
                "running": 0,
                "completed": 0,
                "failed": 0,
            }

            for task in ranged_tasks:
                if task.status in totals:
                    totals[task.status] += 1

            completion_rate = (
                totals["completed"] / totals["total"]
                if totals["total"] > 0
                else 0.0
            )

            failure_rate = (
                totals["failed"] / totals["total"]
                if totals["total"] > 0
                else 0.0
            )

            today_new_tasks = sum(
                1
                for task in all_tasks
                if task.created_at is not None and task.created_at >= today_start
            )

            trend_counts: dict[str, int] = {
                (trend_start + timedelta(days=offset)).date().isoformat(): 0
                for offset in range(_TREND_DAYS)
            }

            for task in all_tasks:
                if task.created_at is None or task.created_at < trend_start:
                    continue

                day_key = task.created_at.date().isoformat()

                if day_key in trend_counts:
                    trend_counts[day_key] += 1

            trend = [
                {"date": day, "count": count}
                for day, count in sorted(trend_counts.items())
            ]

            by_agent: dict[str, dict] = {}

            for task in ranged_tasks:
                agent_key = task.assigned_agent or _UNASSIGNED_AGENT_LABEL
                bucket = by_agent.setdefault(
                    agent_key,
                    {"agent": agent_key, "total": 0, "completed": 0, "failed": 0},
                )
                bucket["total"] += 1

                if task.status == "completed":
                    bucket["completed"] += 1
                elif task.status == "failed":
                    bucket["failed"] += 1

            by_priority: dict[str, dict] = {}

            for task in ranged_tasks:
                priority_key = task.priority or "normal"
                bucket = by_priority.setdefault(
                    priority_key, {"priority": priority_key, "total": 0}
                )
                bucket["total"] += 1

            durations = [
                (task.completed_at - task.started_at).total_seconds()
                for task in ranged_tasks
                if task.status == "completed"
                and task.started_at is not None
                and task.completed_at is not None
            ]

            avg_duration_seconds = (
                sum(durations) / len(durations) if durations else None
            )

            recent_failed = sorted(
                (task for task in ranged_tasks if task.status == "failed"),
                key=lambda task: task.created_at,
                reverse=True,
            )[:_RECENT_FAILED_LIMIT]

            recent_failed_tasks = [
                {
                    "id": task.id,
                    "assigned_agent": task.assigned_agent,
                    "task_type": task.task_type,
                    "created_at": task.created_at.isoformat()
                    if task.created_at
                    else None,
                    "completed_at": task.completed_at.isoformat()
                    if task.completed_at
                    else None,
                    "safe_error": format_safe_error(task.error),
                }
                for task in recent_failed
            ]

            return {
                "range": normalized_range,
                "totals": totals,
                "completion_rate": round(completion_rate, 4),
                "failure_rate": round(failure_rate, 4),
                "today_new_tasks": today_new_tasks,
                "trend": trend,
                "by_agent": sorted(
                    by_agent.values(), key=lambda item: item["total"], reverse=True
                ),
                "by_priority": sorted(
                    by_priority.values(),
                    key=lambda item: item["total"],
                    reverse=True,
                ),
                "avg_duration_seconds": (
                    round(avg_duration_seconds, 2)
                    if avg_duration_seconds is not None
                    else None
                ),
                "recent_failed_tasks": recent_failed_tasks,
            }

        finally:
            db.close()
