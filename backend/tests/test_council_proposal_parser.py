import pytest

from app.founder_ai.council_proposal_parser import ProposalParseError, parse_council_proposal


def test_parses_markdown_wrapped_json_and_normalizes_shapes():
    parsed = parse_council_proposal('''说明如下：
```json
{"core_judgment":"先建核心闭环","key_reasons":"先验证价值","recommendation":{"text":"分阶段实施"},"risks":{"content":"范围过大"},"objections":null,"founder_next_step":true}
```
以上。''')
    assert parsed.proposal == {
        "core_judgment": "先建核心闭环",
        "key_reasons": ["先验证价值"],
        "recommendation": "分阶段实施",
        "risks": ["范围过大"],
        "objections": [],
        "founder_next_step": "True",
    }
    assert parsed.metadata["markdown_wrapped"] is True


def test_extracts_embedded_json_and_repairs_trailing_commas():
    parsed = parse_council_proposal('前置说明 {"core_judgment":"判断","key_reasons":["理由",],"risks":[],} 尾部说明')
    assert parsed.proposal["core_judgment"] == "判断"
    assert parsed.proposal["key_reasons"] == ["理由"]
    assert parsed.metadata["parse_mode"] == "json_repaired"
    assert parsed.metadata["embedded_json"] is True


def test_recovers_complete_fields_from_truncated_json():
    parsed = parse_council_proposal('{"core_judgment":"有效判断","key_reasons":["理由一","理由二"],"recommendation":"未完成')
    assert parsed.proposal["core_judgment"] == "有效判断"
    assert parsed.proposal["key_reasons"] == ["理由一", "理由二"]
    assert parsed.metadata["truncated"] is True


def test_plain_text_becomes_recoverable_proposal():
    parsed = parse_council_proposal("建议先建设商品、订单与客户核心闭环。")
    assert parsed.proposal["core_judgment"] == "建议先建设商品、订单与客户核心闭环。"
    assert parsed.metadata["parse_mode"] == "text_fallback"


@pytest.mark.parametrize("value", [None, "", "{broken"])
def test_unrecoverable_content_has_dedicated_parse_error(value):
    with pytest.raises(ProposalParseError) as error:
        parse_council_proposal(value)
    assert error.value.error_type == "proposal_parse_failed"
