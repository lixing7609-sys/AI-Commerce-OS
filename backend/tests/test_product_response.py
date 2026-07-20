"""
产品 Agent 模型输出解析（parse_product_response）测试（阶段 8D，
含审查后修订）。

覆盖：structured JSON 正确解析、text fallback、各数组截断、
字符串截断、confidence/recommendation/checklist status 白名单、
minimum_viable_test 对象结构、reasonable_assumptions/
supplier_questions/next_actions 简单列表、多余字段忽略、不使用
eval（恶意文本不会被执行，只作为纯文本安全降级展示）。
"""

import json

from app.agents.product_response import parse_product_response

_VALID_PAYLOAD = {
    "summary": "s",
    "known_facts": ["f1"],
    "reasonable_assumptions": ["假设:年轻消费者偏好轻量化包装"],
    "data_gaps": ["g1"],
    "opportunities": [{"title": "t1", "reason": "r1", "confidence": "high"}],
    "selection_verdict": {
        "product": "某商品",
        "recommendation": "test",
        "reason": "reason",
        "confidence": "medium",
    },
    "assortment_plan": {
        "traffic_items": ["a1"],
        "profit_items": ["p1"],
        "filler_items": ["f1"],
    },
    "minimum_viable_test": {
        "what_to_test": "验证转化率",
        "quantity": "50件",
        "channel": "抖音小店",
        "duration": "7天",
        "required_materials": ["主图", "详情页"],
        "success_signal": "转化率>1%",
        "stop_condition": "3天0转化",
        "follow_up_data": ["实际转化率", "退货率"],
    },
    "listing_checklist": [
        {"item": "标题", "status": "missing", "note": "待补充"}
    ],
    "supplier_questions": ["MOQ是多少"],
    "next_actions": ["联系供应商确认报价"],
    "required_inputs": ["i1"],
    "warnings": ["w1"],
}


def test_valid_structured_json_parses_correctly():
    result = parse_product_response(json.dumps(_VALID_PAYLOAD, ensure_ascii=False))

    assert result["format"] == "structured"
    analysis = result["product_analysis"]
    assert analysis["summary"] == "s"
    assert analysis["known_facts"] == ["f1"]
    assert analysis["reasonable_assumptions"] == [
        "假设:年轻消费者偏好轻量化包装"
    ]
    assert analysis["opportunities"][0]["confidence"] == "high"
    assert analysis["selection_verdict"]["recommendation"] == "test"
    assert analysis["selection_verdict"]["confidence"] == "medium"
    assert analysis["assortment_plan"]["traffic_items"] == ["a1"]
    assert analysis["minimum_viable_test"]["what_to_test"] == "验证转化率"
    assert analysis["minimum_viable_test"]["required_materials"] == [
        "主图",
        "详情页",
    ]
    assert analysis["minimum_viable_test"]["follow_up_data"] == [
        "实际转化率",
        "退货率",
    ]
    assert analysis["listing_checklist"][0]["status"] == "missing"
    assert analysis["supplier_questions"] == ["MOQ是多少"]
    assert analysis["next_actions"] == ["联系供应商确认报价"]


def test_text_fallback_on_invalid_json():
    result = parse_product_response("这不是合法 JSON")

    assert result["format"] == "text"
    assert result["product_analysis"]["text"] == "这不是合法 JSON"


def test_text_fallback_on_missing_required_keys():
    incomplete = {"summary": "s"}
    result = parse_product_response(json.dumps(incomplete))

    assert result["format"] == "text"


def test_text_fallback_on_old_schema_missing_new_keys():
    """
    旧协议（selection_verdict.verdict / test_plan 列表）缺少新协议
    要求的 minimum_viable_test/reasonable_assumptions/
    supplier_questions/next_actions 字段时，必须安全降级为 text，
    不得静默套用旧结构。
    """

    old_shape = dict(_VALID_PAYLOAD)
    del old_shape["minimum_viable_test"]
    del old_shape["reasonable_assumptions"]
    old_shape["test_plan"] = []

    result = parse_product_response(json.dumps(old_shape, ensure_ascii=False))

    assert result["format"] == "text"


def test_known_facts_truncated_to_eight_items():
    payload = dict(_VALID_PAYLOAD)
    payload["known_facts"] = [f"fact-{i}" for i in range(20)]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["product_analysis"]["known_facts"]) == 8


def test_reasonable_assumptions_truncated_to_eight_items():
    payload = dict(_VALID_PAYLOAD)
    payload["reasonable_assumptions"] = [f"assumption-{i}" for i in range(20)]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["product_analysis"]["reasonable_assumptions"]) == 8


def test_opportunities_truncated_to_five_items():
    payload = dict(_VALID_PAYLOAD)
    payload["opportunities"] = [
        {"title": f"t{i}", "reason": f"r{i}", "confidence": "high"}
        for i in range(10)
    ]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["product_analysis"]["opportunities"]) == 5


def test_assortment_items_truncated_to_five():
    payload = dict(_VALID_PAYLOAD)
    payload["assortment_plan"] = {
        "traffic_items": [f"t{i}" for i in range(10)],
        "profit_items": [],
        "filler_items": [],
    }

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["product_analysis"]["assortment_plan"]["traffic_items"]) == 5


def test_listing_checklist_truncated_to_ten_items():
    payload = dict(_VALID_PAYLOAD)
    payload["listing_checklist"] = [
        {"item": f"item-{i}", "status": "ready", "note": ""} for i in range(20)
    ]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["product_analysis"]["listing_checklist"]) == 10


def test_minimum_viable_test_lists_truncated_to_eight_items():
    payload = dict(_VALID_PAYLOAD)
    payload["minimum_viable_test"] = {
        **_VALID_PAYLOAD["minimum_viable_test"],
        "required_materials": [f"m{i}" for i in range(20)],
        "follow_up_data": [f"d{i}" for i in range(20)],
    }

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    mvt = result["product_analysis"]["minimum_viable_test"]
    assert len(mvt["required_materials"]) == 8
    assert len(mvt["follow_up_data"]) == 8


def test_supplier_questions_and_next_actions_truncated_to_eight_items():
    payload = dict(_VALID_PAYLOAD)
    payload["supplier_questions"] = [f"q{i}" for i in range(20)]
    payload["next_actions"] = [f"a{i}" for i in range(20)]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert len(result["product_analysis"]["supplier_questions"]) == 8
    assert len(result["product_analysis"]["next_actions"]) == 8


def test_string_fields_are_length_truncated():
    payload = dict(_VALID_PAYLOAD)
    payload["summary"] = "x" * 1000

    result = parse_product_response(json.dumps(payload))

    assert len(result["product_analysis"]["summary"]) == 500


def test_invalid_confidence_defaults_to_medium():
    payload = dict(_VALID_PAYLOAD)
    payload["opportunities"] = [
        {"title": "t", "reason": "r", "confidence": "super-high"}
    ]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert result["product_analysis"]["opportunities"][0]["confidence"] == "medium"


def test_invalid_recommendation_defaults_to_need_more_data():
    payload = dict(_VALID_PAYLOAD)
    payload["selection_verdict"] = {
        "product": "x",
        "recommendation": "definitely-a-hit",
        "reason": "r",
        "confidence": "high",
    }

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert result["product_analysis"]["selection_verdict"]["recommendation"] == (
        "need_more_data"
    )


def test_recommendation_accepts_all_four_states():
    for value in ("test", "hold", "reject", "need_more_data"):
        payload = dict(_VALID_PAYLOAD)
        payload["selection_verdict"] = {
            "product": "x",
            "recommendation": value,
            "reason": "r",
            "confidence": "high",
        }

        result = parse_product_response(json.dumps(payload, ensure_ascii=False))

        assert (
            result["product_analysis"]["selection_verdict"]["recommendation"]
            == value
        )


def test_invalid_verdict_confidence_defaults_to_low():
    payload = dict(_VALID_PAYLOAD)
    payload["selection_verdict"] = {
        "product": "x",
        "recommendation": "test",
        "reason": "r",
        "confidence": "super-sure",
    }

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert result["product_analysis"]["selection_verdict"]["confidence"] == "low"


def test_invalid_checklist_status_defaults_to_missing():
    payload = dict(_VALID_PAYLOAD)
    payload["listing_checklist"] = [
        {"item": "标题图", "status": "already-live", "note": ""}
    ]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert result["product_analysis"]["listing_checklist"][0]["status"] == "missing"


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

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    assert "unexpected_field" not in result["product_analysis"]
    assert "extra_model_field" not in result["product_analysis"]["opportunities"][0]


def test_malicious_text_content_never_executed():
    """
    不使用 eval：即使模型输出看起来像可执行代码，也只会被当作
    纯文本安全降级展示，不会被解析执行。
    """

    malicious_content = "__import__('os').system('echo pwned')"

    result = parse_product_response(malicious_content)

    assert result["format"] == "text"
    assert result["product_analysis"]["text"] == malicious_content


def test_opportunity_missing_title_or_reason_is_dropped():
    payload = dict(_VALID_PAYLOAD)
    payload["opportunities"] = [
        {"title": "", "reason": "r", "confidence": "high"},
        {"reason": "r2", "confidence": "high"},
        {"title": "ok", "reason": "ok-reason", "confidence": "high"},
    ]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    opportunities = result["product_analysis"]["opportunities"]
    assert len(opportunities) == 1
    assert opportunities[0]["title"] == "ok"


def test_assortment_plan_defaults_when_missing_or_malformed():
    payload = dict(_VALID_PAYLOAD)
    payload["assortment_plan"] = "not a dict"

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    plan = result["product_analysis"]["assortment_plan"]
    assert plan["traffic_items"] == []
    assert plan["profit_items"] == []
    assert plan["filler_items"] == []


def test_selection_verdict_defaults_when_missing_or_malformed():
    payload = dict(_VALID_PAYLOAD)
    payload["selection_verdict"] = "not a dict"

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    verdict = result["product_analysis"]["selection_verdict"]
    assert verdict["product"] == ""
    assert verdict["recommendation"] == "need_more_data"
    assert verdict["reason"] == ""
    assert verdict["confidence"] == "low"


def test_minimum_viable_test_defaults_when_missing_or_malformed():
    payload = dict(_VALID_PAYLOAD)
    payload["minimum_viable_test"] = "not a dict"

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    mvt = result["product_analysis"]["minimum_viable_test"]
    assert mvt == {
        "what_to_test": "",
        "quantity": "",
        "channel": "",
        "duration": "",
        "required_materials": [],
        "success_signal": "",
        "stop_condition": "",
        "follow_up_data": [],
    }


def test_checklist_item_missing_item_text_is_dropped():
    payload = dict(_VALID_PAYLOAD)
    payload["listing_checklist"] = [
        {"item": "", "status": "ready", "note": ""},
        {"status": "ready", "note": ""},
        {"item": "主图", "status": "ready", "note": ""},
    ]

    result = parse_product_response(json.dumps(payload, ensure_ascii=False))

    checklist = result["product_analysis"]["listing_checklist"]
    assert len(checklist) == 1
    assert checklist[0]["item"] == "主图"
