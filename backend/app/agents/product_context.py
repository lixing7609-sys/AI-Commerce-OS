"""
阶段 8D：产品 Agent 安全上下文构建（ProductContextBuilder）。

只组装白名单字段：任务身份（服务端注入，不可由模型或 payload
伪造）、父任务（AI CEO）安全摘要（严格字段白名单+长度/条数
限制，绝不整份透传父任务 result）、同一 root_task_id 下销售
Agent 兄弟任务的安全结果摘要（同样严格白名单，且只读取已完成、
结构化格式的结果）、已有安全聚合服务提供的系统状态、以及固定为
False（除非未来真实接入）的业务数据可用状态。

不直接查询任意 Task 记录：父任务只在存在 parent_task_id 时按 id
精确查询一次，只读取该父任务里 AI CEO 已经生成、已经安全落库的
analysis/delegation 字段；销售 Agent 兄弟任务只在存在 root_task_id
时按 (root_task_id, assigned_agent="销售 Agent", status=completed)
查询最近 3 条，只读取其 sales_analysis 中的安全子集，不读取
payload/context/usage/provider 原始响应。
"""

from app.services.analytics_service import AnalyticsService
from app.services.dashboard_service import DashboardService
from app.services.task_consumer_service import task_consumer_service
from app.services.task_service import TaskService

_MAX_TITLE_LENGTH = 200
_MAX_STRING_ITEM_LENGTH = 300
_MAX_LIST_ITEMS = 8
_MAX_REASON_LENGTH = 300

_MAX_SALES_SIBLINGS = 3
_MAX_OPPORTUNITY_TITLES = 5

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


def _truncate(text, max_length: int) -> str:
    return str(text)[:max_length]


def _truncate_list(value, max_items: int, max_item_length: int) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(item, max_item_length)
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
    任务 task_id 的条目获得，只取这一个字符串字段。
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


def _safe_sales_sibling_summary(task_row) -> dict | None:
    """
    白名单抽取一条已完成销售 Agent 任务的安全结果摘要。

    只在结果结构完全符合预期（result.result.format == "structured"
    且 sales_analysis 是 dict）时才提取；任何不符合预期的结构都
    安全返回 None、跳过该条，不抛异常、不整份透传。
    """

    if not isinstance(task_row.result, dict):
        return None

    inner = task_row.result.get("result")

    if not isinstance(inner, dict) or inner.get("format") != "structured":
        return None

    sales_analysis = inner.get("sales_analysis")

    if not isinstance(sales_analysis, dict):
        return None

    strategy = sales_analysis.get("strategy")
    strategy = strategy if isinstance(strategy, dict) else {}

    opportunities = sales_analysis.get("opportunities")
    opportunity_titles = []
    if isinstance(opportunities, list):
        for item in opportunities[:_MAX_OPPORTUNITY_TITLES]:
            if isinstance(item, dict) and isinstance(item.get("title"), str):
                opportunity_titles.append(
                    _truncate(item["title"], _MAX_STRING_ITEM_LENGTH)
                )

    return {
        "summary": _truncate(
            str(sales_analysis.get("summary") or ""), _MAX_STRING_ITEM_LENGTH
        )
        or None,
        "known_facts": _truncate_list(
            sales_analysis.get("known_facts"),
            _MAX_LIST_ITEMS,
            _MAX_STRING_ITEM_LENGTH,
        ),
        "data_gaps": _truncate_list(
            sales_analysis.get("data_gaps"),
            _MAX_LIST_ITEMS,
            _MAX_STRING_ITEM_LENGTH,
        ),
        "opportunity_titles": opportunity_titles,
        "strategy_target": _truncate(
            str(strategy.get("target") or ""), _MAX_STRING_ITEM_LENGTH
        )
        or None,
        "strategy_positioning": _truncate(
            str(strategy.get("positioning") or ""), _MAX_STRING_ITEM_LENGTH
        )
        or None,
        "required_inputs": _truncate_list(
            sales_analysis.get("required_inputs"),
            _MAX_LIST_ITEMS,
            _MAX_STRING_ITEM_LENGTH,
        ),
        "warnings": _truncate_list(
            sales_analysis.get("warnings"),
            _MAX_LIST_ITEMS,
            _MAX_STRING_ITEM_LENGTH,
        ),
    }


def _safe_sales_agent_reference(
    root_task_id: str | None,
    task_id: str | None,
    shop_id: int | None,
) -> list[dict]:
    """
    读取同一 root_task_id 下、销售 Agent 已完成的最近 3 条任务的
    安全结果摘要，供产品 Agent 作为"市场/渠道方向参考"——不是
    Agent 间直接调用，只是同一委派链下已经落库、已经安全摘要过的
    兄弟任务结果，产品 Agent 不会触发销售 Agent 执行、不读取其
    payload/context/usage。root_task_id 缺失时安全返回空列表。

    阶段 8E：额外要求兄弟任务与当前任务 shop_id 完全一致（含双方
    都是 None 的"未绑定店铺"情形），防止跨店铺读取。
    """

    if not root_task_id:
        return []

    rows = TaskService.get_recent_completed_by_root(
        root_task_id,
        "销售 Agent",
        exclude_task_id=task_id,
        shop_id=shop_id,
        require_same_shop=True,
        limit=_MAX_SALES_SIBLINGS,
    )

    summaries = []
    for row in rows:
        summary = _safe_sales_sibling_summary(row)
        if summary is not None:
            summaries.append(summary)

    return summaries


def build_product_context(
    *,
    agent_name: str,
    task_name: str,
    priority: str,
    task_id: str | None,
    parent_task_id: str | None,
    root_task_id: str | None,
    delegation_depth: int,
    shop_id: int | None = None,
) -> dict:
    source = "ai_ceo_delegation" if parent_task_id else "direct"

    parent_analysis = _safe_parent_analysis(parent_task_id, task_id)
    sales_agent_reference = _safe_sales_agent_reference(
        root_task_id, task_id, shop_id
    )

    summary = DashboardService.get_summary()
    analytics = AnalyticsService.get_task_analytics("30d")
    consumer_status = task_consumer_service.get_status()

    by_agent_lookup = {item["agent"]: item for item in analytics["by_agent"]}
    product_stats = by_agent_lookup.get(agent_name)

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
        "sales_agent_reference": sales_agent_reference,
        "system_status": {
            "runtime_running": summary["runtime"]["running"],
            "consumer_healthy": consumer_status["running"],
            "today_tasks": analytics["today_new_tasks"],
            "last_7_days_tasks": analytics["trend"],
            "product_agent_statistics": {
                "processed_last_30_days": (
                    product_stats["total"] if product_stats else 0
                ),
                "completed_last_30_days": (
                    product_stats["completed"] if product_stats else 0
                ),
                "failed_last_30_days": (
                    product_stats["failed"] if product_stats else 0
                ),
            },
        },
        "data_availability": {
            "products_connected": False,
            "orders_connected": False,
            "supply_chain_connected": False,
            "inventory_connected": False,
            "customers_connected": False,
            "douyin_shop_connected": False,
            "sourcing_platform_connected": False,
        },
    }
