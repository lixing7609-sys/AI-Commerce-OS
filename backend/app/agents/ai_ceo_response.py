"""
AI CEO 模型输出解析。

只做严格的结构校验和防御性截断，不使用 eval，不尝试"修复"不
可信的 JSON（例如补全缺失括号、剥离多余文本）——解析失败一律
安全降级为纯文本结果，不抛异常、不影响任务成功语义。
"""

import json

_REQUIRED_KEYS = ("summary", "findings", "risks", "actions", "delegations")
_LIST_KEYS = ("findings", "risks", "actions")

_MAX_SUMMARY_LENGTH = 500
_MAX_LIST_ITEMS = 20
_MAX_LIST_ITEM_LENGTH = 300
_MAX_TEXT_FALLBACK_LENGTH = 4000

# delegations 结构校验只做类型/长度层面的防御性截断（纯解析
# 关注点）；assigned_agent 是否为真实已注册 Agent、是否为 AI CEO
# 自己、task 长度是否符合业务规则（1-64 字符）、去重、数量上限
# 等业务校验由 app.services.task_delegation_service 负责——两者
# 职责分离，本模块不依赖 AgentRegistry 或数据库。
_MAX_DELEGATION_ITEMS = 10
_MAX_DELEGATION_AGENT_LENGTH = 100
_MAX_DELEGATION_TASK_LENGTH = 200
_MAX_DELEGATION_REASON_LENGTH = 300
_VALID_DELEGATION_PRIORITIES = ("high", "normal", "low")


def _sanitize_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        str(item)[:_MAX_LIST_ITEM_LENGTH]
        for item in value[:_MAX_LIST_ITEMS]
    ]


def _sanitize_delegation_item(item) -> dict | None:
    if not isinstance(item, dict):
        return None

    assigned_agent = item.get("assigned_agent")
    task_text = item.get("task")

    if not isinstance(assigned_agent, str) or not isinstance(task_text, str):
        return None

    assigned_agent = assigned_agent.strip()
    task_text = task_text.strip()

    if not assigned_agent or not task_text:
        return None

    priority = item.get("priority")
    if priority not in _VALID_DELEGATION_PRIORITIES:
        priority = "normal"

    reason = item.get("reason")
    reason = str(reason)[:_MAX_DELEGATION_REASON_LENGTH] if reason else ""

    return {
        "assigned_agent": assigned_agent[:_MAX_DELEGATION_AGENT_LENGTH],
        "task": task_text[:_MAX_DELEGATION_TASK_LENGTH],
        "priority": priority,
        "reason": reason,
    }


def _sanitize_delegations(value) -> list[dict]:
    if not isinstance(value, list):
        return []

    result = []

    for item in value[:_MAX_DELEGATION_ITEMS]:
        sanitized = _sanitize_delegation_item(item)

        if sanitized is not None:
            result.append(sanitized)

    return result


def parse_ai_ceo_response(content: str) -> dict:
    """
    返回 {"format": "structured", "analysis": {...}} 或
    {"format": "text", "analysis": {"text": "..."}}。

    analysis.delegations 是经过结构清洗（而非业务校验）的
    {assigned_agent, task, priority, reason} 字典列表。
    """

    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {
            "format": "text",
            "analysis": {"text": str(content)[:_MAX_TEXT_FALLBACK_LENGTH]},
        }

    if not isinstance(parsed, dict) or not all(
        key in parsed for key in _REQUIRED_KEYS
    ):
        return {
            "format": "text",
            "analysis": {"text": str(content)[:_MAX_TEXT_FALLBACK_LENGTH]},
        }

    return {
        "format": "structured",
        "analysis": {
            "summary": str(parsed.get("summary", ""))[:_MAX_SUMMARY_LENGTH],
            **{key: _sanitize_list(parsed.get(key)) for key in _LIST_KEYS},
            "delegations": _sanitize_delegations(parsed.get("delegations")),
        },
    }
