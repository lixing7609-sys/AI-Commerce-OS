import copy
import pytest
from types import SimpleNamespace

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.project.model import FounderProjectDB
from app.core.draft.model import FounderDraftDB
from core.conversation_first.model import CandidateGoalDB, ConversationMessageDB
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


def _runtime(monkeypatch, runner=None, routing_runner=None):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(module, "SessionLocal", factory)
    with factory() as session:
        conversation = ConversationDB(system_id="founder_ai", title="AI 短剧")
        session.add(conversation); session.commit(); session.refresh(conversation)
        return module.SinoBrainRuntime(understanding_runner=runner or (lambda _: _result()), work_item_routing_runner=routing_runner), conversation.id


def test_strategy_unknown_does_not_block_goal_brief(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: _result(non_blocking=["模型选择", "成本目标", "Workflow 拆分"]))
    result = runtime.process_message(conversation_id, "我要做AI短剧")
    assert result["message_type"] == "goal_brief"
    assert result["brain"]["goal_readiness"] == "reviewable"
    assert "成本目标" in result["brain"]["goal_brief"]["unknowns"]
    with module.SessionLocal() as session:
        assert session.get(ConversationDB, conversation_id).title == "AI 短剧生产能力"


def test_message_intent_distinguishes_context_goal_and_other_business_intents():
    classify = module.SinoBrainRuntime.classify_message_intent
    assert classify("将 Constitution V1 作为 AI Commerce OS Project 的最高层 Constitution / Project Context。", project_id="project-1") == "project_context_update"
    assert classify("把以下内容写入 Project Context，作为最高层长期基线。", project_id="project-1") == "project_context_update"
    assert classify("我要建立一个商品内容生产系统。", project_id="project-1") == "goal_creation"
    assert classify("按此决定，采用方案 A。", project_id="project-1") == "decision_update"
    assert classify("把这条沉淀为知识。", project_id="project-1") == "knowledge_update"
    assert classify("形成一个商品分镜候选能力。", project_id="project-1") == "capability_candidate_request"
    assert classify("开始执行这个任务。", project_id="project-1") == "execution_request"
    assert classify("我们继续讨论这个结构。", project_id="project-1") == "discussion"


def test_project_context_update_bypasses_goal_understanding_and_repository_lifecycle(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: (_ for _ in ()).throw(AssertionError("Goal Understanding must not run")))
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="project-constitution", system_id="founder_ai", name="AI Commerce OS", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        session.commit()
    runtime._lifecycle_intent_runner = lambda _: (_ for _ in ()).throw(AssertionError("Capability lifecycle must not run"))
    monkeypatch.setattr(module, "suggest_reuse", lambda _: (_ for _ in ()).throw(AssertionError("Capability search must not run")))

    result = runtime.process_message(conversation_id, "# AI Commerce OS Constitution V1\n\n将以下内容作为最高层长期基线，写入 Project Context。\n\nIntelligence Evolution Layer\nAI Commerce OS Cloud\nSino Founder AI\nSino Operator AI\nSino Studio AI\nSino Industrial AI\nSino Quant AI")

    assert result["handled"] is True
    assert result["intent"] == "project_context_update"
    assert result["message_type"] == "project_context_update"
    assert result["brain"]["stage"] == "context_updated"
    assert result["brain"]["goal_brief"] == {}
    assert result["brain"]["discussion_package"] == {}
    assert result["brain"]["current_action"] is None
    assert result["brain"]["next_action"] == "Founder Review：确认结构或返回讨论"
    assert len(result["brain"]["constitution_understanding"]["system_objects"]) == 7
    assert result["brain"]["constitution_understanding"]["status"] == "pending_founder_review"


def test_existing_misclassified_constitution_projects_as_context_update_without_rewriting_message(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    constitution = "AI Commerce OS Constitution V1\n\n以下内容作为 AI Commerce OS Project 的最高层长期基线，并沉淀到 Project Intelligence。\nIntelligence Evolution Layer\nAI Commerce OS Cloud\nSino Founder AI\nSino Operator AI\nSino Studio AI\nSino Industrial AI\nSino Quant AI"
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="project-ai-commerce-os", system_id="founder_ai", name="AI Commerce OS", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="goal_review", goal_readiness="reviewable", goal_brief={"goal": "错误 Goal"}, discovery={"original_goal": constitution})
        session.add(state)
        session.add(ConversationMessageDB(id="constitution-message", conversation_id=conversation_id, role="founder", content=constitution, message_type="goal_brief"))
        session.commit()

    snapshot = runtime.snapshot(conversation_id)
    assert snapshot["message_intent"] == "project_context_update"
    assert snapshot["stage"] == "context_updated"
    assert snapshot["goal_brief"] == {}
    assert snapshot["stage_workspaces"][0]["label"] == "Constitution Understanding · Founder Review"
    assert len(snapshot["constitution_understanding"]["foundation_layer"]) == 2
    assert len(snapshot["constitution_understanding"]["application_layer"]) == 5
    with module.SessionLocal() as session:
        message = session.get(ConversationMessageDB, "constitution-message")
        assert message.content == constitution
        assert session.scalar(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation_id)) is None


def test_constitution_understanding_extracts_frozen_layers_roles_and_principles():
    text = """AI Commerce OS Constitution V1
AI Commerce OS 是一个以 AI 为核心的能力创造、能力复用和业务运行体系。
基础层包括 Intelligence Evolution Layer 和 AI Commerce OS Cloud。
应用层包括 Sino Founder AI、Sino Operator AI、Sino Studio AI、Sino Industrial AI、Sino Quant AI。
Idea → Discussion → Project Intelligence → Candidate → Founder Approval → Developing → Testing → Founder Approval → Ready → Reuse → Learning → Version Evolution
Capability Asset 可以共享和复用，Business Asset 必须隔离。Founder 批准开发后必须产生真实 Execution。能力必须通过真实测试验证。"""
    result = module.SinoBrainRuntime.extract_constitution_understanding(text)
    assert [item["name"] for item in result["foundation_layer"]] == ["Intelligence Evolution Layer", "AI Commerce OS Cloud"]
    assert [item["name"] for item in result["application_layer"]] == ["Sino Founder AI", "Sino Operator AI", "Sino Studio AI", "Sino Industrial AI", "Sino Quant AI"]
    assert result["system_objects"][2]["role"] == "Application / Capability Creation & System Building"
    assert result["status"] == "pending_founder_review"
    assert result["available_actions"] == ["confirm_structure", "return_to_discussion"]


def test_proposed_work_items_are_derived_read_only_and_decisions_do_not_create_objects(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, routing_runner=lambda context: {"recommended_route": "system_project", "reason": "该对象是 Constitution 定义的长期基础系统，不是一次性结果或单项能力。", "proposed_object": context["work_item"]["title"], "next_action": "建议进入正式对象创建前的 Founder Review。", "confidence": .93})
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
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
    understanding = runtime.extract_constitution_understanding(constitution)
    understanding["status"] = "founder_approved"
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="project-studio", system_id="founder_ai", name="Sino Studio AI", status="active")
        asset = AssetCatalogDB(id="asset-ready", asset_type="skill", native_type="founder_object", native_id="skill-ready", name="商品分镜生成 Skill", purpose="生成分镜", status="ready", domain_id="commerce", development_run_refs=[{"run_id": "dev-1"}], test_run_refs=[{"test_run_id": "test-1", "status": "passed"}], ready_approval={"approved_by": "founder"}, reference_count=2)
        session.add_all([project, asset])
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="context_updated", discovery={"message_intent": "project_context_update", "constitution_understanding": understanding, "proposed_work_item_decisions": {}})
        session.add(state)
        session.add(ConversationMessageDB(id="constitution-work-source", conversation_id=conversation_id, role="founder", content=constitution, message_type="project_context_update", intent="project_context_update"))
        session.commit()
        work_items = runtime._propose_constitution_work_items(session, understanding, {})
        counts_before = (session.query(FounderProjectDB).count(), session.query(AssetCatalogDB).count(), session.query(CandidateGoalDB).count())

    assert len(work_items) == 10
    states = {item["title"]: item["existing_state"] for item in work_items}
    assert states["Sino Founder AI"] == "existing"
    assert states["Sino Studio AI"] == "needs_review"
    assert states["Intelligence Evolution Layer"] == "not_found"
    assert states["Capability Lifecycle"] == "partial"
    assert states["Domain-based Capability Repository"] == "needs_review"
    assert states["First Capability Golden Path"] == "existing"
    target = next(item for item in work_items if item["title"] == "Intelligence Evolution Layer")
    reviewed = runtime.review_constitution_work_item(conversation_id, target["work_item_id"], "approved")
    changed = next(item for item in reviewed["proposed_work_items"] if item["work_item_id"] == target["work_item_id"])
    assert changed["founder_decision"] == "approved"
    assert changed["routing_recommendation"]["recommended_route"] == "system_project"
    assert changed["routing_recommendation"]["routing_status"] == "pending_founder_review"
    routed = runtime.review_constitution_work_item_routing(conversation_id, target["work_item_id"], "approved")
    changed = next(item for item in routed["proposed_work_items"] if item["work_item_id"] == target["work_item_id"])
    assert changed["routing_recommendation"]["routing_status"] == "approved"
    proposal = changed["routing_recommendation"]["formal_object_proposal"]
    assert proposal["proposed_object"] == "Intelligence Evolution Layer"
    assert proposal["object_type"] == "system_project"
    assert proposal["parent_project"] == "Sino Studio AI"
    assert proposal["architecture_role"] == "Foundation Layer"
    assert proposal["status"] == "awaiting_founder_confirmation"
    assert proposal["creation_enabled"] is False
    repeated = runtime.ensure_formal_object_proposal(conversation_id, target["work_item_id"])
    repeated_proposal = next(item for item in repeated["proposed_work_items"] if item["work_item_id"] == target["work_item_id"])["routing_recommendation"]["formal_object_proposal"]
    assert repeated_proposal["proposal_id"] == proposal["proposal_id"]
    assert repeated_proposal["created_at"] == proposal["created_at"]
    runtime._initial_project_planning_runner = lambda _context: {
        "current_understanding": "Foundation system", "current_gap": "Definition gap",
        "priority_reason": "Constitution priority", "recommended_next_step": "Define boundaries",
        "sino_can_complete": "Draft the definition", "founder_question": None,
    }
    runtime._project_maturity_runner = lambda _context: {
        "maturity_status": "continue_analysis", "reason": "Definition can be developed autonomously.",
        "confidence": .8, "autonomous_next_analysis": "Draft the system definition.", "outcomes": [],
    }
    created = runtime.confirm_formal_object_proposal(conversation_id, target["work_item_id"])
    created_proposal = next(item for item in created["proposed_work_items"] if item["work_item_id"] == target["work_item_id"])["routing_recommendation"]["formal_object_proposal"]
    assert created_proposal["status"] == "created"
    repeated_creation = runtime.confirm_formal_object_proposal(conversation_id, target["work_item_id"])
    assert next(item for item in repeated_creation["proposed_work_items"] if item["work_item_id"] == target["work_item_id"])["routing_recommendation"]["formal_object_proposal"]["created_project_id"] == created_proposal["created_project_id"]
    with module.SessionLocal() as session:
        child = session.get(FounderProjectDB, created_proposal["created_project_id"])
        assert child.parent_project_id == "project-studio"
        assert child.project_type == "system_project"
        assert child.source_proposal_id == proposal["proposal_id"]
        assert (session.query(FounderProjectDB).count(), session.query(AssetCatalogDB).count(), session.query(CandidateGoalDB).count()) == (counts_before[0] + 1, counts_before[1], counts_before[2])


def test_work_item_semantics_use_source_sections_parent_context_and_existing_state_without_founder_decision(monkeypatch):
    captured = []
    def semantic_runner(context):
        captured.append(context)
        section = context["relevant_source_sections"][0]
        state = context["work_item"]["existing_state"]
        return {
            "system_role": section,
            "current_gap": f"当前证据状态为 {state}",
            "reason": f"基于相关原文与 Parent Context 判断：{section}",
            "recommended_action": f"先针对 {state} 核对原文支持的边界，再决定正式承载方式。",
            "source_context_refs": [context["source_document"]["message_id"], context["work_item"]["source"]],
            "confidence": .84,
        }
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._work_item_semantic_runner = semantic_runner
    source = """# Architecture Baseline
将本文写入 Project Context，作为系统基线。
## Foundation
Alpha Runtime 负责统一基础协议与共享接口。
## Application
Beta Workspace 负责面向业务人员组织应用工作流，并遵守基础协议。"""
    understanding = {
        "status": "founder_approved", "core_definition": "Architecture Baseline",
        "foundation_layer": [{"name": "Alpha Runtime", "role": "Foundation / Protocol"}],
        "application_layer": [{"name": "Beta Workspace", "role": "Application / Workflow"}],
        "system_objects": [{"name": "Alpha Runtime", "role": "Foundation / Protocol", "layer": "foundation"}, {"name": "Beta Workspace", "role": "Application / Workflow", "layer": "application"}],
    }
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="project-baseline", system_id="founder_ai", name="Architecture Baseline", description="Parent context", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id); conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="context_updated", discovery={"message_intent": "project_context_update", "constitution_understanding": understanding, "proposed_work_item_decisions": {}})
        session.add_all([state, ConversationMessageDB(id="semantic-source", conversation_id=conversation_id, role="founder", content=source, message_type="project_context_update", intent="project_context_update")])
        session.commit()
        items = runtime._propose_constitution_work_items(session, understanding, {})
        counts_before = (session.query(FounderProjectDB).count(), session.query(AssetCatalogDB).count(), session.query(CandidateGoalDB).count())
    for item in items:
        runtime.ensure_constitution_work_item_semantics(conversation_id, item["work_item_id"])
    snapshot = runtime.snapshot(conversation_id)
    enriched = {item["title"]: item for item in snapshot["proposed_work_items"]}
    assert len(captured) == 2
    assert captured[0]["relevant_source_sections"] != captured[1]["relevant_source_sections"]
    assert all(context["parent_project_context"]["project_id"] == "project-baseline" for context in captured)
    assert all(context["work_item"]["founder_decision"] == "pending" for context in captured)
    assert enriched["Alpha Runtime"]["semantic_understanding"]["context_sources"]["source_message_id"] == "semantic-source"
    assert enriched["Beta Workspace"]["semantic_understanding"]["context_sources"]["work_item_source"].startswith("system_objects:")
    assert enriched["Alpha Runtime"]["reason"] != enriched["Beta Workspace"]["reason"]
    assert all(item["founder_decision"] == "pending" for item in enriched.values())
    with module.SessionLocal() as session:
        assert (session.query(FounderProjectDB).count(), session.query(AssetCatalogDB).count(), session.query(CandidateGoalDB).count()) == counts_before


def test_selected_constitution_work_item_refresh_preempts_goal_routing(monkeypatch):
    runtime = module.SinoBrainRuntime()
    snapshot = {"constitution_understanding": {"proposed_work_items": [{"work_item_id": "work-runtime", "title": "Runtime Platform", "founder_decision": "pending", "semantic_understanding": {"system_role": "runtime", "current_gap": "missing dependency", "recommended_action": "resolve runtime"}}]}}
    calls = []
    monkeypatch.setattr(runtime, "ensure_constitution_work_item_semantics", lambda cid, wid, refresh=False: calls.append((cid, wid, refresh)) or snapshot)
    result = runtime.process_message("conv-constitution", "基于新增证据重新判断当前系统角色和真实缺口", interaction_context={"active_surface": "constitution_review", "selected_constitution_work_item_id": "work-runtime"})
    assert result["intent"] == "work_item_semantic_refresh"
    assert result["message_type"] == "work_item_semantic_refresh"
    assert len(result["intent"]) <= 30
    assert len(result["message_type"]) <= 30
    assert calls == [("conv-constitution", "work-runtime", True)]
    assert snapshot["constitution_understanding"]["proposed_work_items"][0]["founder_decision"] == "pending"


def test_semantic_refresh_requires_selected_constitution_context():
    assert module.SinoBrainRuntime._is_work_item_semantic_refresh("基于新证据重新判断", {"active_surface": "constitution_review"}) is False
    assert module.SinoBrainRuntime._is_work_item_semantic_refresh("我要建立一个 Runtime Platform 项目", {"active_surface": "conversation", "selected_constitution_work_item_id": "work-runtime"}) is False
    assert module.SinoBrainRuntime.classify_message_intent("我要建立一个 Runtime Platform 项目") == "goal_creation"


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


def test_short_instruction_in_system_project_stays_project_aware_discussion(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch, lambda _: (_ for _ in ()).throw(AssertionError("Goal Understanding must not run")))
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
    with module.SessionLocal() as session:
        parent = FounderProjectDB(id="project-parent", system_id="founder_ai", name="AI Commerce OS", status="active")
        child = FounderProjectDB(id="project-child", system_id="founder_ai", name="Intelligence Evolution Layer", parent_project_id=parent.id, project_type="system_project", architecture_role="Foundation Layer", initial_positioning="Foundation Layer 的正式系统对象。", initial_scope=["定义职责与边界"], status="active")
        session.add_all([parent, child])
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = child.id
        session.commit()

    result = runtime.process_message(conversation_id, "下一步怎么做？")
    assert result["handled"] is False
    assert result["intent"] == "discussion"
    assert result["message_type"] == "project_planning"
    assert result["brain"]["stage"] == "project_planning"
    assert result["brain"]["goal_brief"] == {}
    assert result["brain"]["discovery"]["project_aware"] is True
    assert result["brain"]["discovery"]["current_project"]["project_name"] == "Intelligence Evolution Layer"
    with module.SessionLocal() as session:
        assert session.scalar(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation_id)) is None


def test_formally_created_system_project_gets_one_canonical_initial_planning_conversation(monkeypatch):
    runtime, source_conversation_id = _runtime(monkeypatch)
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
    seen = {}
    runtime._initial_project_planning_runner = lambda context: seen.update(context) or {
        "current_understanding": "A complete Foundation system inherited from the Constitution.",
        "long_term_system_scope": ["platform responsibilities"],
        "immediate_blocking_scope": ["validated downstream runtime dependency"],
        "current_gap": "The required runtime boundary is not available.",
        "priority_reason": "A downstream validation is blocked.",
        "recommended_next_step": "Define the minimum runtime boundary without narrowing the full system.",
        "sino_can_complete": "Draft the system boundary and dependency contract.",
        "founder_question": None,
    }
    runtime._project_maturity_runner = lambda _context: {
        "maturity_status": "continue_analysis", "reason": "The inherited Context supports further definition work.",
        "confidence": .86, "autonomous_next_analysis": "Define the minimum runtime boundary and its relationship to the complete system scope.", "outcomes": [],
    }
    with module.SessionLocal() as session:
        parent = FounderProjectDB(id="parent-project", system_id="founder_ai", name="Parent OS", status="active")
        child = FounderProjectDB(
            id="new-system-project", system_id="founder_ai", name="Cloud Foundation", status="active",
            parent_project_id=parent.id, project_type="system_project", architecture_role="Foundation Layer",
            source_conversation_id=source_conversation_id, source_work_item_id="work-cloud", source_proposal_id="proposal-cloud",
            initial_positioning="Complete cloud foundation.", initial_scope=["platform boundary"], creation_reason="Confirmed Constitution object.",
        )
        session.add_all([parent, child]); session.commit()

    first = runtime.ensure_project_planning_conversation("new-system-project")
    second = runtime.ensure_project_planning_conversation("new-system-project")

    assert first["created"] is True and first["initialized"] is True
    assert second["conversation_id"] == first["conversation_id"]
    assert second["created"] is False and second["initialized"] is False
    assert seen["project_definition"]["architecture_role"] == "Foundation Layer"
    assert seen["creation_provenance"]["source_work_item_id"] == "work-cloud"
    with module.SessionLocal() as session:
        conversations = list(session.scalars(select(ConversationDB).where(ConversationDB.project_id == "new-system-project")))
        messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == first["conversation_id"])))
        assert len(conversations) == 1
        assert conversations[0].topic_key == "project:new-system-project:planning"
        assert conversations[0].title == "Cloud Foundation · 项目规划"
        assert len(messages) == 1
        assert messages[0].role == "assistant"
        assert messages[0].grounding["initial_project_planning"] is True
        assert session.scalar(select(func.count()).select_from(CandidateGoalDB)) == 0


def test_project_maturity_uses_context_and_gates_outcomes_without_creating_objects(monkeypatch):
    seen = {}
    def maturity_runner(context):
        seen.update(context)
        message_refs = [item["message_id"] for item in context["conversation_history"]]
        return {
            "maturity_status": "ready_for_review",
            "reason": "系统定位、父子关系和初始边界已经形成可审核结构。",
            "confidence": .88,
            "outcomes": [{"outcome_type": "project_definition", "title": "系统初始定义", "content": {"positioning": "Foundation Layer"}, "source_message_refs": message_refs}],
        }
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._project_maturity_runner = maturity_runner
    runtime._implementation_planning_runner = lambda context: {
        "implementation_goal": "Implement the confirmed definition safely.",
        "scope": ["core module"], "out_of_scope": ["production rollout"],
        "work_items": [{"work_item_id": "work-1", "title": "Build core module", "purpose": "realize definition", "scope": ["core"], "dependencies": [], "sequence": 1, "risk": ["compatibility"], "validation": ["contract test"]}],
        "dependencies": ["platform"], "execution_order": ["work-1"], "risk": ["compatibility"],
        "validation_criteria": ["contract passes"], "acceptance_criteria": ["definition covered"],
        "affected_system_objects": ["Foundation System"], "execution_requirements": ["Founder approval before execution"],
    }
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
    with module.SessionLocal() as session:
        parent = FounderProjectDB(id="maturity-parent", system_id="founder_ai", name="Parent", status="active")
        child = FounderProjectDB(id="maturity-child", system_id="founder_ai", name="Child", parent_project_id=parent.id, project_type="system_project", architecture_role="Foundation Layer", initial_positioning="Initial", initial_scope=["Boundary"], status="active")
        session.add_all([parent, child])
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = child.id
        session.add_all([ConversationMessageDB(conversation_id=conversation_id, role="founder", content="下一步怎么做？"), ConversationMessageDB(conversation_id=conversation_id, role="assistant", content="先形成系统定义。"), FounderDraftDB(title="Foundation Definition", draft_type="system_definition", status="ready_for_review", project_id=child.id, project_name=child.name, source_conversation_id=conversation_id, source_cognitive_outcome_ref="cognitive-definition", structured_content={"sections": {"responsibilities": ["evolve"]}}, version=1)])
        session.commit()
    runtime.process_message(conversation_id, "继续")
    result = runtime.judge_project_maturity(conversation_id)
    snapshot = runtime.snapshot(conversation_id)
    assert seen["project_context"]["project_id"] == "maturity-child"
    assert len(seen["conversation_history"]) == 2
    assert result["maturity_status"] == "ready_for_review"
    assert result["outcomes"][0]["status"] == "proposed"
    assert snapshot["current_action"]["action_id"] == "review_project_outcome"
    runtime.review_project_outcome(conversation_id, "confirm")
    confirmed = runtime.snapshot(conversation_id)
    assert confirmed["discovery"]["discussion_maturity"]["review_status"] == "founder_confirmed"
    assert confirmed["stage"] == "implementation_planning"
    assert confirmed["discovery"]["project_planning_status"] == "completed"
    assert confirmed["discovery"]["implementation_planning"]["status"] == "ready_for_execution_review"
    assert confirmed["current_action"]["primary_label"] == "批准实施"
    runtime.review_implementation_plan(conversation_id, "approve")
    runtime.review_implementation_plan(conversation_id, "approve")
    approved = runtime.snapshot(conversation_id)
    assert approved["discovery"]["implementation_planning"]["execution_approval"] == "approved"
    package = approved["discovery"]["execution_package"]
    assert approved["stage"] == "execution_package"
    assert package["implementation_plan_id"] == approved["discovery"]["implementation_planning"]["plan_id"]
    assert package["source_draft_id"] == approved["discovery"]["implementation_planning"]["source_draft_id"]
    assert len(package["work_items"]) == 1
    assert package["execution_status"] == "not_started"
    assert package["preflight_status"] in {"ready", "blocked", "founder_gate_required"}
    assert approved["current_action"]["primary_label"] is None
    with module.SessionLocal() as session:
        assert session.scalar(select(FounderDraftDB).where(FounderDraftDB.source_conversation_id == conversation_id)).status == "confirmed"
        assert session.scalar(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation_id)) is None
        assert session.scalar(select(FounderObjectDB).where(FounderObjectDB.source_conversation_id == conversation_id)) is None
        assert session.scalar(select(AssetCatalogDB).where(AssetCatalogDB.source_conversation_id == conversation_id)) is None


@pytest.mark.parametrize(("payload", "expected"), [
    ({"maturity_status": "founder_input_required", "reason": "存在会改变核心边界且 Context 无法决定的产品选择。", "confidence": .9, "blocking_question": "该平台是否允许跨业务域共享学习结果？", "why_founder_needed": "该选择改变隔离边界，属于 Founder 的产品治理权限。", "sino_recommendation": "首版保持域内隔离。", "recommendation_reason": "可降低错误传播风险。", "optional_options": ["域内隔离", "受控共享"], "outcomes": []}, "founder_input_required"),
    ({"maturity_status": "continue_analysis", "reason": "缺少的接口清单可以从已确认上下文继续推导。", "confidence": .8, "autonomous_next_analysis": "继续整理接口和数据流。", "outcomes": []}, "continue_analysis"),
    ({"maturity_status": "ready_for_review", "reason": "定义、边界和关系均已有对话证据。", "confidence": .88, "outcomes": [{"outcome_type": "project_definition", "title": "平台治理定义", "content": "已形成可审核边界。", "source_message_refs": ["message-1"]}]}, "ready_for_review"),
])
def test_project_maturity_validates_blocking_autonomous_and_review_gates(payload, expected):
    result = module.SinoBrainRuntime._validate_project_maturity(payload)
    assert result["maturity_status"] == expected
    if expected == "founder_input_required":
        assert result["why_founder_needed"]
        assert result["recommendation_reason"]


def test_execution_package_preflight_distinguishes_ready_blocked_and_founder_gate(monkeypatch):
    plan = {"execution_approval": "approved", "scope": ["approved"], "work_items": [{"work_item_id": "work-1", "dependencies": [], "validation": ["test"]}]}
    package = {"source_draft_version": 3, "scope": ["approved"], "work_items": [dict(plan["work_items"][0])], "execution_order": ["work-1"], "validation_plan": {"integration": ["integration"]}, "acceptance_criteria": ["accepted"], "rollback_plan": [{"area": "repository"}]}
    monkeypatch.setattr(module.subprocess, "run", lambda args, **kwargs: SimpleNamespace(stdout="main\n" if "branch" in args else ""))
    ready = module.SinoBrainRuntime._preflight_execution_package(package=package, plan=plan, draft=SimpleNamespace(status="confirmed", version=3))
    assert ready["status"] == "ready"
    expanded = module.SinoBrainRuntime._preflight_execution_package(package={**package, "scope": ["approved", "extra"]}, plan=plan, draft=SimpleNamespace(status="confirmed", version=3))
    assert expanded["status"] == "founder_gate_required"
    broken = module.SinoBrainRuntime._preflight_execution_package(package={**package, "work_items": [{"work_item_id": "work-1", "dependencies": ["missing"], "validation": ["test"]}]}, plan=plan, draft=SimpleNamespace(status="confirmed", version=3))
    assert broken["status"] == "blocked"


def test_infrastructure_package_requires_approved_runtime_environment_binding(monkeypatch):
    plan = {
        "execution_approval": "approved", "scope": ["Provision an external object store and deploy a worker"],
        "work_items": [{"work_item_id": "work-storage", "title": "Configure object_store runtime", "dependencies": [], "validation": ["connectivity"]}],
        "execution_requirements": ["Requires credentials to create external resources"],
    }
    package = {
        "package_id": "execution-package-runtime", "source_draft_version": 3, "scope": list(plan["scope"]),
        "work_items": copy.deepcopy(plan["work_items"]), "execution_order": ["work-storage"],
        "validation_plan": {"integration": ["integration"]}, "acceptance_criteria": ["accepted"],
        "rollback_plan": [{"area": "external_resource"}],
        "executor_requirements": {"plan_requirements": list(plan["execution_requirements"])},
    }
    monkeypatch.setattr(module.subprocess, "run", lambda args, **kwargs: SimpleNamespace(stdout="main\n" if "branch" in args else ""))
    missing = module.SinoBrainRuntime._preflight_execution_package(package=package, plan=plan, draft=SimpleNamespace(status="confirmed", version=3))
    binding = package["runtime_binding"]
    assert missing["status"] == "founder_gate_required"
    assert binding["requires_runtime_binding"] is True
    for field in ("provider_resolved", "credential_boundary_resolved", "cost_boundary_resolved", "external_side_effect_boundary_resolved"):
        assert binding[field] is False
    assert missing["founder_gate_reasons"][0].startswith("Runtime Environment Binding Required")

    package["runtime_binding"] = {
        **binding, "provider": "approved-provider", "target_environment": "isolated-non-production",
        "resource_bindings": [{"logical_dependency": requirement, "concrete_target": f"approved-{requirement}-ref"} for requirement in binding["required_resource_bindings"]],
        "credential_source": "approved-credential-ref", "cost_boundary": "approved-budget-ref",
        "external_side_effect_boundary": "approved-create-and-configure", "production_impact": "none",
        "binding_status": "approved",
    }
    ready = module.SinoBrainRuntime._preflight_execution_package(package=package, plan=plan, draft=SimpleNamespace(status="confirmed", version=3))
    assert ready["status"] == "ready"
    assert package["runtime_binding"]["binding_status"] == "passed"


def test_runtime_binding_gate_does_not_apply_to_local_code_package(monkeypatch):
    plan = {"execution_approval": "approved", "scope": ["Update local parsing logic"], "work_items": [{"work_item_id": "work-code", "title": "Implement parser", "dependencies": [], "validation": ["unit tests"]}]}
    package = {"source_draft_version": 1, "scope": list(plan["scope"]), "work_items": copy.deepcopy(plan["work_items"]), "execution_order": ["work-code"], "validation_plan": {"integration": ["tests"]}, "acceptance_criteria": ["passed"], "rollback_plan": [{"area": "repository"}]}
    monkeypatch.setattr(module.subprocess, "run", lambda args, **kwargs: SimpleNamespace(stdout="main\n" if "branch" in args else ""))
    result = module.SinoBrainRuntime._preflight_execution_package(package=package, plan=plan, draft=SimpleNamespace(status="confirmed", version=1))
    assert result["status"] == "ready"
    assert package["runtime_binding"]["requires_runtime_binding"] is False


def _execution_package_state(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    plan = {
        "plan_id": "implementation-plan-1", "source_draft_version": 3,
        "execution_approval": "approved", "scope": ["approved"],
        "work_items": [{"work_item_id": "work-1", "dependencies": [], "validation": ["test"]}],
        "execution_order": ["work-1"], "validation_criteria": ["integration"],
        "acceptance_criteria": ["accepted"],
    }
    package = {
        "package_id": "execution-package-1", "source_draft_id": "draft-1", "source_draft_version": 3,
        "implementation_plan_id": plan["plan_id"], "scope": ["approved"],
        "work_items": copy.deepcopy(plan["work_items"]), "dependencies": [], "execution_order": ["work-1"],
        "approval_ref": {"status": "approved"},
        "validation_plan": {"work_items": [{"work_item_id": "work-1", "validation": ["test"]}], "integration": ["integration"], "final_acceptance": ["accepted"]},
        "acceptance_criteria": ["accepted"], "rollback_plan": [{"area": "repository"}],
        "preflight": {"status": "blocked"}, "preflight_status": "blocked", "updated_at": "before",
    }
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="package-project", system_id="founder_ai", name="Package Project", status="active")
        draft = FounderDraftDB(id="draft-1", title="Definition", draft_type="system_definition", status="confirmed", project_id=project.id, project_name=project.name, source_conversation_id=conversation_id, source_cognitive_outcome_ref="outcome-1", version=3)
        conversation = session.get(ConversationDB, conversation_id); conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="execution_package", discovery={"implementation_planning": plan, "execution_package": package})
        session.add_all([project, draft, state]); session.commit()
    return runtime, conversation_id, package


def test_execution_package_revalidation_reuses_identity_and_only_refreshes_preflight(monkeypatch):
    runtime, conversation_id, original = _execution_package_state(monkeypatch)
    repository_dirty = True
    def git_state(args, **kwargs):
        if "branch" in args:
            return SimpleNamespace(stdout="main\n")
        return SimpleNamespace(stdout=" M changed.py\n" if repository_dirty else "")
    monkeypatch.setattr(module.subprocess, "run", git_state)

    blocked = runtime.revalidate_execution_package(conversation_id)
    assert blocked["package_id"] == original["package_id"]
    assert blocked["preflight_status"] == "blocked"
    repository_dirty = False
    ready = runtime.revalidate_execution_package(conversation_id)
    assert ready["package_id"] == original["package_id"]
    assert ready["preflight_status"] == "ready"
    for field in ("scope", "work_items", "dependencies", "execution_order", "source_draft_id", "implementation_plan_id", "approval_ref", "validation_plan", "rollback_plan"):
        assert ready[field] == original[field]
    with module.SessionLocal() as session:
        state = session.scalar(select(module.SinoBrainSessionDB).where(module.SinoBrainSessionDB.conversation_id == conversation_id))
        assert state.discovery["execution_package"]["package_id"] == original["package_id"]
        assert state.discovery["execution_package"]["preflight_status"] == "ready"


def test_execution_package_revalidation_can_raise_founder_gate_without_execution(monkeypatch):
    runtime, conversation_id, _ = _execution_package_state(monkeypatch)
    with module.SessionLocal() as session:
        state = session.scalar(select(module.SinoBrainSessionDB).where(module.SinoBrainSessionDB.conversation_id == conversation_id))
        discovery = dict(state.discovery); package = dict(discovery["execution_package"])
        package["scope"] = ["approved", "expanded"]
        discovery["execution_package"] = package; state.discovery = discovery; session.commit()
    monkeypatch.setattr(module.subprocess, "run", lambda args, **kwargs: SimpleNamespace(stdout="main\n" if "branch" in args else ""))
    monkeypatch.setattr(module, "create_execution_session", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("Executor must not run")), raising=False)
    result = runtime.revalidate_execution_package(conversation_id)
    assert result["package_id"] == "execution-package-1"
    assert result["preflight_status"] == "founder_gate_required"


def test_runtime_binding_revalidation_preserves_package_identity_and_work_items(monkeypatch):
    runtime, conversation_id, original = _execution_package_state(monkeypatch)
    with module.SessionLocal() as session:
        state = session.scalar(select(module.SinoBrainSessionDB).where(module.SinoBrainSessionDB.conversation_id == conversation_id))
        discovery = dict(state.discovery); package = dict(discovery["execution_package"]); plan = dict(discovery["implementation_planning"])
        plan["scope"] = ["Provision external database infrastructure"]
        plan["work_items"] = [{"work_item_id": "work-1", "title": "Configure database runtime", "dependencies": [], "validation": ["connect"]}]
        package["scope"] = list(plan["scope"]); package["work_items"] = copy.deepcopy(plan["work_items"])
        discovery.update({"implementation_planning": plan, "execution_package": package}); state.discovery = discovery; session.commit()
    monkeypatch.setattr(module.subprocess, "run", lambda args, **kwargs: SimpleNamespace(stdout="main\n" if "branch" in args else ""))
    monkeypatch.setattr(module, "create_execution_session", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("Executor must not run")), raising=False)
    result = runtime.revalidate_execution_package(conversation_id)
    assert result["package_id"] == original["package_id"]
    assert result["implementation_plan_id"] == original["implementation_plan_id"]
    assert result["work_items"] == [{"work_item_id": "work-1", "title": "Configure database runtime", "dependencies": [], "validation": ["connect"]}]
    assert result["preflight_status"] == "founder_gate_required"


def test_snapshot_projects_execution_feedback_without_restarting_planning(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    feedback = {"implementation_status": "completed", "validation_status": "blocked_by_external_dependency", "overall_execution_status": "blocked", "external_dependencies": [{"dependency_target": "Runtime Foundation", "blocking_scope": "work-7", "reason": "runtime unavailable"}], "next_step": "resolve_external_dependency_then_resume_validation"}
    with module.SessionLocal() as session:
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id="project-lifecycle", stage="project_planning", discovery={"project_aware": True, "discussion_maturity": {"maturity_status": "evaluating"}, "execution_context_feedback": feedback})
        session.add(state); session.commit()
        message_count = session.scalar(select(func.count()).select_from(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id))
    first = runtime.snapshot(conversation_id); second = runtime.snapshot(conversation_id)
    assert first["stage"] == "project_planning"
    assert first["project_lifecycle"]["lifecycle_stage"] == "validation_result"
    assert first["current_action"]["action_id"] == "resume_validation_after_dependency"
    assert second["project_lifecycle"] == first["project_lifecycle"]
    with module.SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id)) == message_count
        stored = session.scalar(select(module.SinoBrainSessionDB).where(module.SinoBrainSessionDB.conversation_id == conversation_id))
        assert stored.stage == "project_planning"
        assert stored.discovery["discussion_maturity"]["maturity_status"] == "evaluating"


def test_project_maturity_context_exposes_latest_analysis_for_semantic_blocking_judgment(monkeypatch):
    seen = {}
    def maturity_runner(context):
        seen.update(context)
        return {"maturity_status": "continue_analysis", "reason": "当前问题不阻塞核心定义。", "confidence": .8, "autonomous_next_analysis": "继续整理非阻塞接口。", "outcomes": []}
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._project_maturity_runner = maturity_runner
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="semantic-gate-project", system_id="founder_ai", name="Governance Platform", project_type="system_project", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="project_planning", discovery={"project_aware": True})
        session.add_all([state, ConversationMessageDB(conversation_id=conversation_id, role="founder", content="继续完善定义"), ConversationMessageDB(conversation_id=conversation_id, role="assistant", content="接口命名尚未统一，但不影响当前边界定义。")])
        session.commit()
    runtime.judge_project_maturity(conversation_id)
    assert seen["current_analysis"]["content"] == "接口命名尚未统一，但不影响当前边界定义。"


def test_founder_answer_resolves_active_blocking_question_before_current_action_projection(monkeypatch):
    seen = {}
    def maturity_runner(context):
        seen.update(context)
        return {"maturity_status": "continue_analysis", "reason": "Founder 已完成边界选择，Sino 可继续形成定义草案。", "confidence": .91, "autonomous_next_analysis": "继续整理职责与接口。", "blocking_question_resolution": {"status": "resolved", "reason": "回答明确选择了一个边界方案。", "answer_message_id": context["latest_founder_input"]["message_id"]}, "outcomes": []}
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._project_maturity_runner = maturity_runner
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="resolution-project", system_id="founder_ai", name="Governance Runtime", project_type="system_project", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="project_planning", discovery={"project_aware": True, "discussion_maturity": {"maturity_status": "founder_input_required", "blocking_question": "共享策略采用哪种边界？", "why_founder_needed": "会改变产品治理边界。", "sino_recommendation": "采用受控共享。"}})
        session.add_all([state, ConversationMessageDB(id="answer-message", conversation_id=conversation_id, role="founder", content="采用受控共享，只允许已批准范围。", message_type="project_planning"), ConversationMessageDB(conversation_id=conversation_id, role="assistant", content="已确认该边界选择。", message_type="project_planning")])
        session.commit()
    result = runtime.judge_project_maturity(conversation_id)
    snapshot = runtime.snapshot(conversation_id)
    assert seen["active_blocking_question"]["blocking_question"] == "共享策略采用哪种边界？"
    assert seen["active_blocking_question"]["founder_answer_candidate"] == "采用受控共享，只允许已批准范围。"
    assert result["blocking_question_resolution"]["status"] == "resolved"
    assert snapshot["current_action"]["action_id"] == "continue_project_planning"
    assert snapshot["discovery"]["blocking_question_resolution"]["status"] == "resolved"


def test_long_founder_answer_stays_in_existing_project_planning_conversation(monkeypatch):
    runtime, conversation_id = _runtime(monkeypatch)
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="answer-project", system_id="founder_ai", name="Policy Runtime", project_type="system_project", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        state = module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="project_planning", discovery={"project_aware": True, "discussion_maturity": {"maturity_status": "founder_input_required", "blocking_question": "采用哪一种治理边界？", "why_founder_needed": "属于产品治理选择。", "sino_recommendation": "首版采用隔离边界。"}})
        session.add(state)
        session.commit()
    answer = "我确认采用隔离边界。各业务域逻辑独立，共享能力必须经过明确审批，不允许系统自行跨域传播学习结果。"
    result = runtime.process_message(conversation_id, answer)
    assert result["message_type"] == "project_planning"
    assert result["brain"]["stage"] == "project_planning"
    assert result["brain"]["discovery"]["blocking_question_resolution"]["status"] == "answer_received"


@pytest.mark.parametrize(("maturity_payload", "expected_status"), [
    ({"maturity_status": "ready_for_review", "reason": "认知成果已经形成可审核定义。", "confidence": .9, "outcomes": [{"outcome_type": "project_definition", "title": "治理运行时定义", "content": "已形成职责与边界。", "source_message_refs": []}]}, "ready_for_review"),
    ({"maturity_status": "founder_input_required", "reason": "出现会改变产品治理边界的选择。", "confidence": .9, "blocking_question": "跨域结果是否允许自动共享？", "why_founder_needed": "属于 Founder 的治理权限。", "sino_recommendation": "首版不自动共享。", "recommendation_reason": "降低跨域污染风险。", "outcomes": []}, "founder_input_required"),
    ({"maturity_status": "continue_analysis", "reason": "本轮完成边界定义后，仍可自主整理接口契约。", "confidence": .85, "autonomous_next_analysis": "整理治理运行时的接口契约与数据流。", "outcomes": []}, "continue_analysis"),
])
def test_autonomous_analysis_executes_saved_target_then_evaluates_without_founder_message(monkeypatch, maturity_payload, expected_status):
    seen = {}
    def cognitive_runner(context):
        seen["work"] = context
        return {"work_target": "ignored model echo", "completion_status": "completed", "work_result": {"definition": "职责、边界与协作关系已经形成。"}, "new_findings": ["治理边界明确"], "resolved_questions": [], "new_questions": [], "proposed_outcomes": [{"outcome_type": "project_definition", "title": "治理定义"}], "planning_loop_detected": True, "narrative": "已完成治理运行时定义，包含职责、边界与协作关系。"}
    def maturity_runner(context):
        seen["evaluation"] = context
        return maturity_payload
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._autonomous_analysis_runner = cognitive_runner
    runtime._project_maturity_runner = maturity_runner
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", module.SessionLocal)
    target = "完成治理运行时的职责、边界与协作关系定义。"
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="cognitive-project", system_id="founder_ai", name="Governance Runtime", project_type="system_project", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id)
        conversation.project_id = project.id
        session.add(module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="project_planning", discovery={"project_aware": True, "discussion_maturity": {"maturity_status": "continue_analysis", "reason": "已有明确认知任务。", "autonomous_next_analysis": target, "outcomes": []}}))
        session.commit()
    runtime.execute_autonomous_analysis(conversation_id)
    snapshot = runtime.snapshot(conversation_id)
    assert seen["work"]["work_target"] == target
    assert seen["evaluation"]["cognitive_outcomes"][-1]["work_target"] == target
    assert snapshot["discovery"]["discussion_maturity"]["maturity_status"] == expected_status
    assert snapshot["discovery"]["cognitive_outcomes"][-1]["completion_status"] == "completed"
    with module.SessionLocal() as session:
        messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id)))
        assert len(messages) == 1
        assert messages[0].role == "assistant"
        assert session.scalar(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation_id)) is None
        assert session.scalar(select(AssetCatalogDB).where(AssetCatalogDB.source_conversation_id == conversation_id)) is None
    if expected_status == "continue_analysis":
        assert snapshot["discovery"]["discussion_maturity"]["autonomous_next_analysis"] != target


@pytest.mark.parametrize("run_status", ["running", "completed"])
def test_same_cognitive_work_identity_is_idempotent(monkeypatch, run_status):
    calls = []
    runtime, conversation_id = _runtime(monkeypatch)
    runtime._autonomous_analysis_runner = lambda context: calls.append(context)
    with module.SessionLocal() as session:
        project = FounderProjectDB(id="idempotent-project", system_id="founder_ai", name="Foundation Runtime", status="active")
        session.add(project)
        conversation = session.get(ConversationDB, conversation_id); conversation.project_id = project.id
        target_id = "cognitive-target-stable"
        run = {"run_id": "cognitive-run-stable", "conversation_id": conversation_id, "work_target_id": target_id, "work_target": "完成治理边界定义", "source_maturity_revision": 7, "run_status": run_status, "cognitive_outcome_id": "cognitive-existing" if run_status == "completed" else None}
        session.add(module.SinoBrainSessionDB(conversation_id=conversation_id, project_id=project.id, stage="project_planning", discovery={"discussion_maturity": {"maturity_status": "continue_analysis", "autonomous_next_analysis": "完成治理边界定义", "autonomous_work_target_id": target_id, "maturity_revision": 7}, "cognitive_work_run": run, "cognitive_outcomes": [{"cognitive_outcome_id": "cognitive-existing", "completion_status": "completed"}] if run_status == "completed" else []}))
        session.commit()
    result = runtime.execute_autonomous_analysis(conversation_id)
    assert result["deduplicated"] is True
    assert calls == []
    with module.SessionLocal() as session:
        assert session.query(ConversationMessageDB).filter_by(conversation_id=conversation_id).count() == 0


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
