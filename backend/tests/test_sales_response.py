"""
销售 Agent 模型输出解析（parse_sales_response）测试（阶段 8C）。

覆盖：structured JSON 正确解析、text fallback、各数组截断、
字符串截断、confidence/owner/priority 白名单、day 范围校验、
多余字段忽略、不使用 eval（恶意文本不会被执行，只作为纯文本
安全降级展示）。
"""

import json

from app.agents.sales_response import parse_sales_response

_VALID_PAYLOAD = {
    "summary": "s",
    "known_facts": ["f1"],
    "data_gaps": ["g1"],
    "opportunities": [{"title": "t1", "reason": "r1", "confidence": "high"}],
    "strategy": {
        "target": "target",
        "positioning": "pos",
        "channel_plan": ["c1"],
        "content_plan": ["p1"],
        "conversion_plan": ["v1"],
    },
    "actions_today": [
        {
            "action": "a1",
            "owner": "销售 Agent",
            "priority": "high",
            "expected_output": "o1",
        }
    ],
    "seven_day_plan": [{"day": 1, "actions": ["x1"], "success_signal": "sig"}],
    "required_inputs": ["i1"],
    "warnings": ["w1"],
}


def test_valid_structured_json_parses_correctly():
    result = parse_sales_response(json.dumps(_VALID_PAYLOAD, ensure_ascii=False))

    assert result["format"] == "structured"
    analysis = result["sales_analysis"]
    assert analysis["summary"] == "s"
    assert analysis["known_facts"] == ["f1"]
    assert analysis["opportunities"][0]["confidence"] == "high"
    assert analysis["actions_today"][0]["owner"] == "销售 Agent"
    assert analysis["seven_day_plan"][0]["day"] == 1


def test_text_fallback_on_invalid_json():
    result = parse_sales_response("这不是合法 JSON")

    assert result["format"] == "text"
    assert result["sales_analysis"]["text"] == "这不是合法 JSON"


def test_text_fallback_on_missing_required_keys():
    incomplete = {"summary": "s"}
    result = parse_sales_response(json.dumps(incomplete))

    assert result["format"] == "text"


def test_known_facts_truncated_to_eight_items():
    payload = dict(_VALID_PAYLOAD)
    payload["known_facts"] = [f"fact-{i}" for i in range(20)]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["sales_analysis"]["known_facts"]) == 8


def test_opportunities_truncated_to_five_items():
    payload = dict(_VALID_PAYLOAD)
    payload["opportunities"] = [
        {"title": f"t{i}", "reason": f"r{i}", "confidence": "high"}
        for i in range(10)
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["sales_analysis"]["opportunities"]) == 5


def test_actions_today_truncated_to_five_items():
    payload = dict(_VALID_PAYLOAD)
    payload["actions_today"] = [
        {"action": f"a{i}", "owner": "用户", "priority": "normal"}
        for i in range(10)
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["sales_analysis"]["actions_today"]) == 5


def test_seven_day_plan_truncated_to_seven_items():
    payload = dict(_VALID_PAYLOAD)
    payload["seven_day_plan"] = [
        {"day": (i % 7) + 1, "actions": [], "success_signal": ""}
        for i in range(15)
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["sales_analysis"]["seven_day_plan"]) == 7


def test_string_fields_are_length_truncated():
    payload = dict(_VALID_PAYLOAD)
    payload["summary"] = "x" * 1000

    result = parse_sales_response(json.dumps(payload))

    assert len(result["sales_analysis"]["summary"]) == 500


def test_invalid_confidence_defaults_to_medium():
    payload = dict(_VALID_PAYLOAD)
    payload["opportunities"] = [
        {"title": "t", "reason": "r", "confidence": "super-high"}
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert result["sales_analysis"]["opportunities"][0]["confidence"] == "medium"


def test_invalid_owner_defaults_to_user():
    payload = dict(_VALID_PAYLOAD)
    payload["actions_today"] = [
        {"action": "a", "owner": "抖音运营 Agent", "priority": "normal"}
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert result["sales_analysis"]["actions_today"][0]["owner"] == "用户"


def test_invalid_priority_defaults_to_normal():
    payload = dict(_VALID_PAYLOAD)
    payload["actions_today"] = [
        {"action": "a", "owner": "用户", "priority": "urgent-not-real"}
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert result["sales_analysis"]["actions_today"][0]["priority"] == "normal"


def test_day_out_of_range_is_dropped():
    payload = dict(_VALID_PAYLOAD)
    payload["seven_day_plan"] = [
        {"day": 0, "actions": [], "success_signal": ""},
        {"day": 8, "actions": [], "success_signal": ""},
        {"day": 3, "actions": [], "success_signal": ""},
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    plan = result["sales_analysis"]["seven_day_plan"]
    assert len(plan) == 1
    assert plan[0]["day"] == 3


def test_extra_fields_are_ignored():
    payload = dict(_VALID_PAYLOAD)
    payload["unexpected_field"] = "should be dropped"
    payload["opportunities"] = [
        {
            "title": "t",
            "reason": "r",
            "confidence": "high",
            "extra_model_field": "dropped",
        }
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    assert "unexpected_field" not in result["sales_analysis"]
    assert "extra_model_field" not in result["sales_analysis"]["opportunities"][0]


def test_malicious_text_content_never_executed():
    """
    不使用 eval：即使模型输出看起来像可执行代码，也只会被当作
    纯文本安全降级展示，不会被解析执行。
    """

    malicious_content = "__import__('os').system('echo pwned')"

    result = parse_sales_response(malicious_content)

    assert result["format"] == "text"
    assert result["sales_analysis"]["text"] == malicious_content


def test_opportunity_missing_title_or_reason_is_dropped():
    payload = dict(_VALID_PAYLOAD)
    payload["opportunities"] = [
        {"title": "", "reason": "r", "confidence": "high"},
        {"reason": "r2", "confidence": "high"},
        {"title": "ok", "reason": "ok-reason", "confidence": "high"},
    ]

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    opportunities = result["sales_analysis"]["opportunities"]
    assert len(opportunities) == 1
    assert opportunities[0]["title"] == "ok"


def test_strategy_defaults_when_missing_or_malformed():
    payload = dict(_VALID_PAYLOAD)
    payload["strategy"] = "not a dict"

    result = parse_sales_response(json.dumps(payload, ensure_ascii=False))

    strategy = result["sales_analysis"]["strategy"]
    assert strategy["target"] == ""
    assert strategy["channel_plan"] == []
