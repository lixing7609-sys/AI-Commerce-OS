from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
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
    assert final["stage"] == "package_ready"
    assert runtime.review_package(conversation_id, "approve")["stage"] == "package_approved"


def test_decision_removes_model_attribution_from_primary_recommendation():
    assert module.SinoBrainRuntime._normalize_recommendation("采纳GPT的反方建议，缩小第一阶段范围") == "缩小第一阶段范围"
