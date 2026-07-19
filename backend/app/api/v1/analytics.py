from fastapi import APIRouter

from app.services.analytics_service import AnalyticsService

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
)


@router.get("/tasks")
def get_task_analytics(range: str | None = None):
    """
    任务数据聚合统计（只读）。

    range 支持 today / 7d / 30d，缺省或非法值按 7d 处理。
    只返回聚合后的计数、比率、分组统计和脱敏后的失败任务摘要，
    不返回任何任务的 payload/context/原始 result。
    """

    return AnalyticsService.get_task_analytics(range)
