from dataclasses import replace

from fastapi import HTTPException
import pytest

from app.founder_ai import api
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_events import append_event
import app.founder_ai.execution_registry as registry
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


def _package(*, allowed=True):
    package = build_execution_package(generate_task_asset_draft("Restore execution status"))
    return replace(package, execution_allowed=allowed)


def test_canonical_execution_status_endpoint_is_registered():
    paths = {route.path for route in api.router.routes}

    assert "/founder-ai/executions/{execution_id}/status" in paths


def test_execution_status_returns_timeline_and_runtime_timestamps(monkeypatch):
    session = ExecutionSession(
        "execution-1",
        "task-1",
        "package-1",
        status="testing",
        approved_at="2026-08-10T01:00:00+00:00",
        queued_at="2026-08-10T01:00:01+00:00",
        started_at="2026-08-10T01:00:02+00:00",
        testing_at="2026-08-10T01:00:03+00:00",
    )
    monkeypatch.setattr(api, "get_execution_session", lambda _execution_id: (session, _package()))

    response = api.get_founder_execution_status(session.id)

    assert response.status == "testing"
    assert response.queued_at == session.queued_at
    assert response.started_at == session.started_at
    assert response.timeline["approved"] == session.approved_at
    assert response.timeline["testing"] == session.testing_at


def test_execution_status_exposes_a_persisted_failure_reason(monkeypatch):
    session = ExecutionSession(
        "execution-failed",
        "task-1",
        "package-1",
        status="failed",
        completed_at="2026-08-10T01:00:04+00:00",
        error_message="Codex failed",
        failure_reason="Codex failed",
    )
    append_event(session, "codex_finished", status="executing", message="Codex exited", metadata={"exit_code": 1})
    append_event(session, "failed", status="failed", message="Execution failed", metadata={"last_event": session.events[-1]})
    monkeypatch.setattr(api, "get_execution_session", lambda _execution_id: (session, _package()))

    response = api.get_founder_execution_status(session.id)

    assert response.error_message == session.error_message
    assert response.failure_reason == "Codex failed"
    assert response.last_event["event_name"] == "codex_finished"
    assert response.events[-1]["event_name"] == "failed"
    assert response.timeline["failed"] == session.completed_at


def test_execution_status_exposes_paused_recovery(monkeypatch):
    session = ExecutionSession("execution-paused", "task-1", "package-1", status="paused", pause_reason="Backend restarted", recoverable=True)
    append_event(session, "backend_restarted", status="paused", message="Backend restarted")
    monkeypatch.setattr(api, "get_execution_session", lambda _execution_id: (session, _package()))

    response = api.get_founder_execution_status(session.id)

    assert response.status == "paused"
    assert response.pause_reason == "Backend restarted"
    assert response.recoverable is True
    assert response.last_event["event_name"] == "backend_restarted"


def test_resume_endpoint_restores_paused_execution(monkeypatch):
    session = ExecutionSession("execution-paused", "task-1", "package-1", status="queued")
    package = _package()
    queue_item = type("QueueItem", (), {"to_dict": lambda self: {"execution_id": session.id, "status": "queued"}})()
    monkeypatch.setattr(api, "resume_execution", lambda _execution_id: queue_item)
    monkeypatch.setattr(api, "get_execution_session", lambda _execution_id: (session, package))

    response = api.resume_founder_execution(session.id)

    assert response.status == "queued"
    assert response.queue["status"] == "queued"


def test_execution_status_returns_404_for_unknown_session(monkeypatch):
    monkeypatch.setattr(api, "get_execution_session", lambda _execution_id: None)

    with pytest.raises(HTTPException) as error:
        api.get_founder_execution_status("missing")

    assert error.value.status_code == 404


def test_execution_registry_restores_session_from_stable_runtime_file(monkeypatch, tmp_path):
    registry_path = tmp_path / "runtime" / "registry.json"
    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(registry_path))
    sessions_before = dict(registry._sessions)
    packages_before = dict(registry._packages)
    try:
        registry._sessions.clear()
        registry._packages.clear()
        session = ExecutionSession("execution-restored", "task-1", "package-1", status="queued", queued_at="2026-08-10T01:00:01+00:00")
        registry.save_execution_session(session, _package())
        registry._sessions.clear()
        registry._packages.clear()

        registry.load_execution_sessions()

        restored = registry.get_execution_session(session.id)
        assert restored is not None
        assert restored[0].status == "queued"
        assert restored[0].queued_at == session.queued_at
        assert restored[1].execution_allowed is True
    finally:
        registry._sessions.clear()
        registry._sessions.update(sessions_before)
        registry._packages.clear()
        registry._packages.update(packages_before)


def test_execution_registry_restores_reuse_prefixed_session(monkeypatch, tmp_path):
    registry_path = tmp_path / "runtime" / "registry.json"
    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(registry_path))
    sessions_before, packages_before = dict(registry._sessions), dict(registry._packages)
    try:
        registry._sessions.clear(); registry._packages.clear()
        session = ExecutionSession("reuse-execution-session-restored", "task-reuse", "package-reuse", status="completed")
        registry.save_execution_session(session, _package())
        registry._sessions.clear(); registry._packages.clear()
        registry.load_execution_sessions()
        restored = registry.get_execution_session(session.id)
        assert restored is not None and restored[0].status == "completed"
    finally:
        registry._sessions.clear(); registry._sessions.update(sessions_before)
        registry._packages.clear(); registry._packages.update(packages_before)


def test_registry_migrates_legacy_backend_restart_failure_to_paused(monkeypatch, tmp_path):
    registry_path = tmp_path / "runtime" / "registry.json"
    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(registry_path))
    sessions_before = dict(registry._sessions)
    packages_before = dict(registry._packages)
    try:
        registry._sessions.clear()
        registry._packages.clear()
        session = ExecutionSession(
            "execution-restarted",
            "task-1",
            "package-1",
            status="failed",
            started_at="2026-08-10T01:00:02+00:00",
            completed_at="2026-08-10T01:00:04+00:00",
            error_message="Backend restarted during execution; review state before retrying",
        )
        registry.save_execution_session(session, _package())
        registry._sessions.clear()
        registry._packages.clear()

        registry.load_execution_sessions()

        restored, _ = registry.get_execution_session(session.id)
        assert restored.status == "paused"
        assert restored.pause_reason == "Backend restarted"
        assert restored.recoverable is True
        assert restored.events[-1]["event_name"] == "backend_restarted"
    finally:
        registry._sessions.clear()
        registry._sessions.update(sessions_before)
        registry._packages.clear()
        registry._packages.update(packages_before)
