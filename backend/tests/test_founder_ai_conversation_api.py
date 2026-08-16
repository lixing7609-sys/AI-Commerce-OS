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


def test_auto_deliberation_confirmation_starts_real_strategy_path(monkeypatch):
    calls = []
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda _: {"stage": "goal_review"})
    monkeypatch.setattr(api.brain_runtime, "review_intent", lambda _: "confirm_goal")
    monkeypatch.setattr(api.brain_runtime, "confirm_goal", lambda cid: calls.append(("confirm", cid)))
    monkeypatch.setattr(api.brain_runtime, "prepare_strategy_prompt", lambda cid: calls.append(("prepare", cid)) or "confirmed brief")
    monkeypatch.setattr(api.brain_runtime, "finalize_council", lambda cid, snapshot: calls.append(("finalize", cid)))
    monkeypatch.setattr(api.council_service, "run_auto", lambda cid, prompt, models, persist_founder_message: calls.append(("auto", prompt)) or {"ok": True})
    monkeypatch.setattr(api.council_service, "snapshot", lambda cid: {"conversation": {"id": cid}})
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    result = api.discuss_with_auto_deliberation("conversation-1", api.CouncilDiscussionIn(content="正确"))
    assert result["conversation"]["id"] == "conversation-1"
    assert [item[0] for item in calls] == ["confirm", "prepare", "auto", "finalize"]


def test_stage_action_api_advances_and_returns_fresh_workspace(monkeypatch):
    calls = []
    monkeypatch.setattr(api.brain_runtime, "advance_stage", lambda cid, target: calls.append((cid, target)))
    monkeypatch.setattr(api.council_service, "snapshot", lambda cid: {"conversation": {"id": cid}})
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    result = api.advance_brain_stage("conversation-1", api.BrainReviewIn(action="validation"))
    assert calls == [("conversation-1", "validation")]
    assert result["conversation"]["id"] == "conversation-1"


def test_package_approval_api_runs_asset_commit_and_returns_completed_workspace(monkeypatch):
    calls = []
    monkeypatch.setattr(api.brain_runtime, "review_package", lambda cid, action: calls.append((cid, action)))
    monkeypatch.setattr(api.council_service, "snapshot", lambda cid: {"conversation": {"id": cid, "state": "completed"}})
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: {**snapshot, "sino_brain": {"stage": "conversation_completed", "current_action": {"action_id": "assets_committed"}}})
    result = api.review_brain_package("conversation-1", api.BrainReviewIn(action="approve"))
    assert calls == [("conversation-1", "approve")]
    assert result["conversation"]["state"] == "completed"
    assert result["sino_brain"]["current_action"]["action_id"] == "assets_committed"


def test_execution_package_revalidation_api_reuses_resolved_conversation(monkeypatch):
    calls = []
    monkeypatch.setattr(api, "resolve_conversation_id", lambda cid: "canonical-conversation")
    monkeypatch.setattr(api.brain_runtime, "revalidate_execution_package", lambda cid: calls.append(cid))
    monkeypatch.setattr(api.council_service, "snapshot", lambda cid: {"conversation": {"id": cid}, "execution_package": {"package_id": "execution-package-1"}})
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    result = api.revalidate_execution_package("merged-conversation")
    assert calls == ["canonical-conversation"]
    assert result["conversation"]["id"] == "canonical-conversation"
    assert result["execution_package"]["package_id"] == "execution-package-1"
