from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.project.model import FounderProjectDB
from core.conversation_first.model import ConversationMessageDB
from core.founder_object.model import FounderObjectDB
from app.founder_ai import brain_runtime as module


def _result(*, readiness="reviewable", critical=None, non_blocking=None, question=None, confidence=.82):
    return {
        "interpreted_goal": "建立一套先由 Founder 验证、未来供 Studio 使用的 AI 短剧生产能力",
        "founder_intent": "验证可复用的 AI 内容生产能力",
        "known_context": ["Founder 先验证"], "inferred_context": ["未来供 Studio 使用"],
        "assumptions": ["先验证再规模化"], "critical_unknowns": critical or [],
        "non_blocking_unknowns": non_blocking or ["技术路线", "成本目标"],
        "readiness": readiness, "confidence": confidence, "next_action": "clarify" if readiness == "discovering" else "review_goal",
        "next_question": question,
        "goal_brief_draft": {"summary": "你希望建立 AI 短剧生产能力，而非只生成一条短剧。", "goal": "AI 短剧生产能力", "expected_outcome": "验证稳定生产链", "scope": ["Founder 验证"], "constraints": [], "success_criteria": [], "unknowns": [], "assumptions": ["先验证"]},
    }


def _runtime(monkeypatch, runner=None):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(module, "SessionLocal", factory)
    with factory() as session:
        conversation = ConversationDB(system_id="founder_ai", title="AI 短剧")
        session.add(conversation); session.commit(); session.refresh(conversation)
        return module.SinoBrainRuntime(understanding_runner=runner or (lambda _: _result())), conversation.id


def test_strategy_unknown_does_not_block_goal_brief(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: _result(non_blocking=["模型选择", "成本目标", "Workflow 拆分"]))
    result = runtime.process_message(conversation_id, "我要做AI短剧")
    assert result["message_type"] == "goal_brief"
    assert result["brain"]["goal_readiness"] == "reviewable"
    assert "成本目标" in result["brain"]["goal_brief"]["unknowns"]
    with module.SessionLocal() as session:
        assert session.get(ConversationDB, conversation_id).title == "AI 短剧生产能力"


def test_model_cannot_turn_production_steps_into_blocking_question(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: _result(readiness="discovering", critical=["生产范围"], question="生产链要覆盖剧本、分镜还是视频生成？", confidence=.4))
    result = runtime.process_message(conversation_id, "要验证完整生产链")
    assert result["brain"]["stage"] == "goal_review"
    assert "生产范围" in result["brain"]["goal_brief"]["unknowns"]


def test_blocking_unknown_asks_at_most_two_questions(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: _result(readiness="discovering", critical=["内容形态"], question=["第一阶段做真人短剧还是 AI 动画？", "你是在验证内容还是生产系统？", "第三个问题不得出现"]))
    result = runtime.process_message(conversation_id, "我要做AI短剧")
    assert result["message_type"] == "goal_understanding"
    assert len(result["brain"]["discovery"]["working_understanding"]["next_question"]) == 2
    assert "第三个问题" not in result["reply"]


def test_context_is_passed_to_model_and_not_reasked(monkeypatch):
    seen = {}
    def runner(context):
        seen.update(context)
        return _result()
    runtime, conversation_id = _runtime(monkeypatch, runner)
    runtime.process_message(conversation_id, "Founder 先验证，未来给 Studio 使用")
    assert seen["current_founder_input"].startswith("Founder")
    assert seen["context_sources"]["current_conversation"] is True
    assert runtime.snapshot(conversation_id)["discovery"]["working_understanding"]["critical_unknowns"] == []


def test_soft_limit_prevents_infinite_questionnaire(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: _result(readiness="discovering", critical=["仍然不确定"], question="再问一次？", confidence=.4))
    for text in ["我要做AI短剧", "真人", "做生产系统", "先验证完整链路"]:
        state = runtime.process_message(conversation_id, text)
    assert state["brain"]["stage"] == "goal_review"
    assert state["brain"]["goal_readiness"] == "reviewable"


def test_force_review_confirm_and_persistence(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: _result(readiness="discovering", critical=["形态"], question="哪种形态？"))
    runtime.process_message(conversation_id, "我要做AI短剧")
    assert runtime.force_goal_review(conversation_id)["stage"] == "goal_review"
    assert runtime.confirm_goal(conversation_id)["stage"] == "goal_confirmed"
    assert runtime.snapshot(conversation_id)["goal_brief"]["goal"] == "AI 短剧生产能力"
    assert "Goal Brief" in runtime.prepare_strategy_prompt(conversation_id)


def test_reviewable_natural_confirmation_bypasses_llm_and_enters_strategy(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    runtime.process_message(conversation_id, "我要做AI短剧")
    runtime._understanding_runner = lambda _: (_ for _ in ()).throw(AssertionError("LLM must not run"))
    result = runtime.process_message(conversation_id, "正确")
    assert result["message_type"] == "strategy_meeting"
    assert result["brain"]["stage"] == "strategy_meeting"
    assert result["brain"]["goal_readiness"] == "confirmed"


def test_review_intent_tolerates_typo_but_revision_is_not_confirmation():
    for text in ["正确", "真确", "确认", "同意", "可以", "开始讨论", "讨论", "进入讨论", "就这样", "没问题", "按这个来"]:
        assert module.SinoBrainRuntime.review_intent(text) == "confirm_goal"
    for text in ["这里不对，我不是做真人短剧", "修改一下", "这里错了"]:
        assert module.SinoBrainRuntime.review_intent(text) == "revise_goal"


def test_reviewable_revision_returns_to_goal_understanding(monkeypatch):
    calls = []
    runtime, conversation_id = _runtime(monkeypatch, lambda context: calls.append(context) or _result())
    runtime.process_message(conversation_id, "我要做AI短剧")
    result = runtime.process_message(conversation_id, "这里不对，我不是做真人短剧")
    assert len(calls) == 2
    assert result["brain"]["stage"] == "goal_review"
    assert result["message_type"] == "goal_brief"


def test_provider_failure_is_explicit_and_never_uses_fixed_question(monkeypatch):
    def fail(_): raise RuntimeError("provider_down")
    runtime, conversation_id = _runtime(monkeypatch, fail)
    result = runtime.process_message(conversation_id, "我要做AI短剧")
    assert result["message_type"] == "goal_understanding_error"
    assert "暂时不可用" in result["reply"]
    assert "哪一种 AI 短剧" not in result["reply"]
    assert result["brain"]["discovery"]["understanding_status"] == "unavailable"


def test_goal_brief_package_lifecycle(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    runtime.process_message(conversation_id, "我要做AI短剧")
    runtime.confirm_goal(conversation_id)
    runtime.prepare_strategy_prompt(conversation_id)
    council = {"council_runs": [{"council_run_id": "council-1", "recommendation": "建立短剧 Project，并先验证最小 Workflow", "consensus": ["先验证最小链路"], "disagreements": ["是否现在创建巨大 Agent"], "risks": ["成本不可控"], "unknowns": ["平台 API"], "model_runs": [{"model_run_id": "run-1", "provider": "deepseek", "model": "deepseek-chat", "status": "completed", "proposal": {"core_judgment": "先验证"}}]}]}
    final = runtime.finalize_council(conversation_id, council)
    assert final["stage"] == "strategy_meeting"
    assert final["current_action"]["action_id"] == "start_validation"
    assert runtime.advance_stage(conversation_id, "validation")["stage"] == "conflict_validation"
    assert runtime.advance_stage(conversation_id, "decision")["stage"] == "decision_ready"
    assert runtime.advance_stage(conversation_id, "package")["stage"] == "package_ready"
    committed = runtime.review_package(conversation_id, "approve")
    assert committed["stage"] == "conversation_completed"
    assert committed["discussion_package"]["status"] == "archived"
    assert committed["discussion_package"]["asset_commit"]["status"] == "committed"
    assert len(committed["discussion_package"]["asset_commit"]["items"]) == 4
    assert committed["current_action"]["action_id"] == "develop"
    assert committed["current_action"]["target_asset_id"]
    with module.SessionLocal() as session:
        assert session.get(ConversationDB, conversation_id).conversation_state == "active"
        assert session.query(DecisionAssetDB).filter_by(conversation_id=conversation_id, status="candidate").count() == 1
        assert session.query(FounderProjectDB).filter_by(status="candidate").count() == 1
        assert session.query(FounderObjectDB).filter_by(status="candidate").count() == 1
        assert session.query(MemoryAssetDB).filter_by(conversation_id=conversation_id, status="candidate").count() == 1
    repeated = runtime.review_package(conversation_id, "approve")
    assert repeated["discussion_package"]["asset_commit"]["commit_id"] == committed["discussion_package"]["asset_commit"]["commit_id"]


def test_natural_language_uses_exact_selected_skill_and_shared_action(monkeypatch):
    captured = {}
    runtime, conversation_id = _runtime(
        monkeypatch,
        runner=lambda _: _result(),
    )
    runtime._lifecycle_intent_runner = lambda _: {
        "action": "develop", "target_asset_id": "asset-skill", "target_type": "skill",
        "target_name": "商品分镜生成 Skill", "confidence": .98,
    }
    with module.SessionLocal() as session:
        session.add_all([
            AssetCatalogDB(id="asset-skill", asset_type="skill", native_type="founder_object", native_id="asset-skill", name="商品分镜生成 Skill", purpose="生成分镜", status="candidate", domain_id="commerce", source_conversation_id=conversation_id),
            AssetCatalogDB(id="asset-workflow", asset_type="workflow", native_type="founder_object", native_id="asset-workflow", name="商品内容 Workflow", purpose="编排", status="candidate", domain_id="commerce", source_conversation_id=conversation_id),
        ])
        state = session.query(module.SinoBrainSessionDB).filter_by(conversation_id=conversation_id).one_or_none()
        if state is None:
            state = module.SinoBrainSessionDB(conversation_id=conversation_id)
            session.add(state)
        state.stage = "conversation_completed"
        state.discussion_package = {"objects": [{"asset_id": "asset-skill"}, {"asset_id": "asset-workflow"}]}
        session.commit()

    def perform(asset_id, action, **kwargs):
        captured.update(asset_id=asset_id, action=action, kwargs=kwargs)
        return {"asset": {"asset_id": asset_id, "status": "developing", "development_run_refs": [{"task_asset_id": "task-skill"}]}}

    monkeypatch.setattr(module, "perform_capability_action", perform)
    result = runtime.process_message(conversation_id, "其他候选先保留，只开发商品分镜 Skill。")
    assert result["handled"] is True
    assert captured == {"asset_id": "asset-skill", "action": "develop", "kwargs": {"target_type": None, "target_id": None, "note": "Founder 通过 Sino 自然语言确认"}}
    with module.SessionLocal() as session:
        assert session.get(ConversationDB, conversation_id).conversation_state == "active"
        assert session.get(AssetCatalogDB, "asset-workflow").status == "candidate"


def test_natural_language_reuse_works_during_goal_understanding(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._lifecycle_intent_runner = lambda _: {"action": "reuse", "target_asset_id": "asset-ready", "confidence": .99}
    with module.SessionLocal() as session:
        session.add(AssetCatalogDB(id="asset-ready", asset_type="skill", native_type="founder_object", native_id="asset-ready", name="商品分镜生成 Skill", purpose="生成分镜", status="ready", domain_id="commerce", source_conversation_id=conversation_id))
        session.commit()
    monkeypatch.setattr(module, "suggest_reuse", lambda _: [{"asset_id": "asset-ready", "asset_type": "skill", "name": "商品分镜生成 Skill", "status": "ready", "available_actions": ["reuse"], "can_reuse": True}])
    monkeypatch.setattr(module, "perform_capability_action", lambda asset_id, action, **kwargs: {"asset": {"asset_id": asset_id, "status": "ready"}, "reference": {"reference_id": "reference-1"}})
    result = runtime.process_message(conversation_id, "引用它。")
    assert result["action"] == "reuse"
    assert result["target_asset_id"] == "asset-ready"
    assert "Reference" in result["reply"]


def test_stage_workspace_projection_persists_lifecycle_and_message_isolation(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    runtime.process_message(conversation_id, "我要做AI短剧")
    with module.SessionLocal() as session:
        session.add_all([
            ConversationMessageDB(id="message-goal", conversation_id=conversation_id, role="founder", content="我要做AI短剧", grounding={"brain_stage": "goal"}),
            ConversationMessageDB(id="message-strategy", conversation_id=conversation_id, role="assistant", content="开始策略讨论", message_type="strategy_meeting", grounding={"brain_stage": "strategy"}),
        ])
        session.commit()
    review = runtime.snapshot(conversation_id)
    assert review["active_workspace_stage"] == "goal"
    assert [item["status"] for item in review["stage_workspaces"]] == ["active", "locked", "locked", "locked", "locked", "locked"]
    assert review["stage_workspaces"][0]["message_refs"] == ["message-goal"]
    assert review["stage_workspaces"][1]["message_refs"] == ["message-strategy"]

    runtime.confirm_goal(conversation_id)
    runtime.prepare_strategy_prompt(conversation_id)
    strategy = runtime.snapshot(conversation_id)
    assert strategy["active_workspace_stage"] == "strategy"
    assert [item["status"] for item in strategy["stage_workspaces"]] == ["completed", "active", "locked", "locked", "locked", "locked"]


def test_finalized_council_exposes_completed_stages_and_active_package(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    runtime.process_message(conversation_id, "我要做AI短剧")
    runtime.confirm_goal(conversation_id)
    council = {"council_runs": [{"council_run_id": "council-1", "recommendation": "先验证最小生产链", "consensus": ["先验证"], "disagreements": [], "risks": [], "unknowns": [], "model_runs": [{"model_run_id": "run-1", "provider": "test", "model": "test-model", "status": "completed", "proposal": {"core_judgment": "先验证"}}]}]}
    runtime.finalize_council(conversation_id, council)
    runtime.advance_stage(conversation_id, "validation")
    runtime.advance_stage(conversation_id, "decision")
    runtime.advance_stage(conversation_id, "package")
    package = runtime.snapshot(conversation_id)
    assert package["active_workspace_stage"] == "package"
    assert [item["status"] for item in package["stage_workspaces"]] == ["completed", "completed", "completed", "completed", "active", "locked"]


def test_decision_removes_model_attribution_from_primary_recommendation():
    assert module.SinoBrainRuntime._normalize_recommendation("采纳GPT的反方建议，缩小第一阶段范围") == "缩小第一阶段范围"
