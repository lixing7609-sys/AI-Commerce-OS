from types import SimpleNamespace

from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.session_lifecycle import (
    ACTUALLY_ACTIVE, LIFECYCLE_INCONSISTENT, RESUMABLE_PAUSED,
    STALE_PAUSED, TERMINAL, WAITING_READY, classify_session_lifecycle,
)


def classify(status, **kwargs):
    session = ExecutionSession("s", "task", "package", status=status, **kwargs)
    return classify_session_lifecycle(session)


def test_active_requires_queue_or_worker_ownership_not_only_status():
    session = ExecutionSession("s", "task", "package", status="executing", started_at="start")
    assert classify_session_lifecycle(session)["classification"] == LIFECYCLE_INCONSISTENT
    queue = SimpleNamespace(status="running")
    assert classify_session_lifecycle(session, queue_item=queue)["classification"] == ACTUALLY_ACTIVE


def test_created_and_approved_are_waiting_not_active():
    assert classify("created")["classification"] == WAITING_READY
    assert classify("approved")["classification"] == WAITING_READY
    assert not classify("approved")["actually_active"]


def test_paused_requires_complete_resume_evidence():
    stale = ExecutionSession("stale", "task", "package", status="paused", recoverable=True, pause_reason="Backend restarted")
    assert classify_session_lifecycle(stale, package=object())["classification"] == STALE_PAUSED
    resumable = ExecutionSession("resume", "task", "package", status="paused", recoverable=True, pause_reason="Founder delta accepted", handoff_id="h", action_contract_id="a", result={"incomplete_actions": ["x"], "resume_path": "resume action x"})
    assert classify_session_lifecycle(resumable, package=object())["classification"] == RESUMABLE_PAUSED


def test_terminal_and_task_session_inconsistency():
    assert classify("completed")["classification"] == TERMINAL
    paused = ExecutionSession("s", "task", "package", status="paused", started_at="start", recoverable=True)
    task = SimpleNamespace(status="draft", execution_status="not_started")
    result = classify_session_lifecycle(paused, package=object(), task=task)
    assert result["classification"] == STALE_PAUSED and result["lifecycle_inconsistent"] is True
    historical = ExecutionSession("historical", "task", "package", status="completed", started_at="start", completed_at="end")
    terminal = classify_session_lifecycle(historical, package=object(), task=task)
    assert terminal["classification"] == TERMINAL
    assert terminal["lifecycle_inconsistent"] is False
