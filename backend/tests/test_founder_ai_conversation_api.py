from types import SimpleNamespace
from fastapi import HTTPException

from app.founder_ai import api
from app.core.conversation import service as conversation_service
from app.core.founder_intent import service as intent_service
from app.core.founder_object import service as object_service
from core.founder_intent.model import ConversationCandidateContextDB
from core.founder_object.model import ConversationObjectContextDB


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


def test_missing_workspace_returns_structured_conversation_not_found(monkeypatch):
    def missing(_conversation_id): raise LookupError("Founder Conversation not found")
    monkeypatch.setattr(api.council_service, "snapshot", missing)
    try:
        api.get_conversation_workspace("missing")
    except HTTPException as error:
        assert error.status_code == 404
        assert error.detail["code"] == "conversation_not_found"
    else:
        raise AssertionError("missing Conversation must return 404")
