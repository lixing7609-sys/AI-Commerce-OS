from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.task_asset.model import TaskAssetDB
from app.core.conversation_first.model import SinoBrainSessionDB
import app.core.task_asset.service as task_asset_service
import app.core.conversation.service as conversation_service
import app.core.founder_object.service as object_service
import app.founder_ai.action_queue as action_queue
from core.founder_object.model import FounderObjectDB


def add_object(factory, conversation_id, object_type, name, status="draft", source_candidate_id=None, source_message_refs=None):
    with factory() as session:
        item = FounderObjectDB(object_type=object_type, name=name, normalized_name=object_service._normalize_name(name), description="original", status=status, source_conversation_id=conversation_id, source_candidate_id=source_candidate_id, source_message_refs=source_message_refs or [], scope_key="founder_ai")
        session.add(item); session.commit(); session.refresh(item)
        return item.id


def _install_sqlite(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(task_asset_service, "SessionLocal", factory)
    monkeypatch.setattr(action_queue, "SessionLocal", factory)
    return factory


def add_brain(factory, conversation_id, project_id=None, queue=None):
    with factory() as session:
        state = session.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).one_or_none()
        if state is None:
            state = SinoBrainSessionDB(conversation_id=conversation_id)
            session.add(state)
        state.project_id = project_id
        state.discovery = {"founder_action_queue": queue or []}
        session.commit()


def test_action_queue_projects_draft_object_approval_once(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation = conversation_service.create_conversation(title="Queue object approval")
    add_brain(factory, conversation.id, project_id="project-1")
    object_id = add_object(factory, conversation.id, "task", "待批准任务对象", "draft")

    first = action_queue.sync_founder_action_queue(conversation.id)
    second = action_queue.sync_founder_action_queue(conversation.id)

    pending = [item for item in second if item["status"] == "pending" and item["action_type"] == "OBJECT_APPROVAL"]
    assert len(pending) == 1
    assert pending[0]["object_id"] == object_id
    assert pending[0]["source_type"] == "founder_object"
    assert pending[0]["source_id"] == object_id
    assert pending[0]["risk_level"] == "MEDIUM"
    assert len([item for item in first if item["action_type"] == "OBJECT_APPROVAL"]) == 1


def test_action_queue_resolves_object_approval_after_inline_approval(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation = conversation_service.create_conversation(title="Queue object resolved")
    add_brain(factory, conversation.id)
    object_id = add_object(factory, conversation.id, "decision", "第一阶段决策", "draft")
    action_queue.sync_founder_action_queue(conversation.id)

    object_service.approve_object(object_id)
    queue = action_queue.sync_founder_action_queue(conversation.id)

    assert not [item for item in queue if item["action_type"] == "OBJECT_APPROVAL" and item["status"] == "pending"]
    assert [item for item in queue if item["action_type"] == "OBJECT_APPROVAL" and item["status"] == "completed"]


def test_action_queue_projects_execution_approval_and_start_without_duplicates(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation = conversation_service.create_conversation(title="Queue task actions")
    add_brain(factory, conversation.id)
    with factory() as session:
        session.add(TaskAssetDB(id="task-pending", system_id="founder_ai", conversation_id=conversation.id, title="待审批任务", scope={}, status="draft", approval_status="pending", execution_status="not_started"))
        session.add(TaskAssetDB(id="task-approved", system_id="founder_ai", conversation_id=conversation.id, title="待开始任务", scope={}, status="draft", approval_status="approved", execution_status="not_started"))
        session.commit()

    first = action_queue.sync_founder_action_queue(conversation.id)
    second = action_queue.sync_founder_action_queue(conversation.id)

    approvals = [item for item in second if item["action_type"] == "EXECUTION_APPROVAL" and item["status"] == "pending"]
    starts = [item for item in second if item["action_type"] == "EXECUTION_START" and item["status"] == "pending"]
    assert len(approvals) == 1 and approvals[0]["task_id"] == "task-pending"
    assert len(starts) == 1 and starts[0]["task_id"] == "task-approved"
    assert len([item for item in first if item["status"] == "pending"]) == 2


def test_action_queue_resolves_stale_task_items_from_canonical_state(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation = conversation_service.create_conversation(title="Queue stale resolution")
    add_brain(factory, conversation.id, queue=[
        {"action_id": "execution-approval:task-1", "action_type": "EXECUTION_APPROVAL", "type": "EXECUTION_APPROVAL", "status": "pending", "source_type": "task_asset", "source_id": "task-1", "task_id": "task-1"},
        {"action_id": "execution-start:task-2", "action_type": "EXECUTION_START", "type": "EXECUTION_START", "status": "pending", "source_type": "task_asset", "source_id": "task-2", "task_id": "task-2"},
    ])
    with factory() as session:
        session.add(TaskAssetDB(id="task-1", system_id="founder_ai", conversation_id=conversation.id, title="已审批任务", scope={}, status="draft", approval_status="approved", execution_status="not_started"))
        session.add(TaskAssetDB(id="task-2", system_id="founder_ai", conversation_id=conversation.id, title="已启动任务", scope={"execution_start": {"execution_id": "execution-1"}}, status="in_progress", approval_status="approved", execution_status="queued"))
        session.commit()

    queue = action_queue.sync_founder_action_queue(conversation.id)

    assert not [item for item in queue if item["action_type"] == "EXECUTION_APPROVAL" and item["status"] == "pending"]
    assert len([item for item in queue if item["action_type"] == "EXECUTION_START" and item["status"] == "pending"]) == 1
    assert [item for item in queue if item["source_id"] == "task-2" and item["status"] == "completed"]


def test_action_queue_global_aggregation_keeps_conversation_lineage(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation_a = conversation_service.create_conversation(title="Queue A")
    conversation_b = conversation_service.create_conversation(title="Queue B")
    add_brain(factory, conversation_a.id)
    add_brain(factory, conversation_b.id)
    object_a = add_object(factory, conversation_a.id, "decision", "A 决策", "draft")
    with factory() as session:
        session.add(TaskAssetDB(id="task-b", system_id="founder_ai", conversation_id=conversation_b.id, title="B 任务", scope={}, status="draft", approval_status="approved", execution_status="not_started"))
        session.commit()

    all_items = action_queue.list_founder_action_queue()
    a_items = action_queue.list_founder_action_queue(conversation_a.id)

    assert {item["conversation_id"] for item in all_items} == {conversation_a.id, conversation_b.id}
    assert len(a_items) == 1
    assert a_items[0]["object_id"] == object_a


def test_conversation_recognizes_updates_and_approves_real_skill(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Object Approval must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Object Approval must not create Execution")), raising=False)

    conversation = conversation_service.create_conversation(title="Object Native Test")
    objects = object_service.recognize_objects(conversation.id, "message-one", "我们需要开发一个 Chrome Extension Skill，用来处理浏览器端的数据获取。")
    skill = next(item for item in objects if item["object_type"] == "skill")
    assert skill["name"] == "Chrome Extension Skill"
    assert skill["status"] == "draft"
    object_service.attach_object_context(skill["object_id"], conversation.id)
    context = object_service.get_conversation_context_object(conversation.id)
    assert context["object_id"] == skill["object_id"]
    updated = object_service.recognize_objects(conversation.id, "message-two", "继续开发这个 Chrome Extension Skill，并增加结构化数据获取。")
    revised = next(item for item in updated if item["object_id"] == skill["object_id"])
    assert revised["version"] == 2
    assert len(object_service.get_object(skill["object_id"])["revisions"]) == 1
    persisted_context = object_service.get_conversation_context_object(conversation.id)
    assert persisted_context["object_id"] == skill["object_id"]
    assert persisted_context["version"] == 2
    assert len(persisted_context["revisions"]) == 1
    approved = object_service.approve_object(skill["object_id"])
    assert approved["status"] == "approved"
    assert approved["execution_refs"] == []
    approved_again = object_service.approve_object(skill["object_id"])
    assert approved_again["execution_refs"] == approved["execution_refs"]
    assert any(item["object_id"] == skill["object_id"] for item in object_service.list_founder_objects())
    restored = object_service.attach_object_context(skill["object_id"], "conv-deleted-test-fixture")
    assert restored["context_conversation_id"] == conversation.id


def test_approve_task_object_is_status_only_without_taskasset_or_execution(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Object Approval must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Object Approval must not create Execution")), raising=False)
    conversation = conversation_service.create_conversation(title="Task object approval")
    object_id = add_object(factory, conversation.id, "task", "生成落地页 Agent", "draft")
    approved = object_service.approve_object(object_id)
    assert approved["status"] == "approved"
    assert approved["object_type"] == "task"
    assert approved["execution_refs"] == []
    approved_again = object_service.approve_object(object_id)
    assert approved_again["status"] == "approved"
    assert approved_again["execution_refs"] == []


def test_approve_decision_object_is_status_only_without_taskasset_or_execution(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Object Approval must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Object Approval must not create Execution")), raising=False)
    conversation = conversation_service.create_conversation(title="Decision object approval")
    object_id = add_object(factory, conversation.id, "decision", "第一阶段平台决策", "draft")
    approved = object_service.approve_object(object_id)
    assert approved["status"] == "approved"
    assert approved["object_type"] == "decision"
    assert approved["execution_refs"] == []


def test_continue_discussion_keeps_draft_object_without_execution_side_effects(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Continue Discussion must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Continue Discussion must not create Execution")), raising=False)
    conversation = conversation_service.create_conversation(title="Continue draft")
    object_id = add_object(factory, conversation.id, "task", "继续讨论任务对象", "draft")
    restored = object_service.attach_object_context(object_id, conversation.id)
    unchanged = object_service.get_object(object_id)
    assert restored["context_conversation_id"] == conversation.id
    assert unchanged["status"] == "draft"
    assert unchanged["execution_refs"] == []


def test_approved_task_object_creates_safe_task_asset_once(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("Task bridge must not create Execution")), raising=False)
    monkeypatch.setattr(object_service, "start_prepared_standard_task", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Task bridge must not start execution")), raising=False)
    monkeypatch.setattr(object_service, "authorize_codex_request", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("Task bridge must not call Codex")), raising=False)
    conversation = conversation_service.create_conversation(title="Bridge task object")
    object_id = add_object(factory, conversation.id, "task", "生成落地页 Agent", "approved", source_candidate_id="candidate-task", source_message_refs=["message-task"])

    first = object_service.create_task_asset_from_object(object_id)
    second = object_service.create_task_asset_from_object(object_id)

    assert first["created"] is True
    assert second["reused"] is True
    assert second["task_id"] == first["task_id"]
    assert first["status"] == "draft"
    assert first["approval_status"] == "pending"
    assert first["execution_status"] == "not_started"
    with factory() as session:
        tasks = session.query(TaskAssetDB).all()
        obj = session.get(FounderObjectDB, object_id)
    assert len(tasks) == 1
    bridge = tasks[0].scope["founder_object_bridge"]
    assert bridge["created_from"] == "founder_object_bridge"
    assert bridge["source_founder_object_id"] == object_id
    assert bridge["source_candidate_id"] == "candidate-task"
    assert bridge["source_conversation_id"] == conversation.id
    assert bridge["source_message_refs"] == ["message-task"]
    assert bridge["object_version"] == 1
    assert obj.execution_refs == []
    restored = object_service.get_object(object_id)
    assert restored["task_asset_ref"]["task_id"] == first["task_id"]
    assert restored["task_asset_ref"]["execution_status"] == "not_started"


def test_task_bridge_rejects_draft_task_object(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation = conversation_service.create_conversation(title="Draft task bridge")
    object_id = add_object(factory, conversation.id, "task", "未批准任务对象", "draft")
    try:
        object_service.create_task_asset_from_object(object_id)
    except ValueError as error:
        assert "approved" in str(error)
    else:
        raise AssertionError("draft task object must not create TaskAsset")
    with factory() as session:
        assert session.query(TaskAssetDB).count() == 0


def test_task_bridge_rejects_decision_object(monkeypatch):
    factory = _install_sqlite(monkeypatch)
    conversation = conversation_service.create_conversation(title="Decision bridge")
    object_id = add_object(factory, conversation.id, "decision", "第一阶段平台决策", "approved")
    try:
        object_service.create_task_asset_from_object(object_id)
    except ValueError as error:
        assert "task objects" in str(error)
    else:
        raise AssertionError("decision object must not create TaskAsset")
    with factory() as session:
        assert session.query(TaskAssetDB).count() == 0


def test_same_semantic_object_is_reused_across_unbound_conversations(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    first = conversation_service.create_conversation(title="First")
    second = conversation_service.create_conversation(title="Second")
    first_object = object_service.recognize_objects(first.id, "m1", "需要开发 Chrome Extension Skill")[0]
    second_object = object_service.recognize_objects(second.id, "m2", "继续开发 Chrome Extension Skill")[0]
    assert first_object["object_id"] == second_object["object_id"]
    assert second_object["version"] == 2


def test_context_discussion_creates_real_related_capability_and_can_detach(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    conversation = conversation_service.create_conversation(title="Context relation")
    skill = object_service.recognize_objects(conversation.id, "m1", "需要开发 Chrome Extension Skill")[0]
    object_service.attach_object_context(skill["object_id"], conversation.id)
    result = object_service.recognize_objects(conversation.id, "m2", "需要增加 Browser Session Capability 来支持浏览器会话处理")
    capability = next(item for item in result if item["object_type"] == "capability")
    updated_skill = object_service.get_object(skill["object_id"])
    assert capability["name"] == "Browser Session"
    assert capability["object_id"] in updated_skill["dependency_object_ids"]
    assert skill["object_id"] in object_service.get_object(capability["object_id"])["related_object_ids"]
    object_service.detach_object_context(conversation.id)
    assert object_service.get_conversation_context_object(conversation.id) is None
