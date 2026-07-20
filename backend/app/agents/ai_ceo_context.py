"""
AI CEO 经营分析上下文构建。

只组装已经安全的聚合数据（全部来自既有的 DashboardService /
AnalyticsService / SettingsService，本身已经不含 payload/
context/Secret/traceback），不直接查询数据库、不读取任何原始
Task 记录。
"""

from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from app.services.settings_service import SettingsService
from app.services.task_consumer_service import task_consumer_service

_RECENT_FAILED_LIMIT = 5


def build_ai_ceo_context() -> dict:
    summary = DashboardService.get_summary()
    analytics = AnalyticsService.get_task_analytics("30d")
    integration_status = SettingsService.get_integration_status()
    consumer_status = task_consumer_service.get_status()

    by_agent_lookup = {item["agent"]: item for item in analytics["by_agent"]}

    agents = []
    for item in summary["agents"]["items"]:
        stats = by_agent_lookup.get(item["name"])
        agents.append(
            {
                "name": item["name"],
                "status": item["status"],
                "processed_last_30_days": stats["total"] if stats else 0,
                "completed_last_30_days": stats["completed"] if stats else 0,
                "failed_last_30_days": stats["failed"] if stats else 0,
            }
        )

    return {
        "runtime": {
            "running": summary["runtime"]["running"],
            "status": summary["runtime"]["status"],
            "consumer_healthy": consumer_status["running"],
        },
        "tasks": {
            "total": summary["tasks"]["total"],
            "pending": summary["tasks"]["pending"],
            "running": summary["tasks"]["running"],
            "completed": summary["tasks"]["completed"],
            "failed": summary["tasks"]["failed"],
            "today_new_tasks": analytics["today_new_tasks"],
            "last_7_days_trend": analytics["trend"],
            "completion_rate_last_30_days": analytics["completion_rate"],
            "failure_rate_last_30_days": analytics["failure_rate"],
            "recent_failed_tasks": [
                {
                    "task_type": item["task_type"],
                    "assigned_agent": item["assigned_agent"],
                    "safe_error": item["safe_error"],
                }
                for item in analytics["recent_failed_tasks"][:_RECENT_FAILED_LIMIT]
            ],
        },
        "agents": agents,
        "integrations": integration_status,
    }
