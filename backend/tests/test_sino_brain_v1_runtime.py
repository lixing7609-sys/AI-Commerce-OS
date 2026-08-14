from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.founder_ai import brain_runtime as module


def _runtime(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(module, "SessionLocal", factory)
    with factory() as session:
        conversation = ConversationDB(system_id="founder_ai", title="AI 短剧")
        session.add(conversation); session.commit(); session.refresh(conversation)
        return module.SinoBrainRuntime(), conversation.id


def test_ambiguous_goal_enters_discovery_before_strategy(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    result = runtime.process_message(conversation_id, "我要做AI短剧")
    assert result["handled"] is True
    assert result["message_type"] == "goal_discovery"
    assert "哪一种" in result["reply"]
    assert runtime.snapshot(conversation_id)["stage"] == "goal_discovery"


def test_goal_brief_confirmation_and_package_are_persistent(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    for answer in ["我要做AI短剧", "真人 AI 短剧", "给 Studio 使用的生产软件", "先降低成本并验证日产量", "两周内验证，单条成本可计算，版权合规"]:
        runtime.process_message(conversation_id, answer)
    state = runtime.snapshot(conversation_id)
    assert state["stage"] == "goal_review"
    assert state["goal_readiness"] == "reviewable"
    assert state["goal_brief"]["goal"] == "我要做AI短剧"
    assert runtime.confirm_goal(conversation_id)["stage"] == "goal_confirmed"
    assert "Goal Brief" in runtime.prepare_strategy_prompt(conversation_id)
    council = {"council_runs": [{"council_run_id": "council-1", "recommendation": "建立短剧 Project，并先验证最小 Workflow", "consensus": ["先验证最小链路"], "disagreements": ["是否现在创建巨大 Agent"], "risks": ["成本不可控"], "unknowns": ["平台 API"], "model_runs": [{"model_run_id": "run-1", "provider": "deepseek", "model": "deepseek-chat", "status": "completed", "proposal": {"core_judgment": "先验证"}}]}]}
    final = runtime.finalize_council(conversation_id, council)
    assert final["stage"] == "package_ready"
    assert final["decision"]["final_recommendation"].startswith("建立短剧 Project")
    assert final["conflicts"][0]["summary"] == "是否现在创建巨大 Agent"
    assert final["discussion_package"]["status"] == "pending_review"
    assert {item["object_type"] for item in final["discussion_package"]["objects"]} >= {"decision", "project", "workflow", "knowledge"}
    assert runtime.review_package(conversation_id, "approve")["stage"] == "package_approved"


def test_decision_removes_model_attribution_from_primary_recommendation():
    assert module.SinoBrainRuntime._normalize_recommendation("采纳GPT的反方建议，缩小第一阶段范围") == "缩小第一阶段范围"
    assert "Gemini" not in module.SinoBrainRuntime._normalize_recommendation("先验证，同时参考Gemini的技术路径")
