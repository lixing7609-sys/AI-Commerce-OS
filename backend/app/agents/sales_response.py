"""
销售 Agent 模型输出解析（阶段 8C）。

只做严格的结构校验和防御性截断，不使用 eval，不尝试"修复"不
可信的 JSON，不从文本中提取或执行任何指令。解析失败或结构不
符一律安全降级为纯文本结果，不抛异常、不影响任务成功语义。
"""

import json

_REQUIRED_KEYS = (
    "summary",
    "known_facts",
    "data_gaps",
    "opportunities",
    "strategy",
    "actions_today",
    "seven_day_plan",
    "required_inputs",
    "warnings",
)

_MAX_SUMMARY_LENGTH = 500
_MAX_TEXT_FALLBACK_LENGTH = 4000

_MAX_SIMPLE_LIST_ITEMS = 8
_MAX_SIMPLE_LIST_ITEM_LENGTH = 300

_MAX_PLAN_LIST_ITEMS = 10
_MAX_PLAN_LIST_ITEM_LENGTH = 300

_MAX_OPPORTUNITIES = 5
_MAX_ACTIONS_TODAY = 5
_MAX_SEVEN_DAY_PLAN = 7
_MAX_DAY_ACTIONS = 5
_MAX_DAY_ACTION_LENGTH = 200

_VALID_CONFIDENCE = ("high", "medium", "low")
_VALID_PRIORITY = ("high", "normal", "low")
_VALID_OWNERS = ("用户", "产品 Agent", "销售 Agent", "财务 Agent", "行政 Agent")


def _truncate(value, max_length: int) -> str:
    return str(value)[:max_length]


def _sanitize_simple_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(item, _MAX_SIMPLE_LIST_ITEM_LENGTH)
        for item in value[:_MAX_SIMPLE_LIST_ITEMS]
    ]


def _sanitize_plan_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(item, _MAX_PLAN_LIST_ITEM_LENGTH)
        for item in value[:_MAX_PLAN_LIST_ITEMS]
    ]


def _sanitize_opportunity(item) -> dict | None:
    if not isinstance(item, dict):
        return None

    title = item.get("title")
    reason = item.get("reason")

    if not isinstance(title, str) or not title.strip():
        return None

    if not isinstance(reason, str) or not reason.strip():
        return None

    confidence = item.get("confidence")
    if confidence not in _VALID_CONFIDENCE:
        confidence = "medium"

    return {
        "title": _truncate(title.strip(), _MAX_SIMPLE_LIST_ITEM_LENGTH),
        "reason": _truncate(reason.strip(), _MAX_SIMPLE_LIST_ITEM_LENGTH),
        "confidence": confidence,
    }


def _sanitize_opportunities(value) -> list[dict]:
    if not isinstance(value, list):
        return []

    result = []
    for item in value[:_MAX_OPPORTUNITIES]:
        sanitized = _sanitize_opportunity(item)
        if sanitized is not None:
            result.append(sanitized)
    return result


def _sanitize_strategy(value) -> dict:
    if not isinstance(value, dict):
        return {
            "target": "",
            "positioning": "",
            "channel_plan": [],
            "content_plan": [],
            "conversion_plan": [],
        }

    return {
        "target": _truncate(value.get("target") or "", _MAX_SIMPLE_LIST_ITEM_LENGTH),
        "positioning": _truncate(
            value.get("positioning") or "", _MAX_SIMPLE_LIST_ITEM_LENGTH
        ),
        "channel_plan": _sanitize_plan_list(value.get("channel_plan")),
        "content_plan": _sanitize_plan_list(value.get("content_plan")),
        "conversion_plan": _sanitize_plan_list(value.get("conversion_plan")),
    }


def _sanitize_action_today(item) -> dict | None:
    if not isinstance(item, dict):
        return None

    action = item.get("action")

    if not isinstance(action, str) or not action.strip():
        return None

    owner = item.get("owner")
    if owner not in _VALID_OWNERS:
        owner = "用户"

    priority = item.get("priority")
    if priority not in _VALID_PRIORITY:
        priority = "normal"

    expected_output = item.get("expected_output")
    expected_output = (
        _truncate(expected_output, _MAX_SIMPLE_LIST_ITEM_LENGTH)
        if expected_output
        else ""
    )

    return {
        "action": _truncate(action.strip(), _MAX_SIMPLE_LIST_ITEM_LENGTH),
        "owner": owner,
        "priority": priority,
        "expected_output": expected_output,
    }


def _sanitize_actions_today(value) -> list[dict]:
    if not isinstance(value, list):
        return []

    result = []
    for item in value[:_MAX_ACTIONS_TODAY]:
        sanitized = _sanitize_action_today(item)
        if sanitized is not None:
            result.append(sanitized)
    return result


def _sanitize_day_plan(item) -> dict | None:
    if not isinstance(item, dict):
        return None

    day = item.get("day")

    if not isinstance(day, int) or isinstance(day, bool) or not (1 <= day <= 7):
        return None

    actions = item.get("actions")
    actions = (
        [
            _truncate(action, _MAX_DAY_ACTION_LENGTH)
            for action in actions[:_MAX_DAY_ACTIONS]
        ]
        if isinstance(actions, list)
        else []
    )

    success_signal = item.get("success_signal")
    success_signal = (
        _truncate(success_signal, _MAX_SIMPLE_LIST_ITEM_LENGTH)
        if success_signal
        else ""
    )

    return {"day": day, "actions": actions, "success_signal": success_signal}


def _sanitize_seven_day_plan(value) -> list[dict]:
    if not isinstance(value, list):
        return []

    result = []
    for item in value[:_MAX_SEVEN_DAY_PLAN]:
        sanitized = _sanitize_day_plan(item)
        if sanitized is not None:
            result.append(sanitized)
    return result


def parse_sales_response(content: str) -> dict:
    """
    返回 {"format": "structured", "sales_analysis": {...}} 或
    {"format": "text", "sales_analysis": {"text": "..."}}。
    """

    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {
            "format": "text",
            "sales_analysis": {
                "text": str(content)[:_MAX_TEXT_FALLBACK_LENGTH]
            },
        }

    if not isinstance(parsed, dict) or not all(
        key in parsed for key in _REQUIRED_KEYS
    ):
        return {
            "format": "text",
            "sales_analysis": {
                "text": str(content)[:_MAX_TEXT_FALLBACK_LENGTH]
            },
        }

    return {
        "format": "structured",
        "sales_analysis": {
            "summary": _truncate(
                parsed.get("summary", ""), _MAX_SUMMARY_LENGTH
            ),
            "known_facts": _sanitize_simple_list(parsed.get("known_facts")),
            "data_gaps": _sanitize_simple_list(parsed.get("data_gaps")),
            "opportunities": _sanitize_opportunities(
                parsed.get("opportunities")
            ),
            "strategy": _sanitize_strategy(parsed.get("strategy")),
            "actions_today": _sanitize_actions_today(
                parsed.get("actions_today")
            ),
            "seven_day_plan": _sanitize_seven_day_plan(
                parsed.get("seven_day_plan")
            ),
            "required_inputs": _sanitize_simple_list(
                parsed.get("required_inputs")
            ),
            "warnings": _sanitize_simple_list(parsed.get("warnings")),
        },
    }
