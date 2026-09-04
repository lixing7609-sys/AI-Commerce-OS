from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.draft.model import FounderDraftDB
from app.core.project.model import FounderProjectDB
from app.database.base import Base
import app.core.draft.service as draft_service


def _factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(draft_service, "SessionLocal", factory)
    return factory


def test_completed_cognitive_outcome_becomes_one_traceable_draft(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as session:
        project = FounderProjectDB(id="project-child", system_id="founder_ai", name="Foundation System")
        conversation = ConversationDB(id="conv-canonical", system_id="founder_ai", project_id=project.id, title="项目规划")
        outcome = {
            "cognitive_outcome_id": "cognitive-real",
            "completion_status": "completed",
            "work_target": "完成系统定义",
            "work_result": {"document_draft": {"title": "System Definition Draft", "sections": {"core_responsibilities": ["evolve"], "system_boundaries": ["not runtime"]}}},
            "new_findings": ["finding"], "resolved_questions": ["resolved"], "new_questions": ["refine"],
            "proposed_outcomes": [{"type": "document", "title": "System Definition Draft"}], "narrative": "A durable outcome.",
        }
        brain = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="project_planning", discovery={"cognitive_outcomes": [outcome], "discussion_maturity": {"maturity_status": "continue_analysis", "autonomous_next_analysis": "refine interfaces"}})
        message = ConversationMessageDB(id="message-outcome", conversation_id=conversation.id, role="assistant", content="draft", grounding={"cognitive_work": {"cognitive_outcome_id": "cognitive-real"}})
        session.add_all([project, conversation, brain, message]); session.commit()

    first = draft_service.sync_cognitive_outcome(conversation_id="conv-canonical", cognitive_outcome_ref="cognitive-real")
    second = draft_service.sync_cognitive_outcome(conversation_id="conv-canonical", cognitive_outcome_ref="cognitive-real")
    assert first["created"] is True
    assert second["created"] is False
    assert first["draft"]["status"] == "refining"
    assert first["draft"]["source_message_refs"] == ["message-outcome"]
    assert first["draft"]["source_conversation_id"] == "conv-canonical"
    with factory() as session:
        assert session.query(FounderDraftDB).count() == 1


def test_plain_assistant_content_is_not_a_draft_source(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as session:
        project = FounderProjectDB(id="project-child", system_id="founder_ai", name="Foundation System")
        conversation = ConversationDB(id="conv-canonical", system_id="founder_ai", project_id=project.id, title="项目规划")
        brain = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="project_planning", discovery={"cognitive_outcomes": []})
        session.add_all([project, conversation, brain]); session.commit()
    try:
        draft_service.sync_cognitive_outcome(conversation_id="conv-canonical", cognitive_outcome_ref="message-any")
    except LookupError:
        pass
    else:
        raise AssertionError("ordinary assistant messages must not become Drafts")
    with factory() as session:
        assert session.query(FounderDraftDB).count() == 0


def test_ready_project_planning_outcomes_materialize_one_reviewable_project_definition(monkeypatch):
    factory = _factory(monkeypatch)
    import app.core.project.service as project_service
    monkeypatch.setattr(project_service, "SessionLocal", factory)
    maturity = {
        "maturity_status": "ready_for_review", "review_status": "awaiting_founder_review",
        "reason": "The immediate definition is coherent and reviewable.",
        "outcomes": [
            {"outcome_id": "outcome-definition", "outcome_type": "project_definition", "title": "Cloud Project Definition", "content": {"positioning": "Foundation"}, "source_message_refs": ["message-initial"]},
            {"outcome_id": "outcome-constraint", "outcome_type": "constraint", "title": "Immediate Scope", "content": "Minimum blocking scope", "source_message_refs": ["message-initial"]},
            {"outcome_id": "outcome-question", "outcome_type": "pending_question", "title": "Long-term Scope", "content": "Evolves later", "source_message_refs": ["message-initial"]},
        ],
    }
    with factory() as session:
        project = FounderProjectDB(id="project-cloud", system_id="founder_ai", name="Cloud", project_type="system_project", source_proposal_id="proposal-cloud")
        conversation = ConversationDB(id="conv-cloud", system_id="founder_ai", project_id=project.id, title="Cloud · 项目规划")
        brain = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="project_planning", discovery={"discussion_maturity": maturity})
        message = ConversationMessageDB(id="message-initial", conversation_id=conversation.id, role="assistant", content="initial planning", message_type="project_planning")
        session.add_all([project, conversation, brain, message]); session.commit()

    first = draft_service.ensure_project_definition_draft(conversation_id="conv-cloud", session_factory=factory)
    second = draft_service.ensure_project_definition_draft(conversation_id="conv-cloud", session_factory=factory)
    assert first["created"] is True
    assert second["created"] is False
    assert second["draft"]["draft_id"] == first["draft"]["draft_id"]
    assert second["draft"]["draft_type"] == "project_definition"
    assert second["draft"]["status"] == "ready_for_review"
    assert second["draft"]["version"] == 1
    assert second["draft"]["remaining_questions"] == ["Evolves later"]
    assert second["draft"]["structured_content"]["sections"]["project_definition"] == {"positioning": "Foundation"}
    assert second["draft"]["structured_content"]["_draft_meta"]["source_cognitive_outcome_refs"] == ["outcome-definition", "outcome-constraint", "outcome-question"]
    with factory() as session:
        assert session.query(FounderDraftDB).filter(FounderDraftDB.status != "archived").count() == 1


def test_later_outcome_updates_the_canonical_project_draft(monkeypatch):
    factory = _factory(monkeypatch)
    base = {"completion_status": "completed", "work_target": "形成系统定义", "new_findings": [], "resolved_questions": [], "new_questions": [], "proposed_outcomes": [{"type": "document", "title": "System Definition"}]}
    first = {**base, "cognitive_outcome_id": "cognitive-v1", "work_result": {"document_draft": {"title": "System Definition", "sections": {"core_responsibilities": ["v1"], "boundaries": ["stable"]}}}, "narrative": "v1"}
    second = {**base, "cognitive_outcome_id": "cognitive-v2", "work_result": {"document_draft": {"title": "System Definition", "sections": {"core_responsibilities": ["v2"], "boundaries": ["stable"]}}}, "narrative": "v2"}
    with factory() as session:
        project = FounderProjectDB(id="project-child", system_id="founder_ai", name="Foundation System")
        conversation = ConversationDB(id="conv-canonical", system_id="founder_ai", project_id=project.id, title="项目规划")
        brain = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="project_planning", discovery={"cognitive_outcomes": [first, second], "discussion_maturity": {"maturity_status": "continue_analysis"}})
        session.add_all([project, conversation, brain, ConversationMessageDB(id="m1", conversation_id=conversation.id, role="assistant", content="v1", grounding={"cognitive_work": {"cognitive_outcome_id": "cognitive-v1"}}), ConversationMessageDB(id="m2", conversation_id=conversation.id, role="assistant", content="v2", grounding={"cognitive_work": {"cognitive_outcome_id": "cognitive-v2"}})]); session.commit()
    original = draft_service.sync_cognitive_outcome(conversation_id="conv-canonical", cognitive_outcome_ref="cognitive-v1")
    updated = draft_service.sync_cognitive_outcome(conversation_id="conv-canonical", cognitive_outcome_ref="cognitive-v2")
    assert updated["created"] is False
    assert updated["draft"]["draft_id"] == original["draft"]["draft_id"]
    assert updated["draft"]["version"] == 2
    assert updated["draft"]["source_message_refs"] == ["m1", "m2"]
    with factory() as session:
        assert session.query(FounderDraftDB).count() == 1


def test_document_refinement_merges_into_canonical_definition_and_supersedes_duplicate(monkeypatch):
    factory = _factory(monkeypatch)
    definition = {
        "cognitive_outcome_id": "cognitive-definition", "completion_status": "completed", "work_target": "define system",
        "work_result": {"document_draft": {"title": "Foundation Definition（草稿）", "sections": {"core_responsibilities": ["evolve"], "boundaries": ["not runtime"]}}},
        "new_findings": [], "resolved_questions": [], "new_questions": [],
        "proposed_outcomes": [{"type": "document", "title": "Foundation Definition（草稿）"}], "narrative": "definition",
    }
    refinement = {
        "cognitive_outcome_id": "cognitive-refinement", "completion_status": "completed", "work_target": "refine evaluation",
        "work_result": {"evaluation_policy": {"weights": "dynamic"}},
        "new_findings": ["risk-aware weighting"], "resolved_questions": [], "new_questions": [],
        "proposed_outcomes": [{"type": "document", "title": "Foundation Definition supplement"}], "narrative": "refinement",
    }
    duplicate = {**refinement, "cognitive_outcome_id": "cognitive-duplicate"}
    with factory() as session:
        project = FounderProjectDB(id="project-child", system_id="founder_ai", name="Foundation System")
        conversation = ConversationDB(id="conv-canonical", system_id="founder_ai", project_id=project.id, title="planning")
        brain = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="project_planning", discovery={"cognitive_outcomes": [definition, refinement, duplicate], "discussion_maturity": {"maturity_status": "ready_for_review"}})
        session.add_all([project, conversation, brain,
            ConversationMessageDB(id="m-definition", conversation_id=conversation.id, role="assistant", content="definition", grounding={"cognitive_work": {"cognitive_outcome_id": "cognitive-definition"}}),
            ConversationMessageDB(id="m-refinement", conversation_id=conversation.id, role="assistant", content="refinement", grounding={"cognitive_work": {"cognitive_outcome_id": "cognitive-refinement"}}),
            ConversationMessageDB(id="m-duplicate", conversation_id=conversation.id, role="assistant", content="duplicate", grounding={"cognitive_work": {"cognitive_outcome_id": "cognitive-duplicate"}}),
        ]); session.commit()
    created = draft_service.sync_cognitive_outcome(conversation_id="conv-canonical", cognitive_outcome_ref="cognitive-definition")
    assert created["draft"]["version"] == 2
    assert created["draft"]["status"] == "ready_for_review"
    assert created["draft"]["source_cognitive_outcome_refs"] == ["cognitive-definition", "cognitive-refinement", "cognitive-duplicate"]
    assert created["draft"]["structured_content"]["refinements"][0]["content"] == {"evaluation_policy": {"weights": "dynamic"}}
    with factory() as session:
        assert session.query(FounderDraftDB).filter(FounderDraftDB.status != "archived").count() == 1


def test_confirmed_draft_projects_its_existing_implementation_plan(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as session:
        project = FounderProjectDB(id="project-child", system_id="founder_ai", name="Foundation System")
        conversation = ConversationDB(id="conv-canonical", system_id="founder_ai", project_id=project.id, title="planning")
        draft = FounderDraftDB(id="draft-canonical", title="System Definition", draft_type="system_definition", status="confirmed", project_id=project.id, project_name=project.name, source_conversation_id=conversation.id, source_cognitive_outcome_ref="cognitive-definition", version=3)
        brain = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="implementation_planning", discovery={"implementation_planning": {"plan_id": "plan-existing", "status": "ready_for_execution_review", "source_draft_id": draft.id, "source_draft_version": 3, "work_items": [{"work_item_id": "work-1"}, {"work_item_id": "work-2"}], "execution_approval": "pending"}})
        session.add_all([project, conversation, draft, brain]); session.commit()
    projected = draft_service.get_draft("draft-canonical")
    implementation = projected["implementation"]
    assert {key: implementation[key] for key in ("plan_id", "status", "source_draft_id", "source_draft_version", "work_item_count", "execution_approval", "execution_package")} == {"plan_id": "plan-existing", "status": "ready_for_execution_review", "source_draft_id": "draft-canonical", "source_draft_version": 3, "work_item_count": 2, "execution_approval": "pending", "execution_package": None}
    assert implementation["next_step"] == "审核实施方案"
    assert implementation["project_lifecycle"]["lifecycle_stage"] == "implementation_planning"
