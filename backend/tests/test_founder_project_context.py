import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.project.model import FounderProjectDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, PendingQuestionDB, SecretaryDigestDB, SinoBrainSessionDB
import app.core.project.service as project_service
import app.core.conversation.service as conversation_service
import app.core.model_center.service as model_center_service
import app.founder_ai.secretary.service as secretary_service
from app.founder_ai.system_builder import SinoSystemBuilder
from app.llm.exceptions import ProviderUnavailableError
from app.llm.models import LLMResponse


def _database(monkeypatch):
    import app.founder_ai.conversation_core as conversation_core
    import app.founder_ai.attachments as attachments
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(project_service, "SessionLocal", factory)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(secretary_service, "SessionLocal", factory)
    monkeypatch.setattr(conversation_core, "SessionLocal", factory)
    runtime = SimpleNamespace(provider_key="configured-provider", model="configured-conversation-model")
    monkeypatch.setattr(conversation_core, "resolve_conversation_model_authority", lambda *_args, **_kwargs: {
        "primary": runtime, "fallbacks": [], "explicit_override": True,
    })
    monkeypatch.setattr(attachments, "SessionLocal", factory)
    return factory


def test_project_create_list_and_conversation_binding(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS", description="Founder system")
    assert project_service.list_projects()[0].id == project.id
    monkeypatch.setattr(conversation_service, "get_project", lambda project_id: project if project_id == project.id else None)
    conversation = conversation_service.create_conversation(title="Project discussion", project_id=project.id)
    assert conversation.project_id == project.id
    with factory() as session:
        restored = session.get(type(conversation), conversation.id)
        assert restored.project_id == project.id


def test_conversation_project_is_optional_and_invalid_project_is_rejected(monkeypatch):
    _database(monkeypatch)
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: None)
    assert conversation_service.create_conversation(title="Unscoped").project_id is None
    try:
        conversation_service.create_conversation(title="Invalid", project_id="missing")
    except conversation_service.ConversationBoundaryError:
        pass
    else:
        raise AssertionError("invalid Founder project must be rejected")


def test_project_topic_conversations_merge_without_losing_messages(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="Lifecycle Project", description="Lifecycle")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    first = conversation_service.create_conversation(title="Project definition", project_id=project.id)
    second = conversation_service.create_conversation(title="Planning continuation", project_id=project.id)
    with factory() as session:
        baseline = datetime(2026, 1, 1, tzinfo=UTC)
        session.add_all([
            ConversationMessageDB(conversation_id=first.id, role="founder", content="first", created_at=baseline),
            ConversationMessageDB(conversation_id=second.id, role="founder", content="continue", created_at=baseline + timedelta(seconds=1)),
            SinoBrainSessionDB(conversation_id=first.id, project_id=project.id, stage="goal_discovery", source_message_refs=[]),
            SinoBrainSessionDB(conversation_id=second.id, project_id=project.id, stage="project_planning", source_message_refs=[]),
        ])
        session.commit()

    canonical = conversation_service.merge_project_conversations(
        project_id=project.id,
        conversation_ids=[first.id, second.id],
        canonical_id=first.id,
        topic_key=f"project:{project.id}:definition",
    )

    with factory() as session:
        merged = session.get(type(second), second.id)
        messages = list(session.query(ConversationMessageDB).filter_by(conversation_id=first.id).order_by(ConversationMessageDB.created_at, ConversationMessageDB.id))
        brain = session.query(SinoBrainSessionDB).filter_by(conversation_id=first.id).one()
        assert canonical.id == first.id
        assert [item.content for item in messages] == ["first", "continue"]
        assert merged.status == "merged"
        assert merged.merged_into_conversation_id == first.id
        assert brain.stage == "project_planning"
        assert second.id in brain.discovery["merged_conversation_refs"]
    assert conversation_service.resolve_conversation_id(second.id) == first.id
    assert project_service.project_counts([project.id])[project.id]["conversation_count"] == 1
    assert [item.id for item in conversation_service.list_conversations() if item.project_id == project.id] == [first.id]


def test_project_intelligence_distills_conversation_and_versions_living_prompt(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS", description="Founder system")
    monkeypatch.setattr(conversation_service, "get_project", lambda project_id: project if project_id == project.id else None)
    conversation = conversation_service.create_conversation(title="New Conversation", project_id=project.id)
    service = secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "Sino test reply")
    snapshot = service.append_message(conversation.id, "我们必须保持 Conversation First，这个术语定义为讨论优先。还有哪些边界？")
    intelligence = project_service.get_project_intelligence(project.id)
    assert snapshot["digest"]["key_viewpoints"]
    assert snapshot["digest"]["constraints"]
    assert snapshot["digest"]["terminology"]
    assert snapshot["digest"]["prompt_delta"]["added"]
    assert intelligence["project_summary"]
    assert intelligence["master_prompt"]
    assert intelligence["prompt_version"] == 1
    assert intelligence["pending_questions"]
    assert intelligence["conversation_refs"][0]["title"].startswith("我们必须保持")
    service.append_message(conversation.id, "正式确认：不要把技术日志作为 Founder 主内容")
    upgraded = project_service.get_project_intelligence(project.id)
    assert upgraded["prompt_version"] == 2
    assert upgraded["decisions"]


def test_project_intelligence_projects_constitution_maturity_without_copying_source(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS", description="Founder system")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(title="Constitution V1", project_id=project.id)
    constitution = """AI Commerce OS Constitution V1
将以下内容写入 Project Context，作为最高层长期基线。
Intelligence Evolution Layer
AI Commerce OS Cloud
Sino Founder AI
Sino Operator AI
Sino Studio AI
Sino Industrial AI
Sino Quant AI
Idea → Discussion → Project Intelligence → Candidate → Founder Approval → Developing → Testing → Founder Approval → Ready → Reuse → Learning → Version Evolution"""
    with factory() as session:
        session.add(ConversationMessageDB(conversation_id=conversation.id, role="founder", content=constitution, message_type="project_context_update", intent="project_context_update"))
        session.add(SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="context_updated", discovery={"message_intent": "project_context_update"}))
        session.commit()

    intelligence = project_service.get_project_intelligence(project.id)
    projected = intelligence["constitution"]
    assert projected["status"] == "founder_review"
    assert projected["source_conversation_id"] == conversation.id
    assert projected["foundation_layer_count"] == 2
    assert projected["application_layer_count"] == 5
    assert projected["system_objects_count"] == 7
    assert projected["proposed_work_items_count"] == 10
    assert projected["founder_decisions_count"] == 0
    assert constitution not in str(projected)


def test_system_project_intelligence_projects_persisted_creation_context(monkeypatch):
    factory = _database(monkeypatch)
    parent = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: parent)
    source = conversation_service.create_conversation(title="AI Commerce OS Constitution V1", project_id=parent.id)
    with factory() as session:
        child = FounderProjectDB(
            id="project-intelligence-layer",
            system_id="founder_ai",
            name="Intelligence Evolution Layer",
            project_type="system_project",
            parent_project_id=parent.id,
            architecture_role="Foundation Layer",
            source_conversation_id=source.id,
            source_work_item_id="work-intelligence-layer",
            source_proposal_id="proposal-intelligence-layer",
            initial_positioning="Foundation Layer 的正式系统对象。",
            initial_scope=["定义职责与边界", "建立 Project Structure"],
            creation_reason="Constitution 已明确它是长期基础系统。",
        )
        session.add(child)
        session.commit()

    context = project_service.get_project_intelligence("project-intelligence-layer")["initial_project_context"]
    assert context == {
        "project_type": "system_project",
        "parent_project_id": parent.id,
        "parent_project_name": "AI Commerce OS",
        "architecture_role": "Foundation Layer",
        "initial_positioning": "Foundation Layer 的正式系统对象。",
        "initial_scope": ["定义职责与边界", "建立 Project Structure"],
        "reason": "Constitution 已明确它是长期基础系统。",
        "source_conversation_id": source.id,
        "source_conversation_title": "AI Commerce OS Constitution V1",
        "source_work_item_id": "work-intelligence-layer",
        "source_proposal_id": "proposal-intelligence-layer",
        "source_work_item": None,
        "founder_decision": None,
        "routing_recommendation": None,
        "formal_object_proposal": None,
        "real_dependency_evidence": [],
        "inherited_constitution": None,
    }


def test_project_intelligence_restores_and_revises_conflicting_prompt_rule(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda project_id: project if project_id == project.id else None)
    conversation = conversation_service.create_conversation(project_id=project.id)
    service = secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "Sino test reply")
    first = service.append_message(conversation.id, "S Logo 点击展开 Sidebar，这是必须遵守的规则。")
    assert first["conversation"]["title"].startswith("S Logo")
    original = project_service.get_project_intelligence(project.id)
    assert "S Logo 点击展开 Sidebar" in original["master_prompt"]

    service.append_message(conversation.id, "修正规则：S Logo 只负责 Home，Sidebar 使用独立 Hover Control。")
    restored = project_service.get_project_intelligence(project.id)
    assert restored["prompt_version"] == original["prompt_version"] + 1
    assert "只负责 Home" in restored["master_prompt"]
    assert "点击展开 Sidebar" not in restored["master_prompt"]
    assert project_service.assemble_project_context(project.id)["master_prompt"] == restored["master_prompt"]

    # A new service/session simulates refresh or process restart.
    snapshot = secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "Sino test reply").snapshot(conversation.id)
    assert snapshot["conversation"]["title"] == first["conversation"]["title"]
    assert snapshot["digest"]["summary"]
    assert snapshot["project_context"]["prompt_version"] == restored["prompt_version"]


def test_pending_question_resolves_and_candidate_goal_never_auto_executes(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    service = secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "Sino test reply")
    service.append_message(conversation.id, "Prompt 自动升级的触发频率是什么？")
    service.append_message(conversation.id, "实现 Project Intelligence 恢复能力")
    with factory() as session:
        assert session.query(PendingQuestionDB).filter_by(status="open").count() == 1
        candidate = session.query(CandidateGoalDB).one()
        assert candidate.status == "candidate"
    service.append_message(conversation.id, "这个问题已解决，结论是每次有效回复后轻量蒸馏。")
    with factory() as session:
        assert session.query(PendingQuestionDB).filter_by(status="resolved").count() == 1
        assert session.query(CandidateGoalDB).one().status == "candidate"
    assert project_service.get_project_intelligence(project.id)["pending_questions"] == []


def test_distillation_and_project_update_failures_preserve_last_known_good(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    service = secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "Sino test reply")
    service.append_message(conversation.id, "必须保留现有 Project Intelligence。")
    known_good = project_service.get_project_intelligence(project.id)

    monkeypatch.setattr(secretary_service, "apply_project_distillation", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("project update failed")))
    result = service.append_message(conversation.id, "必须继续保存 Founder 的新消息。")
    assert any(message["content"] == "必须继续保存 Founder 的新消息。" for message in result["messages"])
    assert project_service.get_project_intelligence(project.id)["master_prompt"] == known_good["master_prompt"]

    monkeypatch.setattr(service, "_update_digest", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("distillation failed")))
    result = service.append_message(conversation.id, "即使蒸馏失败，这条讨论也不能丢失。")
    assert any(message["content"] == "即使蒸馏失败，这条讨论也不能丢失。" for message in result["messages"])
    with factory() as session:
        assert session.query(ConversationMessageDB).filter_by(conversation_id=conversation.id).count() == 6


def test_provider_failure_preserves_founder_message_without_fake_reply(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation(title="新讨论")

    def unavailable(_conversation_id, _text):
        raise ProviderUnavailableError()

    service = secretary_service.SinoSecretaryService(reply_generator=unavailable)
    try:
        service.append_message(conversation.id, "这条 Founder 消息必须保留")
    except ProviderUnavailableError:
        pass
    else:
        raise AssertionError("provider failure must be explicit")

    snapshot = service.snapshot(conversation.id)
    assert [item["role"] for item in snapshot["messages"]] == ["founder"]
    assert snapshot["messages"][0]["content"] == "这条 Founder 消息必须保留"
    with factory() as session:
        assert session.query(ConversationMessageDB).filter_by(conversation_id=conversation.id).count() == 1


def test_provider_retry_uses_existing_conversation_and_distills(monkeypatch):
    factory = _database(monkeypatch)
    conversation = conversation_service.create_conversation(title="新讨论")
    attempts = {"count": 0}

    def recoverable(_conversation_id, _text):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise ProviderUnavailableError()
        return "Sino 已在原会话恢复回复。"

    service = secretary_service.SinoSecretaryService(reply_generator=recoverable)
    try:
        service.append_message(conversation.id, "讨论 Provider 失败后的恢复机制")
    except ProviderUnavailableError:
        pass
    recovered = service.retry_reply(conversation.id)

    assert recovered["conversation"]["id"] == conversation.id
    assert [item["role"] for item in recovered["messages"]] == ["founder", "assistant"]
    assert recovered["conversation"]["title"] != "新讨论"
    assert recovered["digest"]["summary"]
    with factory() as session:
        assert session.query(ConversationMessageDB).filter_by(conversation_id=conversation.id).count() == 2


def test_project_context_assembly_is_bounded_founder_intelligence(monkeypatch):
    _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "Sino test reply").append_message(conversation.id, "我确认必须恢复 Master Prompt，这是一条长期原则。")
    context = project_service.assemble_project_context(project.id)
    assert context["project_id"] == project.id
    assert context["master_prompt"]
    assert context["confirmed_decisions"]
    assert context["constraints"]
    assert "messages" not in context


def test_answer_grounding_records_request_context_and_persists(monkeypatch):
    import app.founder_ai.conversation_core as conversation_core
    _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "seed reply").append_message(conversation.id, "必须保持 Conversation First，并记住项目知识。")
    captured = {}

    def generate(provider, model, request):
        captured["target"] = (provider, model)
        captured["request"] = request
        return LLMResponse(content='{"response":"基于项目上下文继续推进。","semantic_intent":"conversation","conversation_state":"discussion"}', provider="deepseek", model="deepseek-chat", usage=None, latency_ms=12)

    monkeypatch.setattr(conversation_core, "resolve_runtime_config", lambda **kwargs: type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})())
    monkeypatch.setattr(conversation_core.llm_gateway, "generate_for_model", generate)
    snapshot = secretary_service.SinoSecretaryService().append_message(conversation.id, "下一步应该做什么？")
    assistant = snapshot["messages"][-1]
    sources = {item["key"]: item for item in assistant["grounding"]["sources"]}

    assert captured["request"].metadata["answer_grounding"] is True
    assert captured["request"].metadata["runtime_role"] == "sino_conversation"
    assert captured["target"] == ("deepseek", "deepseek-chat")
    assert sources["living_prompt"]["used"] is True
    assert sources["living_prompt"]["version"].startswith("v")
    assert sources["knowledge"]["used"] is True
    assert sources["constraints"]["used"] is True
    assert sources["conversation_history"]["used"] is True
    assert sources["current_conversation"]["used"] is True
    restored = secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "unused").snapshot(conversation.id)
    assert restored["messages"][-1]["grounding"] == assistant["grounding"]


def test_child_project_short_instruction_inherits_confirmed_parent_context(monkeypatch):
    import app.founder_ai.conversation_core as conversation_core
    factory = _database(monkeypatch)
    parent = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: parent)
    parent_conversation = conversation_service.create_conversation(title="AI Commerce OS Constitution V1", project_id=parent.id)
    understanding = {
        "constitution_title": "AI Commerce OS Constitution V1",
        "status": "founder_approved",
        "core_definition": "AI Commerce OS 是能力创造、复用与业务运行体系。",
        "foundation_layer": [{"name": "Intelligence Evolution Layer"}, {"name": "AI Commerce OS Cloud"}],
        "application_layer": [{"name": "Sino Founder AI"}],
        "system_objects": [{"name": "Intelligence Evolution Layer", "role": "Foundation / Intelligence Evolution"}],
        "capability_lifecycle": ["Candidate", "Developing", "Testing", "Ready", "Reuse", "Learning"],
        "capability_rules": ["Ready 前必须通过真实测试"],
        "founder_boundary": "Founder 负责目标、批准和验收。",
        "sino_boundary": "Sino 负责理解、分析和流程推进。",
        "shared_vs_isolated_principle": "Capability 可共享，Business 数据隔离。",
        "execution_principle": "批准后才执行。",
        "validation_principle": "真实测试后才 Ready。",
    }
    with factory() as session:
        session.add(SinoBrainSessionDB(conversation_id=parent_conversation.id, project_id=parent.id, stage="context_updated", discovery={"constitution_understanding": understanding}))
        child = FounderProjectDB(id="project-intelligence-layer", system_id="founder_ai", name="Intelligence Evolution Layer", parent_project_id=parent.id, project_type="system_project", architecture_role="Foundation Layer", initial_positioning="Foundation Layer 的正式系统对象。", initial_scope=["定义职责与边界"], source_conversation_id=parent_conversation.id, source_work_item_id="work-1", source_proposal_id="proposal-1")
        session.add(child)
        session.commit()
    child_conversation = conversation_service.create_conversation(title="Intelligence Evolution Layer 规划", project_id="project-intelligence-layer")
    captured = {}

    def generate(provider, model, request):
        captured["request"] = request
        return LLMResponse(content='{"response":"基于继承的 Constitution 与当前 Initial Scope，我建议先完成系统职责和边界定义。","semantic_intent":"conversation","conversation_state":"discussion"}', provider="deepseek", model="deepseek-chat", usage=None, latency_ms=8)

    monkeypatch.setattr(conversation_core, "resolve_runtime_config", lambda **kwargs: type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})())
    monkeypatch.setattr(conversation_core.llm_gateway, "generate_for_model", generate)
    snapshot = secretary_service.SinoSecretaryService().append_message(child_conversation.id, "下一步怎么做？", intent="discussion", message_type="project_planning", skip_object_recognition=True)
    injected = json.loads(captured["request"].user_prompt)["project_context"]
    assert injected["parent_confirmed_context"]["project_name"] == "AI Commerce OS"
    assert injected["parent_confirmed_context"]["constitution"]["title"] == "AI Commerce OS Constitution V1"
    assert injected["child_project_context"]["architecture_role"] == "Foundation Layer"
    assert injected["child_project_context"]["initial_scope"] == ["定义职责与边界"]
    assert injected["master_prompt"] == ""
    assert injected["constraints"] == []
    assert injected["relevant_knowledge"] == []
    sources = {item["key"]: item for item in snapshot["messages"][-1]["grounding"]["sources"]}
    assert sources["parent_project"]["used"] is True
    assert sources["parent_constitution"]["used"] is True
    assert sources["child_project_context"]["used"] is True
    assert sources["initial_project_context"]["used"] is True
    assert snapshot["goals"] == []


def test_project_aware_structured_provider_judgment_is_rendered_as_reply(monkeypatch):
    import app.founder_ai.conversation_core as conversation_core
    _database(monkeypatch)
    project = project_service.create_project(name="Intelligence Evolution Layer")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    monkeypatch.setattr(conversation_core, "resolve_runtime_config", lambda **kwargs: type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})())
    natural_reply = "我建议先把 Foundation Layer 的职责边界梳理清楚，再比较它对后续能力设计的影响。"
    monkeypatch.setattr(conversation_core.llm_gateway, "generate_for_model", lambda *_args: LLMResponse(content=json.dumps({"response": natural_reply, "semantic_intent": "conversation", "conversation_state": "discussion"}, ensure_ascii=False), provider="deepseek", model="deepseek-chat", usage=None, latency_ms=5))
    reply, _grounding = secretary_service.SinoSecretaryService._provider_reply(conversation.id, "下一步怎么做？")
    assert reply == natural_reply


def test_project_planning_reply_triggers_maturity_judgment_on_same_conversation(monkeypatch):
    _database(monkeypatch)
    project = project_service.create_project(name="Maturity Project")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    conversation = conversation_service.create_conversation(project_id=project.id)
    called = []
    from app.founder_ai import brain_runtime
    monkeypatch.setattr(brain_runtime.brain_runtime, "judge_project_maturity", lambda conversation_id: called.append(conversation_id))
    secretary_service.SinoSecretaryService(reply_generator=lambda _id, _text: "完成本轮分析").append_message(conversation.id, "继续", message_type="project_planning", skip_object_recognition=True)
    assert called == [conversation.id]


def test_unscoped_answer_grounding_has_no_project_provenance(monkeypatch):
    _database(monkeypatch)
    conversation = conversation_service.create_conversation()
    monkeypatch.setattr(model_center_service, "resolve_runtime_config", lambda **kwargs: type("Runtime", (), {"provider_key": "deepseek", "model": "deepseek-chat"})())
    monkeypatch.setattr(secretary_service.llm_gateway, "generate_for_model", lambda _provider, _model, _request: LLMResponse(content='{"reply":"直接回答。"}', provider="deepseek", model="deepseek-chat", usage=None, latency_ms=5))
    snapshot = secretary_service.SinoSecretaryService().append_message(conversation.id, "不绑定项目直接讨论")
    sources = {item["key"]: item for item in snapshot["messages"][-1]["grounding"]["sources"]}
    for key in ("project_summary", "current_position", "living_prompt", "confirmed_decisions", "knowledge", "constraints", "terminology", "pending_questions", "goals"):
        assert sources[key]["used"] is False
        assert sources[key]["available"] is False
    assert sources["founder_current_message"]["used"] is True
    assert sources["external_model_knowledge"]["used"] is True


def test_system_builder_receives_project_intelligence_context():
    intelligence = {"project_id": "project-1", "master_prompt": "Keep Founder content non-technical", "constraints": ["Founder approval required"]}
    plan = SinoSystemBuilder().build("创建 Operator AI", conversation_id="conv-1", project_intelligence=intelligence)
    assert plan.system_blueprint.system_key == "operator_ai"
    assert "Founder approval required" in plan.system_blueprint.system_boundaries


def test_intelligence_engine_extracts_deduplicates_and_respects_project_binding(monkeypatch):
    factory = _database(monkeypatch)
    project = project_service.create_project(name="AI Commerce OS")
    monkeypatch.setattr(conversation_service, "get_project", lambda _project_id: project)
    scoped = conversation_service.create_conversation(project_id=project.id)
    service = secretary_service.SinoSecretaryService(reply_generator=lambda *_: "广告投放优先调用官方 API。网页抓取存在稳定性与合规风险。仍需确认 Agent 如何拆分 Skill？")

    first = service.append_message(scoped.id, "正式确认：广告投放应优先使用官方 API。正式目标是实现广告投放 Agent。")
    service.append_message(scoped.id, "正式确认：广告投放应优先使用官方 API。正式目标是实现广告投放 Agent。")
    intelligence = project_service.get_project_intelligence(project.id)

    assert len(first["digest"]["summary"]) <= 120
    assert intelligence["current_positioning"] == "准备执行"
    assert any(item["confirmed"] for item in intelligence["decisions"])
    assert intelligence["active_goals"]
    assert intelligence["knowledge"]
    assert all(item["confidence"] is not None and item["source_message_ids"] for item in intelligence["knowledge"])
    contents = [item["content"].get("knowledge") for item in intelligence["knowledge"]]
    assert len(contents) == len(set(contents))
    assert intelligence["pending_questions"]
    assert intelligence["master_prompt"]
    assert intelligence["developer_debug"]["knowledge_count"] == len(intelligence["knowledge"])

    unscoped = conversation_service.create_conversation()
    service.append_message(unscoped.id, "讨论一个不绑定项目的问题？")
    with factory() as session:
        assert session.get(FounderProjectDB, project.id) is not None
    assert service.snapshot(unscoped.id)["project_context"] is None
