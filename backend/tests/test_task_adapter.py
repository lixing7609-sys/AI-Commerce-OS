from types import SimpleNamespace

from app.adapters.task_adapter import adapt_legacy_task, adapt_task_asset


def test_legacy_task_maps_to_task_view_model():
    task = SimpleNamespace(
        id="legacy-1",
        task_type="agent_build",
        status="running",
        payload={"title": "Build agent", "goal": "Create an agent", "scope": {"files": 3}},
        result={"summary": "in progress"},
    )

    view = adapt_legacy_task(task)

    assert view.to_dict() == {
        "id": "legacy-1",
        "title": "Build agent",
        "description": "Create an agent",
        "scope": {"files": 3},
        "status": "running",
        "approval_status": "pending",
        "execution_status": "running",
        "result": {"summary": "in progress"},
        "system_id": None,
        "conversation_id": None,
        "decision_id": None,
    }


def test_task_asset_maps_to_same_view_model_shape():
    task = SimpleNamespace(
        id="task-asset-1",
        system_id="founder_ai",
        conversation_id="conversation-1",
        decision_id="decision-1",
        title="Canonical task",
        description="Canonical description",
        scope={"component": "home"},
        status="draft",
        approval_status="approved",
        execution_status="completed",
        result={"artifact_id": "artifact-1"},
    )

    view = adapt_task_asset(task)

    assert view.title == "Canonical task"
    assert view.system_id == "founder_ai"
    assert view.conversation_id == "conversation-1"
    assert view.decision_id == "decision-1"
    assert view.execution_status == "completed"


def test_legacy_and_canonical_fields_are_consistent():
    legacy = adapt_legacy_task(
        {
            "id": "same-1",
            "task_type": "same",
            "status": "completed",
            "payload": {"title": "Same task", "description": "Same description", "scope": {"x": 1}},
            "result": {"ok": True},
            "system_id": "founder_ai",
            "conversation_id": "conversation-1",
            "decision_id": "decision-1",
            "approval_status": "approved",
            "execution_status": "completed",
        }
    )
    canonical = adapt_task_asset(
        {
            "id": "same-1",
            "system_id": "founder_ai",
            "conversation_id": "conversation-1",
            "decision_id": "decision-1",
            "title": "Same task",
            "description": "Same description",
            "scope": {"x": 1},
            "status": "completed",
            "approval_status": "approved",
            "execution_status": "completed",
            "result": {"ok": True},
        }
    )

    assert legacy.to_dict() == canonical.to_dict()


def test_unscoped_legacy_task_is_not_assigned_to_founder():
    view = adapt_legacy_task(
        {"id": "legacy-unscoped", "task_type": "legacy", "status": "pending", "payload": {}}
    )

    assert view.system_id is None
