"""
阶段 8C：销售 Agent 安全上下文构建（SalesContextBuilder）。

只组装白名单字段：任务身份（服务端注入，不可由模型或 payload
伪造）、父任务（AI CEO）安全摘要（严格字段白名单+长度/条数
限制，绝不整份透传父任务 result）、已有安全聚合服务提供的系统
状态、以及固定为 False（除非未来真实接入）的业务数据可用状态。

不直接查询任意 Task 记录，只在存在 parent_task_id 时按 id 精确
查询一次父任务，且只读取该父任务里 AI CEO 已经生成、已经安全
落库的 analysis/delegation 字段，不读取父任务 payload/context。
"""

from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from app.services.task_consumer_service import task_consumer_service
from app.services.task_service import TaskService

_MAX_TITLE_LENGTH = 200
_MAX_STRING_ITEM_LENGTH = 300
_MAX_LIST_ITEMS = 8
_MAX_REASON_LENGTH = 300

_EMPTY_PARENT_ANALYSIS = {
    "summary": None,
    "findings": [],
    "risks": [],
    "actions": [],
    "delegation_reason": None,
}


def _clean_control_characters(text: str) -> str:
    """
    去除控制字符（保留常规空白），供任务标题等用户可见文本在
    进入 Prompt 前做最基础的清理；不解析、不执行其中的任何内容。
    """

    return "".join(
        ch for ch in text if ch.isprintable() or ch in ("\n", "\t", " ")
    ).strip()


def _truncate(text: str, max_length: int) -> str:
    return text[:max_length]


def _truncate_list(value, max_items: int, max_item_length: int) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(str(item), max_item_length)
        for item in value[:max_items]
        if isinstance(item, (str, int, float))
    ]


def _safe_parent_analysis(parent_task_id: str | None, task_id: str | None) -> dict:
    """
    白名单抽取父任务（预期为 AI CEO 经营分析）的安全摘要。

    父任务不存在、尚未完成、result 结构不是预期形状等任何异常
    情况都安全降级为空摘要，绝不抛出异常、绝不整份透传父任务
    result。delegation_reason 通过在父任务的
    result.result.delegation.items 中查找 child_task_id 等于本
    任务 task_id 的条目获得——这是父任务当初委派本任务时记录的
    原因，只取这一个字符串字段，不取该条目的其它内容。
    """

    if not parent_task_id:
        return dict(_EMPTY_PARENT_ANALYSIS)

    parent_row = TaskService.get_task(parent_task_id)

    if parent_row is None or not isinstance(parent_row.result, dict):
        return dict(_EMPTY_PARENT_ANALYSIS)

    inner = parent_row.result.get("result")

    if not isinstance(inner, dict):
        return dict(_EMPTY_PARENT_ANALYSIS)

    analysis = inner.get("analysis")
    analysis = analysis if isinstance(analysis, dict) else {}

    delegation_reason = None
    delegation = inner.get("delegation")

    if isinstance(delegation, dict):
        items = delegation.get("items")

        if isinstance(items, list):
            for item in items:
                if (
                    isinstance(item, dict)
                    and item.get("child_task_id") == task_id
                ):
                    reason = item.get("reason")
                    delegation_reason = (
                        _truncate(str(reason), _MAX_REASON_LENGTH)
                        if reason
                        else None
                    )
                    break

    return {
        "summary": _truncate(
            str(analysis.get("summary") or ""), _MAX_STRING_ITEM_LENGTH
        )
        or None,
        "findings": _truncate_list(
            analysis.get("findings"), _MAX_LIST_ITEMS, _MAX_STRING_ITEM_LENGTH
        ),
        "risks": _truncate_list(
            analysis.get("risks"), _MAX_LIST_ITEMS, _MAX_STRING_ITEM_LENGTH
        ),
        "actions": _truncate_list(
            analysis.get("actions"), _MAX_LIST_ITEMS, _MAX_STRING_ITEM_LENGTH
        ),
        "delegation_reason": delegation_reason,
    }


def build_sales_context(
    *,
    agent_name: str,
    task_name: str,
    priority: str,
    task_id: str | None,
    parent_task_id: str | None,
    delegation_depth: int,
) -> dict:
    source = "ai_ceo_delegation" if parent_task_id else "direct"

    parent_analysis = _safe_parent_analysis(parent_task_id, task_id)

    summary = DashboardService.get_summary()
    analytics = AnalyticsService.get_task_analytics("30d")
    consumer_status = task_consumer_service.get_status()

    by_agent_lookup = {item["agent"]: item for item in analytics["by_agent"]}
    sales_stats = by_agent_lookup.get(agent_name)

    return {
        "task": {
            "title": _clean_control_characters(
                _truncate(task_name, _MAX_TITLE_LENGTH)
            ),
            "priority": priority,
            "source": source,
            "delegation_depth": delegation_depth,
        },
        "parent_analysis": parent_analysis,
        "system_status": {
            "runtime_running": summary["runtime"]["running"],
            "consumer_healthy": consumer_status["running"],
            "today_tasks": analytics["today_new_tasks"],
            "last_7_days_tasks": analytics["trend"],
            "sales_agent_statistics": {
                "processed_last_30_days": (
                    sales_stats["total"] if sales_stats else 0
                ),
                "completed_last_30_days": (
                    sales_stats["completed"] if sales_stats else 0
                ),
                "failed_last_30_days": (
                    sales_stats["failed"] if sales_stats else 0
                ),
            },
        },
        "data_availability": {
            "orders_connected": False,
            "products_connected": False,
            "customers_connected": False,
            "douyin_shop_connected": False,
            "ad_platform_connected": False,
        },
    }
