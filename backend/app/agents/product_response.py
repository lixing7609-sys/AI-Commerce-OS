"""
产品 Agent 模型输出解析（阶段 8D，含审查后修订）。

只做严格的结构校验和防御性截断，不使用 eval，不尝试"修复"不
可信的 JSON，不从文本中提取或执行任何指令。解析失败或结构不
符一律安全降级为纯文本结果，不抛异常、不影响任务成功语义。

字段协议（与 product_prompt.py 的 JSON 结构、前端 ProductAnalysisView
保持一致，避免字段名错配导致数据不展示）：
- selection_verdict: {product, recommendation(test|hold|reject|
  need_more_data), reason, confidence(high|medium|low)}
- minimum_viable_test: {what_to_test, quantity, channel, duration,
  required_materials, success_signal, stop_condition, follow_up_data}
- reasonable_assumptions / supplier_questions / next_actions：均为
  简单字符串列表。
"""

import json

_REQUIRED_KEYS = (
    "summary",
    "known_facts",
    "reasonable_assumptions",
    "data_gaps",
    "opportunities",
    "selection_verdict",
    "assortment_plan",
    "minimum_viable_test",
    "listing_checklist",
    "supplier_questions",
    "next_actions",
    "required_inputs",
    "warnings",
)

_MAX_SUMMARY_LENGTH = 500
_MAX_TEXT_FALLBACK_LENGTH = 4000

_MAX_SIMPLE_LIST_ITEMS = 8
_MAX_SIMPLE_LIST_ITEM_LENGTH = 300

_MAX_ASSORTMENT_ITEMS = 5
_MAX_ASSORTMENT_ITEM_LENGTH = 200

_MAX_OPPORTUNITIES = 5
_MAX_LISTING_CHECKLIST_ITEMS = 10

_VALID_CONFIDENCE = ("high", "medium", "low")
_VALID_RECOMMENDATION = ("test", "hold", "reject", "need_more_data")
_VALID_CHECKLIST_STATUS = ("ready", "missing")

_MVT_STRING_FIELD_LENGTH = 300
_MVT_LIST_MAX_ITEMS = 8
_MVT_LIST_ITEM_LENGTH = 300


def _truncate(value, max_length: int) -> str:
    return str(value)[:max_length]


def _sanitize_simple_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(item, _MAX_SIMPLE_LIST_ITEM_LENGTH)
        for item in value[:_MAX_SIMPLE_LIST_ITEMS]
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


def _sanitize_selection_verdict(value) -> dict:
    if not isinstance(value, dict):
        return {
            "product": "",
            "recommendation": "need_more_data",
            "reason": "",
            "confidence": "low",
        }

    recommendation = value.get("recommendation")
    if recommendation not in _VALID_RECOMMENDATION:
        recommendation = "need_more_data"

    confidence = value.get("confidence")
    if confidence not in _VALID_CONFIDENCE:
        confidence = "low"

    return {
        "product": _truncate(
            value.get("product") or "", _MAX_SIMPLE_LIST_ITEM_LENGTH
        ),
        "recommendation": recommendation,
        "reason": _truncate(
            value.get("reason") or "", _MAX_SIMPLE_LIST_ITEM_LENGTH
        ),
        "confidence": confidence,
    }


def _sanitize_assortment_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(item, _MAX_ASSORTMENT_ITEM_LENGTH)
        for item in value[:_MAX_ASSORTMENT_ITEMS]
    ]


def _sanitize_assortment_plan(value) -> dict:
    if not isinstance(value, dict):
        return {"traffic_items": [], "profit_items": [], "filler_items": []}

    return {
        "traffic_items": _sanitize_assortment_list(value.get("traffic_items")),
        "profit_items": _sanitize_assortment_list(value.get("profit_items")),
        "filler_items": _sanitize_assortment_list(value.get("filler_items")),
    }


def _sanitize_mvt_string(value) -> str:
    return _truncate(value, _MVT_STRING_FIELD_LENGTH) if value else ""


def _sanitize_mvt_list(value) -> list[str]:
    if not isinstance(value, list):
        return []

    return [
        _truncate(item, _MVT_LIST_ITEM_LENGTH) for item in value[:_MVT_LIST_MAX_ITEMS]
    ]


def _sanitize_minimum_viable_test(value) -> dict:
    if not isinstance(value, dict):
        return {
            "what_to_test": "",
            "quantity": "",
            "channel": "",
            "duration": "",
            "required_materials": [],
            "success_signal": "",
            "stop_condition": "",
            "follow_up_data": [],
        }

    return {
        "what_to_test": _sanitize_mvt_string(value.get("what_to_test")),
        "quantity": _sanitize_mvt_string(value.get("quantity")),
        "channel": _sanitize_mvt_string(value.get("channel")),
        "duration": _sanitize_mvt_string(value.get("duration")),
        "required_materials": _sanitize_mvt_list(value.get("required_materials")),
        "success_signal": _sanitize_mvt_string(value.get("success_signal")),
        "stop_condition": _sanitize_mvt_string(value.get("stop_condition")),
        "follow_up_data": _sanitize_mvt_list(value.get("follow_up_data")),
    }


def _sanitize_checklist_item(item) -> dict | None:
    if not isinstance(item, dict):
        return None

    checklist_item = item.get("item")

    if not isinstance(checklist_item, str) or not checklist_item.strip():
        return None

    status = item.get("status")
    if status not in _VALID_CHECKLIST_STATUS:
        status = "missing"

    note = item.get("note")
    note = _truncate(note, _MAX_SIMPLE_LIST_ITEM_LENGTH) if note else ""

    return {
        "item": _truncate(checklist_item.strip(), _MAX_SIMPLE_LIST_ITEM_LENGTH),
        "status": status,
        "note": note,
    }


def _sanitize_listing_checklist(value) -> list[dict]:
    if not isinstance(value, list):
        return []

    result = []
    for item in value[:_MAX_LISTING_CHECKLIST_ITEMS]:
        sanitized = _sanitize_checklist_item(item)
        if sanitized is not None:
            result.append(sanitized)
    return result


def parse_product_response(content: str) -> dict:
    """
    返回 {"format": "structured", "product_analysis": {...}} 或
    {"format": "text", "product_analysis": {"text": "..."}}。
    """

    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {
            "format": "text",
            "product_analysis": {
                "text": str(content)[:_MAX_TEXT_FALLBACK_LENGTH]
            },
        }

    if not isinstance(parsed, dict) or not all(
        key in parsed for key in _REQUIRED_KEYS
    ):
        return {
            "format": "text",
            "product_analysis": {
                "text": str(content)[:_MAX_TEXT_FALLBACK_LENGTH]
            },
        }

    return {
        "format": "structured",
        "product_analysis": {
            "summary": _truncate(
                parsed.get("summary", ""), _MAX_SUMMARY_LENGTH
            ),
            "known_facts": _sanitize_simple_list(parsed.get("known_facts")),
            "reasonable_assumptions": _sanitize_simple_list(
                parsed.get("reasonable_assumptions")
            ),
            "data_gaps": _sanitize_simple_list(parsed.get("data_gaps")),
            "opportunities": _sanitize_opportunities(
                parsed.get("opportunities")
            ),
            "selection_verdict": _sanitize_selection_verdict(
                parsed.get("selection_verdict")
            ),
            "assortment_plan": _sanitize_assortment_plan(
                parsed.get("assortment_plan")
            ),
            "minimum_viable_test": _sanitize_minimum_viable_test(
                parsed.get("minimum_viable_test")
            ),
            "listing_checklist": _sanitize_listing_checklist(
                parsed.get("listing_checklist")
            ),
            "supplier_questions": _sanitize_simple_list(
                parsed.get("supplier_questions")
            ),
            "next_actions": _sanitize_simple_list(parsed.get("next_actions")),
            "required_inputs": _sanitize_simple_list(
                parsed.get("required_inputs")
            ),
            "warnings": _sanitize_simple_list(parsed.get("warnings")),
        },
    }
