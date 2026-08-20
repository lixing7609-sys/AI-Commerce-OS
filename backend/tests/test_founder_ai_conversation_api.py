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
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
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
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
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


def test_founder_gate_proposal_api_ensures_and_reviews_canonical_object(monkeypatch):
    calls = []
    monkeypatch.setattr(api, "resolve_conversation_id", lambda cid: cid)
    monkeypatch.setattr(api.brain_runtime, "ensure_founder_gate_proposal", lambda cid: calls.append(("ensure", cid)))
    monkeypatch.setattr(api.brain_runtime, "review_founder_gate_proposal", lambda cid, pid, action: calls.append(("review", cid, pid, action)))
    monkeypatch.setattr(api.council_service, "snapshot", lambda cid: {"conversation": {"id": cid}})
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    assert api.ensure_founder_gate_proposal("conv-1")["conversation"]["id"] == "conv-1"
    assert api.review_founder_gate_proposal("conv-1", "proposal-1", api.BrainReviewIn(action="approve"))["conversation"]["id"] == "conv-1"
    assert calls == [("ensure", "conv-1"), ("review", "conv-1", "proposal-1", "approve")]


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


def test_discuss_route_accepts_and_forwards_constitution_interaction_context(monkeypatch):
    from app.founder_ai import conversation_core
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    captured = {}
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"discovery": {}})
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda cid, content, interaction_context=None: captured.update({"conversation_id": cid, "content": content, "interaction_context": interaction_context}) or {"semantic_intent": "conversation", "conversation_state": "discussion", "response": "updated", "task_candidate": None, "founder_action_intent": None, "context": {"conversation_history": []}})
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *args: None)
    monkeypatch.setattr(api.secretary, "append_message", lambda *args, **kwargs: {"conversation": {"id": args[0]}})
    monkeypatch.setattr(api.secretary, "persist_founder_message", lambda *args, **kwargs: "message-test")
    monkeypatch.setattr(api.secretary, "completed_client_exchange", lambda *args, **kwargs: None)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    request = api.DiscussionMessageIn(content="基于新证据重新判断", interaction_context={"active_surface": "constitution_review", "selected_constitution_work_item_id": "work-1"})
    result = api.discuss_with_sino("conv-1", request)
    assert result["conversation"]["id"] == "conv-1"
    assert captured["interaction_context"] == {"active_surface": "constitution_review", "selected_constitution_work_item_id": "work-1"}


def test_clear_quick_fix_message_stays_in_conversation_until_explicit_execution(monkeypatch):
    from app.founder_ai import quick_fix_execution
    from app.founder_ai import conversation_task_interaction
    from app.founder_ai import conversation_core

    dispatched = []
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"discovery": {}})
    monkeypatch.setattr(conversation_task_interaction, "persist_task_understanding", lambda *args, **kwargs: None)
    monkeypatch.setattr(conversation_task_interaction, "pending_task_understanding", lambda cid: None)
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *args, **kwargs: {
        "semantic_intent": "conversation", "conversation_state": "discussion", "response": "自然讨论回复",
        "task_candidate": {"goal": "修一下左边栏按钮点不了的问题", "task_type": "QUICK_FIX"},
        "founder_action_intent": None, "context": {"conversation_history": []}})
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *args: None)
    monkeypatch.setattr(quick_fix_execution, "dispatch_quick_fix", lambda **kwargs: dispatched.append(kwargs) or {})
    monkeypatch.setattr(api.secretary, "append_message", lambda *args, **kwargs: {"conversation": {"id": args[0]}})
    monkeypatch.setattr(api.secretary, "persist_founder_message", lambda *args, **kwargs: "message-test")
    monkeypatch.setattr(api.secretary, "completed_client_exchange", lambda *args, **kwargs: None)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)

    result = api.discuss_with_sino("functional-verification-v1-a", api.DiscussionMessageIn(content="修一下左边栏按钮点不了的问题"))

    assert result["conversation"]["id"] == "functional-verification-v1-a"
    assert dispatched == []


def test_explicit_execution_intent_dispatches_the_previously_discussed_quick_fix(monkeypatch):
    from app.founder_ai import quick_fix_execution, conversation_task_interaction
    from app.founder_ai import conversation_core
    dispatched = []
    route = {"classification": "QUICK_FIX", "clarification_required": False, "founder_gate_required": False}
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"discovery": {}})
    monkeypatch.setattr(conversation_task_interaction, "pending_task_understanding", lambda cid: {"goal": "修一下左边栏按钮点不了的问题", "route": route})
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *args, **kwargs: {
        "semantic_intent": "execute_current_task", "conversation_state": "task_ready", "response": "开始处理。",
        "task_candidate": {"goal": "修一下左边栏按钮点不了的问题", "task_type": "QUICK_FIX"},
        "founder_action_intent": None, "context": {"conversation_history": [{"content": "修一下左边栏按钮点不了的问题"}]}})
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *args: None)
    monkeypatch.setattr(quick_fix_execution, "dispatch_quick_fix", lambda **kwargs: dispatched.append(kwargs) or {})
    monkeypatch.setattr(api.secretary, "append_message", lambda *args, **kwargs: {"conversation": {"id": args[0]}})
    monkeypatch.setattr(api.secretary, "persist_founder_message", lambda *args, **kwargs: "message-test")
    monkeypatch.setattr(api.secretary, "completed_client_exchange", lambda *args, **kwargs: None)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    result = api.discuss_with_sino("functional-verification-v1-a", api.DiscussionMessageIn(content="可以了，执行吧。"))
    assert result["conversation"]["id"] == "functional-verification-v1-a"
    assert dispatched == [{"conversation_id": "functional-verification-v1-a", "goal": "修一下左边栏按钮点不了的问题"}]


def test_strategic_topic_remains_conversation_until_founder_explicitly_executes(monkeypatch):
    from app.founder_ai import conversation_task_interaction, strategic_task, task_complexity_router
    from app.founder_ai import conversation_core

    reconciled = []
    route = {"classification": "STRATEGIC_TASK", "task_type": "ARCHITECTURE_TASK", "clarification_required": False}
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"active_workspace_stage": "discussion", "discovery": {}})
    monkeypatch.setattr(task_complexity_router, "route_task_complexity", lambda *args, **kwargs: route)
    monkeypatch.setattr(conversation_task_interaction, "persist_task_understanding", lambda *args, **kwargs: None)
    monkeypatch.setattr(conversation_task_interaction, "pending_task_understanding", lambda cid: {"goal": "重新设计 Founder 与 Studio 的职责边界", "route": route})
    monkeypatch.setattr(strategic_task, "reconcile_architecture_task", lambda **kwargs: reconciled.append(kwargs) or route)
    monkeypatch.setattr(api.secretary, "append_message", lambda *args, **kwargs: {"conversation": {"id": args[0]}, "reply": kwargs.get("reply_override")})
    monkeypatch.setattr(api.secretary, "persist_founder_message", lambda *args, **kwargs: "message-test")
    monkeypatch.setattr(api.secretary, "completed_client_exchange", lambda *args, **kwargs: None)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)

    decisions = iter([
        {"semantic_intent": "conversation", "conversation_state": "discussion", "response": "可以继续分析这个架构议题。", "task_candidate": {"goal": "重新设计 Founder 与 Studio 的职责边界", "task_type": "STRATEGIC_TASK"}, "founder_action_intent": None, "context": {"conversation_history": []}},
        {"semantic_intent": "execute_current_task", "conversation_state": "task_ready", "response": "我会按已形成的方案推进。", "task_candidate": {"goal": "重新设计 Founder 与 Studio 的职责边界", "task_type": "STRATEGIC_TASK"}, "founder_action_intent": None, "context": {"conversation_history": [{"content": "重新设计 Founder 与 Studio 的职责边界"}]}},
    ])
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *args, **kwargs: next(decisions))
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *args: None)

    result = api.discuss_with_sino("conv-strategy", api.DiscussionMessageIn(content="重新设计 Founder 与 Studio 的职责边界"))

    assert reconciled == []
    assert result["reply"] == "可以继续分析这个架构议题。"

    api.discuss_with_sino("conv-strategy", api.DiscussionMessageIn(content="可以了，执行吧。"))
    assert reconciled == [{"conversation_id": "conv-strategy", "goal": "重新设计 Founder 与 Studio 的职责边界"}]


def test_plain_positive_acknowledgement_never_dispatches(monkeypatch):
    from app.founder_ai.conversation_task_interaction import has_explicit_execution_intent

    for value in ["这个思路不错", "我理解了", "这个方向可以", "我再想想", "先这样", "继续聊", "为什么"]:
        assert has_explicit_execution_intent(value) is False
