from app.founder_ai.conversation_streaming import partial_json_string, publisher_for, register_publisher, unregister_publisher


def test_partial_json_response_is_safe_during_streaming():
    assert partial_json_string('{"response":"第一段\\n第二') == "第一段\n第二"
    assert partial_json_string('{"response":"包含\\\"引号\\\"","semantic_intent":') == '包含"引号"'
    assert partial_json_string('{"semantic_intent":"conversation"') == ""


def test_stream_publisher_is_scoped_to_one_client_message():
    received = []
    register_publisher("round-2", received.append)
    assert publisher_for("round-2") is not None
    assert publisher_for("round-3") is None
    publisher_for("round-2")("reply")
    unregister_publisher("round-2")
    assert received == ["reply"]
    assert publisher_for("round-2") is None
