from types import SimpleNamespace

from app.founder_ai import api


def test_founder_conversation_generates_draft_and_package(monkeypatch):
    monkeypatch.setattr(
        api,
        "get_conversation",
        lambda conversation_id: SimpleNamespace(system_id="founder_ai"),
    )
    monkeypatch.setattr(
        api,
        "get_founder_context",
        lambda conversation_id: SimpleNamespace(
            system_id="founder_ai",
            user_goal="build capability",
            constraints=["review first"],
            decisions_summary="none",
            knowledge_refs=[],
            task_refs=[],
        ),
    )
    result = api.analyze_founder_conversation(
        "conversation-1",
        api.FounderAnalyzeIn(message="开发一个海报设计 Agent"),
    )
    assert result.goal_classification.system_id == "founder_ai"
    assert result.task_asset_draft.conversation_id == "conversation-1"
    assert result.execution_package.execution_allowed is False
    assert result.execution_package.approval_required is True


def test_non_founder_conversation_is_rejected(monkeypatch):
    monkeypatch.setattr(api, "get_conversation", lambda conversation_id: None)
    try:
        api.analyze_founder_conversation(
            "operator-conversation",
            api.FounderAnalyzeIn(message="research"),
        )
    except Exception as error:
        assert getattr(error, "status_code", None) == 404
    else:
        raise AssertionError("non-Founder conversation must be rejected")
