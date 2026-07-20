"""
AI CEO 模型输出解析。

只做严格的结构校验和防御性截断，不使用 eval，不尝试"修复"不
可信的 JSON（例如补全缺失括号、剥离多余文本）——解析失败一律
安全降级为纯文本结果，不抛异常、不影响任务成功语义。
"""

import json

_REQUIRED_KEYS = ("summary", "findings", "risks", "actions", "delegations")
_LIST_KEYS = ("findings", "risks", "actions", "delegations")

_MAX_SUMMARY_LENGTH = 500
_MAX_LIST_ITEMS = 20
_MAX_LIST_ITEM_LENGTH = 300
_MAX_TEXT_FALLBACK_LENGTH = 4000


def _sanitize_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        str(item)[:_MAX_LIST_ITEM_LENGTH]
        for item in value[:_MAX_LIST_ITEMS]
    ]


def parse_ai_ceo_response(content: str) -> dict:
    """
    返回 {"format": "structured", "analysis": {...}} 或
    {"format": "text", "analysis": {"text": "..."}}。
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
        },
    }
