from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.founder_ai import api
from app.core.conversation import service as conversation_service
from app.core.founder_intent import service as intent_service
from app.core.founder_object import service as object_service
from core.founder_intent.model import ConversationCandidateContextDB
from core.founder_object.model import ConversationObjectContextDB


PROJECTS_COUNT_GOAL = """请在左侧栏“项目”标题旁显示当前可见的项目数量。

搜索筛选项目时，数量要同步变化；清除搜索后恢复完整数量。

请保留现有项目排序、打开项目、新建项目和项目操作方式。"""


def _conversation_entry_runtime(monkeypatch, tmp_path, *, conversation_id, candidate):
    """Use real Candidate/Task/approval/start orchestration and mock only execution work."""
    from app.database.base import Base
    from app.core.conversation.model import ConversationDB
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    from app.core.task_asset.model import TaskAssetDB
    import app.core.conversation.service as core_conversation_service
    import app.core.task_asset.service as task_service
    import app.founder_ai.brain_runtime as brain_module
    import app.founder_ai.attachments as attachments
    import app.founder_ai.conversation_core as conversation_core
    import app.founder_ai.conversation_task_interaction as interaction
    import app.founder_ai.execution_registry as registry
    import app.founder_ai.reuse_retrieval as reuse_retrieval
    import app.founder_ai.secretary.service as secretary_service
    import app.founder_ai.standard_task_execution as execution

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    for module in (
        core_conversation_service, task_service, brain_module, attachments, conversation_core,
        interaction, reuse_retrieval, secretary_service, execution,
    ):
        monkeypatch.setattr(module, "SessionLocal", factory)
    with factory() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Canonical E2E"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={}))
        db.commit()

    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(tmp_path / f"{conversation_id}-registry.json"))
    registry._sessions.clear()
    registry._packages.clear()
    monkeypatch.setattr(registry, "resolve_execution_capability", lambda: {"execution_engine_id": "mock-business-executor"})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)

    def snapshot(cid):
        with factory() as db:
            state = db.query(SinoBrainSessionDB).filter_by(conversation_id=cid).one()
            return {"conversation_id": cid, "stage": state.stage, "discovery": dict(state.discovery or {})}
    monkeypatch.setattr(api.brain_runtime, "snapshot", snapshot)
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *_args, **_kwargs: {
        "semantic_intent": "execute_current_task", "conversation_state": "task_ready",
        "response": "已接受任务并开始处理。", "task_candidate": dict(candidate),
        "founder_action_intent": None, "context": {"conversation_history": []},
    })
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *_args: None)
    monkeypatch.setattr(secretary_service, "bind_attachments", lambda *_args, **_kwargs: None)

    counters = {"persist_candidate": 0, "bind_authority": 0, "begin_task": 0,
                "enqueue": 0, "executor": 0, "completion_projection": 0}
    queued = []

    real_persist = interaction.persist_task_candidate
    real_bind = execution.bind_persisted_candidate_authority
    real_begin = execution.begin_standard_task
    def persist_spy(*args, **kwargs):
        counters["persist_candidate"] += 1
        return real_persist(*args, **kwargs)
    def bind_spy(*args, **kwargs):
        counters["bind_authority"] += 1
        return real_bind(*args, **kwargs)
    def begin_spy(*args, **kwargs):
        counters["begin_task"] += 1
        return real_begin(*args, **kwargs)
    monkeypatch.setattr(interaction, "persist_task_candidate", persist_spy)
    monkeypatch.setattr(execution, "bind_persisted_candidate_authority", bind_spy)
    monkeypatch.setattr(execution, "begin_standard_task", begin_spy)

    def enqueue(execution_id):
        counters["enqueue"] += 1
        queued.append(execution_id)

    def execute_business_work(execution_id):
        from app.founder_ai.execution_events import append_event
        record = registry.get_execution_session(execution_id)
        assert record is not None
        session, package = record
        counters["executor"] += 1
        session.status = "completed"
        session.result = {"status": "completed", "mock_business_executor": True}
        append_event(session, "completed", status="completed", message="mock execution completed")
        registry.save_execution_session(session, package)
        with factory() as db:
            task = db.get(TaskAssetDB, session.task_asset_id)
            task.status = "completed"
            task.execution_status = "completed"
            db.commit()
        execution._project(
            conversation_id, step="complete",
            execution={"task_id": session.task_asset_id, "execution_session_id": execution_id,
                       "dispatch_status": "completed", "verification": {"status": "PASS"}},
        )
        counters["completion_projection"] += interaction.project_execution_events(conversation_id)

    class SynchronousExecutorThread:
        def __init__(self, *, args=(), **_kwargs):
            self.execution_id = args[2]
        def start(self):
            execute_business_work(self.execution_id)

    monkeypatch.setattr(execution, "Thread", SynchronousExecutorThread)
    monkeypatch.setitem(execution.dispatch_standard_task.__kwdefaults__, "enqueue", enqueue)
    monkeypatch.setitem(execution.decide_and_resume_standard_task.__kwdefaults__, "enqueue", enqueue)
    return SimpleNamespace(
        factory=factory, execution=execution, interaction=interaction, registry=registry,
        task_model=TaskAssetDB, message_model=ConversationMessageDB,
        counters=counters, queued=queued,
    )


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
    assert captured["interaction_context"] == {"active_surface": "constitution_review", "selected_constitution_work_item_id": "work-1", "source_message_id": "message-test"}


def test_clear_quick_fix_message_stays_in_conversation_until_explicit_execution(monkeypatch):
    from app.founder_ai import quick_fix_execution
    from app.founder_ai import conversation_task_interaction
    from app.founder_ai import conversation_core

    dispatched = []
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"discovery": {}})
    monkeypatch.setattr(conversation_task_interaction, "route_conversation_message", lambda *_args, **_kwargs: {
        "intent": "DISCUSSION", "control_command": False, "active_execution": False,
        "candidate": None, "route": {}, "task_id": None, "execution_id": None, "execution_status": None})
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


def test_clear_low_risk_task_request_autonomously_dispatches_on_first_message(monkeypatch):
    from app.founder_ai import conversation_core, conversation_task_interaction, standard_task_execution
    from app.founder_ai import task_complexity_router
    candidate = {
        "title": "Projects Heading Count", "goal": "请在左侧栏项目标题旁显示当前可见的项目数量",
        "task_type": "STANDARD_TASK", "scope": ["FounderNavigationPanel"],
        "constraints": ["保留现有项目行为"], "acceptance_criteria": ["数量随筛选同步"],
        "confirmed_decisions": [],
    }
    canonical = standard_task_execution.build_pre_dispatch_decision(
        conversation_id="conv-auto", goal=candidate["goal"],
        founder_constraints=candidate["constraints"],
        founder_acceptance_criteria=candidate["acceptance_criteria"],
        risk="low", approval_required=False, clarification_required=False,
    )
    authority = standard_task_execution.candidate_authority_snapshot(
        decision=canonical, conversation_id="conv-auto", source_message_id="message-1",
        candidate_id="candidate-1",
    )
    persisted = {**candidate, "candidate_id": "candidate-1", "status": "ready_to_execute",
                 "canonical_pre_dispatch_decision": canonical, "candidate_authority": authority}
    dispatched, begun, confirmation_flags = [], [], []
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"discovery": {}})
    monkeypatch.setattr(conversation_task_interaction, "route_conversation_message", lambda *_args, **_kwargs: {
        "intent": "DISCUSSION", "control_command": False, "active_execution": False,
        "candidate": None, "route": {}, "task_id": None, "execution_id": None, "execution_status": None})
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *args, **kwargs: {
        "semantic_intent": "execute_current_task", "conversation_state": "task_ready", "response": "开始处理。",
        "task_candidate": candidate, "founder_action_intent": None, "context": {"conversation_history": []}})
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *args: None)
    monkeypatch.setattr(conversation_task_interaction, "persist_task_candidate",
                        lambda *args, **kwargs: confirmation_flags.append(kwargs["confirmation_required"]) or persisted)
    monkeypatch.setattr(task_complexity_router, "route_task_complexity", lambda *_args, **_kwargs: {
        "classification": "STANDARD_TASK", "clarification_required": False, "founder_gate_required": False})
    monkeypatch.setattr(standard_task_execution, "begin_standard_task",
                        lambda **kwargs: begun.append(kwargs) or kwargs["route"])
    monkeypatch.setattr(standard_task_execution, "dispatch_standard_task", lambda **kwargs: dispatched.append(kwargs) or {
        "classification": "STANDARD_TASK", "execution_status": "queued",
        "autonomous_execution": {"task_id": "task-1", "execution_session_id": "execution-1"}})
    monkeypatch.setattr(conversation_task_interaction, "bind_task_candidate_execution", lambda *_args: None)
    monkeypatch.setattr(api.secretary, "append_message", lambda *args, **kwargs: {"conversation": {"id": args[0]}})
    monkeypatch.setattr(api.secretary, "persist_founder_message", lambda *args, **kwargs: "message-1")
    monkeypatch.setattr(api.secretary, "completed_client_exchange", lambda *args, **kwargs: None)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    result = api.discuss_with_sino("conv-auto", api.DiscussionMessageIn(content=candidate["goal"]))
    assert result["conversation"]["id"] == "conv-auto"
    assert confirmation_flags == [False]
    assert begun[0]["route"]["candidate_authority"] == authority
    assert begun[0]["route"]["canonical_pre_dispatch_decision"] == canonical
    assert begun[0]["route"]["founder_constraints"] == candidate["constraints"]
    assert begun[0]["route"]["founder_acceptance_criteria"] == candidate["acceptance_criteria"]
    assert dispatched == [{"conversation_id": "conv-auto", "goal": candidate["goal"],
                           "source_message_id": "message-1"}]


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
    assert dispatched == [{"conversation_id": "functional-verification-v1-a", "goal": "修一下左边栏按钮点不了的问题", "source_message_id": "message-test"}]


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


def _execution_control_api_mocks(monkeypatch, discovery):
    from app.founder_ai import conversation_core
    monkeypatch.setattr(api, "ensure_conversation_runtime_state", lambda cid: {"conversation_id": cid})
    monkeypatch.setattr(api, "resolve_conversation_id", lambda value: value)
    monkeypatch.setattr(api.brain_runtime, "snapshot", lambda cid: {"active_workspace_stage": "discussion", "discovery": discovery})
    monkeypatch.setattr(conversation_core, "build_conversation_context", lambda *args, **kwargs: {"conversation_history": []})
    monkeypatch.setattr(conversation_core, "persist_conversation_decision", lambda *args: None)
    monkeypatch.setattr(api.secretary, "persist_founder_message", lambda *args, **kwargs: "message-control")
    monkeypatch.setattr(api.secretary, "completed_client_exchange", lambda *args, **kwargs: None)
    monkeypatch.setattr(api.brain_runtime, "sync_message_refs", lambda _cid: None)
    monkeypatch.setattr(api, "_candidate_snapshot", lambda snapshot, _cid: snapshot)
    captured = {}
    monkeypatch.setattr(api.secretary, "append_message", lambda *args, **kwargs: captured.update(kwargs) or {
        "conversation": {"id": args[0]}, "reply": kwargs.get("reply_override")})
    return conversation_core, captured


def test_exact_execute_dispatches_persisted_candidate_without_llm_reinterpretation(monkeypatch):
    from app.founder_ai import standard_task_execution, task_complexity_router
    candidate = {"title": "删除标题栏", "goal": "删除产品矩阵标题栏", "scope": ["Sidebar"],
                 "constraints": ["保留产品列表"], "acceptance_criteria": ["标题栏消失"],
                 "confirmed_decisions": [], "task_type": "STANDARD_TASK"}
    conversation_core, captured = _execution_control_api_mocks(monkeypatch, {"task_candidate": candidate})
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("execution control must bypass the LLM")))
    route = {"classification": "STANDARD_TASK", "clarification_required": False, "founder_gate_required": False}
    monkeypatch.setattr(task_complexity_router, "route_task_complexity", lambda *_args, **_kwargs: dict(route))
    monkeypatch.setattr(standard_task_execution, "begin_standard_task", lambda **kwargs: dict(route))
    calls = []
    monkeypatch.setattr(standard_task_execution, "dispatch_standard_task", lambda **kwargs: calls.append(kwargs) or {
        **route, "execution_status": "queued",
        "autonomous_execution": {"task_id": "task-1", "execution_session_id": "execution-1", "dispatch_status": "queued"},
    })
    result = api.discuss_with_sino("conv-control", api.DiscussionMessageIn(content="立即执行。"))
    assert calls == [{"conversation_id": "conv-control", "goal": "删除产品矩阵标题栏", "source_message_id": "message-control"}]
    assert result["reply"] == "任务已进入队列。"
    assert captured["message_type"] == "task_started"


def test_execute_without_current_task_never_claims_execution(monkeypatch):
    conversation_core, captured = _execution_control_api_mocks(monkeypatch, {})
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("empty execution control must bypass the LLM")))
    result = api.discuss_with_sino("conv-empty-control", api.DiscussionMessageIn(content="执行"))
    assert result["reply"] == "当前没有待执行任务。你希望我执行哪一项？"
    assert captured["message_type"] == "discussion"


def test_repeated_execute_reuses_active_execution_and_runtime_narration(monkeypatch):
    discovery = {"task_candidate": {"goal": "删除产品矩阵标题栏"}, "task_complexity_route": {
        "classification": "STANDARD_TASK", "execution_status": "executing",
        "autonomous_execution": {"task_id": "task-1", "execution_session_id": "execution-1", "dispatch_status": "executing"},
    }}
    conversation_core, captured = _execution_control_api_mocks(monkeypatch, discovery)
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("active execution control must bypass the LLM")))
    result = api.discuss_with_sino("conv-active-control", api.DiscussionMessageIn(content="执行"))
    assert result["reply"] == "已开始执行。"
    assert captured["message_type"] == "execution_update"


def test_conversation_entry_low_risk_preserves_canonical_authority_end_to_end(monkeypatch, tmp_path):
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    candidate = {
        "title": "Projects Heading Count", "goal": PROJECTS_COUNT_GOAL,
        "task_type": "STANDARD_TASK", "scope": ["Founder Conversation"],
        "constraints": ["保留现有项目排序", "保留打开项目方式", "保留新建项目方式"],
        "acceptance_criteria": ["搜索时数量同步变化", "清除搜索后恢复完整数量"],
        "confirmed_decisions": [], "risk": "low", "approval_required": False,
        "clarification_required": False,
    }
    runtime = _conversation_entry_runtime(monkeypatch, tmp_path, conversation_id="conv-entry-low", candidate=candidate)
    request = api.DiscussionMessageIn(content=PROJECTS_COUNT_GOAL, client_message_id="client-entry-low")
    result = api.discuss_with_sino("conv-entry-low", request)
    assert result["conversation"]["id"] == "conv-entry-low"
    with runtime.factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-entry-low").one()
        discovery = dict(state.discovery or {})
        candidates = discovery["task_candidates"]
        tasks = db.query(runtime.task_model).filter_by(conversation_id="conv-entry-low").all()
        completions = db.query(ConversationMessageDB).filter_by(
            conversation_id="conv-entry-low", message_type="execution_update").all()
    assert len(candidates) == len(tasks) == 1
    authority = tasks[0].scope["candidate_authority"]
    execution_id = discovery["task_complexity_route"]["autonomous_execution"]["execution_session_id"]
    session, _package = runtime.registry.get_execution_session(execution_id)
    fingerprint = candidates[0]["candidate_authority"]["canonical_fingerprint"]
    assert authority["canonical_fingerprint"] == session.scope_fingerprint == fingerprint
    assert set(candidate["constraints"]).issubset(authority["founder_constraints"])
    assert set(candidate["acceptance_criteria"]).issubset(authority["founder_acceptance_criteria"])
    assert not [item for item in discovery.get("founder_action_queue") or [] if item.get("type") == "TASK_CONFIRMATION"]
    assert runtime.counters == {"persist_candidate": 1, "bind_authority": 1, "begin_task": 1,
                                "enqueue": 1, "executor": 1, "completion_projection": 1}
    assert len(completions) == 1
    api.discuss_with_sino("conv-entry-low", request)
    with runtime.factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-entry-low").one()
        assert len(state.discovery["task_candidates"]) == 1
        assert db.query(runtime.task_model).filter_by(conversation_id="conv-entry-low").count() == 1
    assert len(runtime.registry.list_execution_sessions()) == 1
    assert runtime.counters == {"persist_candidate": 1, "bind_authority": 1, "begin_task": 1,
                                "enqueue": 1, "executor": 1, "completion_projection": 1}


def test_conversation_entry_high_risk_approval_and_reject_use_same_authority(monkeypatch, tmp_path):
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    candidate = {
        "title": "High-risk Projects Change", "goal": PROJECTS_COUNT_GOAL,
        "task_type": "STANDARD_TASK", "scope": ["Founder Conversation"],
        "constraints": ["保留现有项目排序", "保留打开项目方式"],
        "acceptance_criteria": ["搜索时数量同步变化"], "confirmed_decisions": [],
        "risk": "high", "approval_required": True, "clarification_required": False,
    }
    runtime = _conversation_entry_runtime(monkeypatch, tmp_path, conversation_id="conv-entry-high", candidate=candidate)
    api.discuss_with_sino("conv-entry-high", api.DiscussionMessageIn(content=PROJECTS_COUNT_GOAL))
    with runtime.factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-entry-high").one()
        discovery = dict(state.discovery or {})
        persisted = discovery["task_candidates"][0]
        task = db.query(runtime.task_model).filter_by(conversation_id="conv-entry-high").one()
        actions = [item for item in discovery["founder_action_queue"] if item["type"] == "EXECUTION_APPROVAL"]
    authority = task.scope["candidate_authority"]
    assert len(actions) == 1 and authority["risk"] == "high" and authority["approval_required"] is True
    assert runtime.counters == {"persist_candidate": 1, "bind_authority": 1, "begin_task": 1,
                                "enqueue": 0, "executor": 0, "completion_projection": 0}
    assert runtime.registry.list_execution_sessions() == []
    fingerprint = persisted["candidate_authority"]["canonical_fingerprint"]
    approved = api.decide_conversation_execution_approval("conv-entry-high", api.TaskExecutionApprovalDecisionIn(
        task_id=task.id, candidate_id=persisted["candidate_id"], canonical_fingerprint=fingerprint,
        decision="approved"))
    assert approved["resumed"] is True
    assert runtime.counters == {"persist_candidate": 1, "bind_authority": 1, "begin_task": 1,
                                "enqueue": 1, "executor": 1, "completion_projection": 1}
    sessions = runtime.registry.list_execution_sessions()
    assert len(sessions) == 1 and sessions[0].scope_fingerprint == fingerprint
    api.decide_conversation_execution_approval("conv-entry-high", api.TaskExecutionApprovalDecisionIn(
        task_id=task.id, candidate_id=persisted["candidate_id"], canonical_fingerprint=fingerprint,
        decision="approved"))
    assert runtime.counters == {"persist_candidate": 1, "bind_authority": 1, "begin_task": 1,
                                "enqueue": 1, "executor": 1, "completion_projection": 1}
    assert len(runtime.registry.list_execution_sessions()) == 1

    reject_runtime = _conversation_entry_runtime(monkeypatch, tmp_path, conversation_id="conv-entry-reject", candidate=candidate)
    api.discuss_with_sino("conv-entry-reject", api.DiscussionMessageIn(content=PROJECTS_COUNT_GOAL))
    with reject_runtime.factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-entry-reject").one()
        persisted = state.discovery["task_candidates"][0]
        task = db.query(reject_runtime.task_model).filter_by(conversation_id="conv-entry-reject").one()
    rejected = api.decide_conversation_execution_approval("conv-entry-reject", api.TaskExecutionApprovalDecisionIn(
        task_id=task.id, candidate_id=persisted["candidate_id"],
        canonical_fingerprint=persisted["candidate_authority"]["canonical_fingerprint"], decision="rejected"))
    assert rejected["resumed"] is False
    assert reject_runtime.counters == {"persist_candidate": 1, "bind_authority": 1, "begin_task": 1,
                                       "enqueue": 0, "executor": 0, "completion_projection": 0}
    assert reject_runtime.registry.list_execution_sessions() == []
    with reject_runtime.factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(
            conversation_id="conv-entry-reject", message_type="execution_update").all()
        assert len(messages) == 1 and "任务未执行" in messages[0].content


def test_conversation_entry_discussion_and_clarification_controls(monkeypatch, tmp_path):
    from app.core.conversation_first.model import SinoBrainSessionDB
    import app.founder_ai.conversation_core as conversation_core
    base = {
        "title": "Projects Heading Count", "goal": PROJECTS_COUNT_GOAL,
        "task_type": "STANDARD_TASK", "scope": ["Founder Conversation"],
        "constraints": ["保留现有项目排序"],
        "acceptance_criteria": ["搜索时数量同步变化"], "confirmed_decisions": [],
        "risk": "low", "approval_required": False, "clarification_required": False,
    }
    discussion = _conversation_entry_runtime(
        monkeypatch, tmp_path, conversation_id="conv-entry-discussion", candidate=base)
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *_args, **_kwargs: {
        "semantic_intent": "conversation", "conversation_state": "discussion",
        "response": "可以继续讨论。", "task_candidate": dict(base),
        "founder_action_intent": None, "context": {"conversation_history": []},
    })
    api.discuss_with_sino("conv-entry-discussion", api.DiscussionMessageIn(
        content="项目数量是不是显示在标题旁边比较好？"))
    assert discussion.counters["begin_task"] == discussion.counters["enqueue"] == discussion.counters["executor"] == 0
    assert discussion.registry.list_execution_sessions() == []
    with discussion.factory() as db:
        assert db.query(discussion.task_model).filter_by(conversation_id="conv-entry-discussion").count() == 0

    clarification_candidate = {**base, "clarification_required": True,
                               "acceptance_criteria": ["Founder需明确搜索范围"]}
    clarification = _conversation_entry_runtime(
        monkeypatch, tmp_path, conversation_id="conv-entry-clarification", candidate=clarification_candidate)
    answers = iter([
        {"semantic_intent": "execute_current_task", "conversation_state": "clarification_required",
         "response": "请明确搜索范围。", "task_candidate": clarification_candidate,
         "founder_action_intent": {"type": "CLARIFICATION"}, "context": {"conversation_history": []}},
        {"semantic_intent": "execute_current_task", "conversation_state": "task_ready",
         "response": "范围已明确，继续执行。", "task_candidate": base,
         "founder_action_intent": None, "context": {"conversation_history": []}},
    ])
    monkeypatch.setattr(conversation_core, "reason_about_message", lambda *_args, **_kwargs: next(answers))
    api.discuss_with_sino("conv-entry-clarification", api.DiscussionMessageIn(content="请显示项目数量，但范围稍后确认"))
    assert clarification.counters["enqueue"] == clarification.counters["executor"] == 0
    assert clarification.registry.list_execution_sessions() == []
    api.discuss_with_sino("conv-entry-clarification", api.DiscussionMessageIn(content="只统计当前搜索筛选后可见项目"))
    assert clarification.counters["persist_candidate"] == 2
    assert clarification.counters["bind_authority"] == 2
    assert clarification.counters["begin_task"] == 1
    assert clarification.counters["enqueue"] == clarification.counters["executor"] == 1
    with clarification.factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-entry-clarification").one()
        task = db.query(clarification.task_model).filter_by(conversation_id="conv-entry-clarification").one()
        assert task.scope["candidate_authority"]["canonical_fingerprint"] == state.discovery["task_candidate"]["candidate_authority"]["canonical_fingerprint"]
