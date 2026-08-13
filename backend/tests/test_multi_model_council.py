import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, GoalAssetDB, PendingQuestionDB
from app.core.council.model import CouncilModelRunDB, CouncilRunDB
from app.core.decision.model import DecisionAssetDB
import app.core.conversation.service as conversation_service
import app.core.project.service as project_service
import app.core.model_center.service as model_center_service
import app.founder_ai.council as council_module
import app.founder_ai.secretary.service as secretary_service
from app.llm.exceptions import ProviderUnavailableError, RateLimitedError
from app.llm.models import LLMResponse


def _database(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    for module in (conversation_service, project_service, model_center_service, council_module, secretary_service):
        monkeypatch.setattr(module, "SessionLocal", factory)
    return factory


def test_council_uses_same_context_persists_partial_results_and_consensus_asset(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    secretary_service.SinoSecretaryService(reply_generator=lambda *_: "seed").append_message(conversation.id, "必须保持 Conversation First。")
    contexts = []

    def model_runner(definition, context):
        contexts.append(context)
        if definition.key == "claude":
            raise ProviderUnavailableError()
        return {"provider": definition.key, "model": f"{definition.key}-model", "proposal": {"core_judgment": f"{definition.label} 独立判断", "recommendation": "先验证核心闭环"}}

    synthesis = {"consensus": ["先验证核心闭环"], "disagreements": ["建设顺序不同"], "unique_insights": ["保留成本边界"], "risks": ["复杂度"], "unknowns": ["资源"], "recommendation": "先建设 Council 最小闭环", "candidate_decision": "优先 Council V1", "candidate_goal": "验证两模型运行"}
    service = council_module.MultiModelCouncilService(model_runner=model_runner, synthesizer=lambda _q, _c, _p: synthesis)
    result = service.run(conversation.id, "Council 还是 Builder？")
    run = result["council_runs"][0]

    assert len(contexts) == 3
    assert all(context == contexts[0] for context in contexts)
    assert {item["proposal"]["core_judgment"] for item in run["model_runs"] if item["status"] == "completed"} == {"DeepSeek 独立判断", "GPT 独立判断"}
    assert next(item for item in run["model_runs"] if item["provider"] == "claude")["status"] == "unavailable"
    assert run["consensus"] == synthesis["consensus"]
    assert run["disagreements"] == synthesis["disagreements"]
    assert run["candidate_decision"] == "优先 Council V1"
    assert council_module.MultiModelCouncilService(model_runner=model_runner, synthesizer=lambda *_: synthesis).snapshot(conversation.id)["council_runs"][0]["recommendation"] == synthesis["recommendation"]
    with factory() as session:
        assert session.query(ArtifactAssetDB).filter_by(artifact_type="model_consensus", conversation_id=conversation.id).count() == 1
        assert session.query(DecisionAssetDB).filter_by(confirmed=True).count() == 0
        assert session.query(GoalAssetDB).count() == 0
        assert session.query(CandidateGoalDB).filter_by(status="candidate").count() == 1
        assert session.query(PendingQuestionDB).filter_by(status="open").count() == 1


def test_council_registry_excludes_codex_and_single_model_path_stays_independent(monkeypatch):
    _database(monkeypatch)
    keys = [item.key for item in council_module.model_registry.list()]
    assert keys == ["deepseek", "gpt", "claude"]
    assert "codex" not in keys
    conversation = conversation_service.create_conversation()
    snapshot = secretary_service.SinoSecretaryService(reply_generator=lambda *_: "single model reply").append_message(conversation.id, "普通讨论")
    assert snapshot["messages"][-1]["content"] == "single model reply"
    assert snapshot.get("council_runs") is None


def test_auto_deliberation_stops_after_two_low_gain_rounds_and_updates_intelligence(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    calls = []

    def model_runner(definition, context):
        calls.append((definition.key, context["auto_discussion"]["round"]))
        return {"provider": definition.key, "model": f"{definition.key}-model", "proposal": {"core_judgment": "保持同一核心判断", "key_reasons": ["没有新增信息"], "recommendation": "进入验证"}}

    synthesis = {"consensus": ["保持同一核心判断"], "disagreements": [], "unique_insights": [], "risks": ["验证风险"], "unknowns": [], "recommendation": "进入验证", "candidate_decision": None, "candidate_goal": None}
    result = council_module.MultiModelCouncilService(model_runner=model_runner, synthesizer=lambda *_: synthesis).run_auto(conversation.id, "是否进入验证？")
    run = result["council_runs"][0]

    assert len(calls) == 9
    assert run["status"] == "completed"
    assert result["messages"][-1]["message_type"] == "auto_deliberation"
    assert result["conversation_intelligence"]["summary"]
    with factory() as session:
        record = session.get(CouncilRunDB, run["council_run_id"])
        trace = record.context_package["deliberation"]
        assert trace["round_count"] == 3
        assert trace["auto_stop"] is True
        assert trace["stop_reason"] == "low_information_gain"
        assert len(trace["rounds"]) == 3
        assert trace["rounds"][0]["sino_round_summary"]["consensus"] == ["保持同一核心判断"]
        assert trace["rounds"][-1]["continue_discussion"] is False
        assert len(trace["source_refs"]) == 9
        assert all(item["model_run_id"] for item in trace["source_refs"])


def test_auto_deliberation_passes_previous_round_to_every_next_round(monkeypatch):
    _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    contexts = []

    def model_runner(definition, context):
        contexts.append(context["auto_discussion"])
        return {"provider": definition.key, "model": f"{definition.key}-model", "proposal": {"core_judgment": "判断", "recommendation": "建议"}}

    synthesis = {"consensus": ["共识"], "disagreements": ["少数意见"], "unique_insights": [], "risks": [], "unknowns": [], "recommendation": "建议"}
    council_module.MultiModelCouncilService(model_runner=model_runner, synthesizer=lambda *_: synthesis).run_auto(conversation.id, "继续讨论")
    assert contexts[0]["previous_synthesis"] == {}
    assert contexts[0]["previous_round_proposals"] == []
    assert contexts[3]["previous_synthesis"]["disagreements"] == ["少数意见"]
    assert len(contexts[3]["previous_round_proposals"]) == 3


def test_council_uses_concrete_models_and_falls_back_synthesis_to_successful_provider(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    targets = [
        type("Runtime", (), {"provider_key": "gpt", "model": "gpt-5-pro"})(),
        type("Runtime", (), {"provider_key": "claude", "model": "claude-sonnet-5"})(),
        type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})(),
    ]
    monkeypatch.setattr("app.core.model_center.service.resolve_multi_model_configs", lambda: targets)
    monkeypatch.setattr("app.core.model_center.service.resolve_runtime_config", lambda **kwargs: type("Runtime", (), {"provider_key": "claude", "model": "claude-sonnet-5"})() if kwargs.get("role") else None)
    calls = []

    def generate(provider, model, request):
        calls.append((provider, model, request.metadata))
        if request.metadata.get("council_synthesis") and provider == "claude":
            raise RateLimitedError()
        if provider != "deepseek":
            raise RateLimitedError()
        content = '{"core_judgment":"DeepSeek proposal","recommendation":"continue"}' if not request.metadata.get("council_synthesis") else '{"consensus":["continue"],"disagreements":[],"unique_insights":[],"risks":[],"unknowns":[],"recommendation":"DeepSeek synthesis"}'
        return LLMResponse(content=content, provider=provider, model=model, usage=None, latency_ms=1)

    monkeypatch.setattr(council_module.llm_gateway, "generate_for_model", generate)
    result = council_module.MultiModelCouncilService().run(conversation.id, "Council runtime?")
    run = result["council_runs"][0]
    assert run["status"] == "completed_partial"
    assert run["recommendation"] == "DeepSeek synthesis"
    assert ("gpt", "gpt-5-pro") in [(provider, model) for provider, model, _ in calls]
    assert ("gpt", "chatgpt-image-latest") not in [(provider, model) for provider, model, _ in calls]
    assert calls[-1][:2] == ("deepseek", "deepseek-chat")
    with factory() as session:
        assert session.query(CouncilRunDB).one().status == "completed_partial"
        assert session.query(ConversationMessageDB).filter_by(role="assistant", message_type="council").count() == 1


def test_council_accepts_ofoxai_models_and_preserves_provider_identity(monkeypatch):
    _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    targets = [
        type("Runtime", (), {"provider_key": "ofoxai-main", "model": "gpt-5-pro"})(),
        type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})(),
    ]
    monkeypatch.setattr("app.core.model_center.service.resolve_multi_model_configs", lambda: targets)
    monkeypatch.setattr("app.core.model_center.service.resolve_runtime_config", lambda **_kwargs: targets[1])

    def generate(provider, model, request):
        if request.metadata.get("council_synthesis"):
            content = '{"consensus":["mixed providers work"],"disagreements":[],"unique_insights":[],"risks":[],"unknowns":[],"recommendation":"continue"}'
        else:
            content = '{"core_judgment":"proposal","recommendation":"continue"}'
        # Compatible adapter protocol identity must not replace provider_id.
        return LLMResponse(content=content, provider="openai" if provider == "ofoxai-main" else provider, model=model, usage=None, latency_ms=1)

    monkeypatch.setattr(council_module.llm_gateway, "generate_for_model", generate)
    result = council_module.MultiModelCouncilService().run(conversation.id, "mixed council")
    run = result["council_runs"][0]
    assert run["status"] == "completed"
    assert sorted((item["provider"], item["model"]) for item in run["model_runs"]) == sorted([
        ("ofoxai-main", "gpt-5-pro"),
        ("deepseek", "deepseek-chat"),
    ])


def test_council_records_parse_failure_separately_from_provider_unavailable(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    targets = [type("Runtime", (), {"provider_key": "ofoxai-main", "model": "openai/gpt-5.5"})()]
    monkeypatch.setattr("app.core.model_center.service.resolve_multi_model_configs", lambda: targets)
    monkeypatch.setattr(council_module.llm_gateway, "generate_for_model", lambda *_args: LLMResponse(content="{broken", provider="openai", model="openai/gpt-5.5", usage=None, latency_ms=1))

    with pytest.raises(LookupError):
        council_module.MultiModelCouncilService().run(conversation.id, "parse failure")

    with factory() as session:
        model_run = session.query(CouncilModelRunDB).one()
        assert model_run.status == "parse_failed"
        assert model_run.error_type == "proposal_parse_failed"
        assert model_run.context_references["proposal_parse"]["reason"] == "invalid_or_truncated_json"


def test_council_accepts_recoverable_markdown_proposal(monkeypatch):
    _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    targets = [type("Runtime", (), {"provider_key": "ofoxai-main", "model": "openai/gpt-5.5"})()]
    monkeypatch.setattr("app.core.model_center.service.resolve_multi_model_configs", lambda: targets)
    monkeypatch.setattr("app.core.model_center.service.resolve_runtime_config", lambda **_kwargs: targets[0])

    def generate(_provider, _model, request):
        content = ('前置说明```json\n{"core_judgment":"真实判断","key_reasons":"真实理由","recommendation":"继续"}\n```尾部说明'
                   if not request.metadata.get("council_synthesis") else
                   '{"consensus":["真实判断"],"disagreements":[],"unique_insights":[],"risks":[],"unknowns":[],"recommendation":"继续"}')
        return LLMResponse(content=content, provider="openai", model="openai/gpt-5.5", usage=None, latency_ms=1)

    monkeypatch.setattr(council_module.llm_gateway, "generate_for_model", generate)
    run = council_module.MultiModelCouncilService().run(conversation.id, "recover proposal")["council_runs"][0]
    assert run["status"] == "completed"
    assert run["model_runs"][0]["proposal"]["key_reasons"] == ["真实理由"]
    assert run["model_runs"][0]["parse_metadata"]["parser_version"] == 2


def test_three_model_council_injects_distinct_perspectives_and_synthesis_metadata(monkeypatch):
    _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    targets = [type("Runtime", (), {"provider_key": provider, "model": model})() for provider, model in [
        ("ofoxai-main", "openai/gpt-5.6-luna"),
        ("ofoxai-main", "openai/gpt-5.5"),
        ("deepseek", "deepseek-chat"),
    ]]
    monkeypatch.setattr("app.core.model_center.service.resolve_multi_model_configs", lambda: targets)
    monkeypatch.setattr("app.core.model_center.service.resolve_runtime_config", lambda **_kwargs: targets[2])
    requests = []

    def generate(provider, model, request):
        requests.append((provider, model, request))
        content = ('{"consensus":["共识"],"disagreements":["分歧"],"unique_insights":["独特观点"],"risks":[],"unknowns":[],"recommendation":"综合"}'
                   if request.metadata.get("council_synthesis") else
                   '{"core_judgment":"判断","key_reasons":["理由"],"recommendation":"建议","risks":[],"objections":[],"founder_next_step":"下一步"}')
        return LLMResponse(content=content, provider=provider, model=model, usage=None, latency_ms=1)

    monkeypatch.setattr(council_module.llm_gateway, "generate_for_model", generate)
    run = council_module.MultiModelCouncilService().run(conversation.id, "Agent 还是 Skill？")["council_runs"][0]
    proposal_requests = [request for _, _, request in requests if not request.metadata.get("council_synthesis")]
    assert [request.metadata["perspective_role"] for request in proposal_requests] == ["strategy_value", "counter_risk", "execution_feasibility"]
    assert len({request.system_prompt for request in proposal_requests}) == 3
    assert all("不要主动寻求共识" in request.system_prompt for request in proposal_requests)
    synthesis_request = next(request for _, _, request in requests if request.metadata.get("council_synthesis"))
    assert synthesis_request.metadata["perspective_aware"] is True
    assert all(item["perspective_label"] for item in run["model_runs"])
    assert run["disagreements"] == ["分歧"]


def test_two_model_council_uses_complementary_perspectives():
    targets = [{"provider_key": "one", "model": "m1"}, {"provider_key": "two", "model": "m2"}]
    assigned = council_module.MultiModelCouncilService._assign_perspectives(targets)
    assert [item["perspective"]["perspective_role"] for item in assigned] == ["strategy_value", "counter_execution_review"]


def test_all_provider_failure_finalizes_run_and_filters_image_models(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    targets = [type("Runtime", (), {"provider_key": "gpt", "model": "chatgpt-image-latest"})(), type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})()]
    monkeypatch.setattr("app.core.model_center.service.resolve_multi_model_configs", lambda: targets)
    monkeypatch.setattr(council_module.llm_gateway, "generate_for_model", lambda *_args: (_ for _ in ()).throw(ProviderUnavailableError()))
    try:
        council_module.MultiModelCouncilService().run(conversation.id, "All fail")
        assert False, "expected terminal failure"
    except LookupError:
        pass
    with factory() as session:
        run = session.query(CouncilRunDB).one()
        assert run.status == "failed"
        assert run.context_package["failure_reason"] == "all_participants_failed"
        model_runs = session.query(CouncilModelRunDB).all()
        assert [item.model for item in model_runs] == ["deepseek-chat"]


def test_empty_synthesis_is_derived_only_from_successful_public_proposal(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    service = council_module.MultiModelCouncilService(
        model_runner=lambda definition, _context: (
            {"provider": definition.key, "model": f"{definition.key}-model", "proposal": {"core_judgment": "真实判断", "recommendation": "真实建议", "risks": ["真实风险"], "founder_next_step": "确认下一步"}}
            if definition.key == "deepseek" else (_ for _ in ()).throw(ProviderUnavailableError())
        ),
        synthesizer=lambda *_: {},
    )

    result = service.run(conversation.id, "只有一个模型成功")
    run = result["council_runs"][0]

    assert run["status"] == "completed_partial"
    assert run["recommendation"] == "真实建议"
    assert run["consensus"] == ["真实判断"]
    assert run["risks"] == ["真实风险"]
    with factory() as session:
        assistant = session.query(ConversationMessageDB).filter_by(role="assistant", message_type="council").one()
        assert "Sino 综合判断：真实建议" in assistant.content


def test_council_retry_reuses_founder_message_and_finalizes_orphaned_run(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    synthesis = {"consensus": ["continue"], "disagreements": [], "unique_insights": [], "risks": [], "unknowns": [], "recommendation": "continue"}
    service = council_module.MultiModelCouncilService(
        model_runner=lambda definition, _context: {"provider": definition.key, "model": f"{definition.key}-model", "proposal": {"recommendation": "continue"}},
        synthesizer=lambda *_: synthesis,
    )
    with factory() as session:
        session.add(ConversationMessageDB(conversation_id=conversation.id, role="founder", content="Retry this Council", message_type="council"))
        session.add(CouncilRunDB(conversation_id=conversation.id, question="Retry this Council", context_package={}, status="running"))
        session.commit()

    result = service.retry(conversation.id)

    assert result["council_runs"][-1]["status"] == "completed"
    with factory() as session:
        assert session.query(ConversationMessageDB).filter_by(role="founder", message_type="council").count() == 1
        runs = session.query(CouncilRunDB).order_by(CouncilRunDB.created_at).all()
        assert [item.status for item in runs] == ["failed", "completed"]
        assert runs[0].context_package["failure_reason"] == "superseded_by_retry"
