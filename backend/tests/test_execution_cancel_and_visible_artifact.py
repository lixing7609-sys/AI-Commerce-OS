from types import SimpleNamespace
import pytest
from app.founder_ai.execution_cancel import callback_allowed, request_founder_cancel
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.visible_artifact import browser_gate

class DB:
    def __init__(self, task): self.task = task
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def get(self, *_): return self.task
    def scalar(self, *_): return None
    def commit(self): pass

def test_visible_ui_requires_real_browser_pass():
    assert browser_gate({"status": "PASS"})["completion_allowed"] is False
    assert browser_gate({"status": "FAIL", "hidden_without_query": True, "visible_with_query": True, "clears_input": True, "restores_full_list": True})["completion_allowed"] is False
    assert browser_gate({"status": "PASS", "hidden_without_query": True, "visible_with_query": True, "clears_input": True, "restores_full_list": True})["completion_allowed"] is True

def test_founder_stop_kills_owned_process_persists_and_is_idempotent(monkeypatch, tmp_path):
    session = ExecutionSession("execution-stop", "task-stop", "package-stop", status="executing", subprocess_pid=123)
    task = SimpleNamespace(conversation_id=None, status="in_progress", execution_status="executing", result={})
    monkeypatch.setattr("app.founder_ai.execution_cancel.get_execution_session", lambda _: (session, SimpleNamespace()))
    monkeypatch.setattr("app.founder_ai.execution_cancel.save_execution_session", lambda *_: None)
    monkeypatch.setattr("app.founder_ai.execution_cancel.SessionLocal", lambda: DB(task))
    monkeypatch.setattr("app.founder_ai.execution_cancel.subprocess.run", lambda *a, **k: SimpleNamespace(stdout=""))
    killed = []; result = request_founder_cancel("execution-stop", repo_root=tmp_path, killpg=lambda pid, sig: killed.append(pid))
    assert result["status"] == "cancelled" and result["working_tree_status"] == "clean" and killed == [123]
    assert session.failure_reason == "founder_emergency_stop" and callback_allowed("execution-stop") is False
    assert request_founder_cancel("execution-stop", repo_root=tmp_path)["idempotent"] is True

def test_cancel_preserves_unrelated_dirty_files(monkeypatch, tmp_path):
    session = ExecutionSession("execution-dirty", "task-dirty", "package-dirty", status="testing", result={"changed_files": ["owned.jsx"]})
    task = SimpleNamespace(conversation_id=None, status="in_progress", execution_status="testing", result={})
    monkeypatch.setattr("app.founder_ai.execution_cancel.get_execution_session", lambda _: (session, SimpleNamespace()))
    monkeypatch.setattr("app.founder_ai.execution_cancel.save_execution_session", lambda *_: None)
    monkeypatch.setattr("app.founder_ai.execution_cancel.SessionLocal", lambda: DB(task))
    monkeypatch.setattr("app.founder_ai.execution_cancel.subprocess.run", lambda *a, **k: SimpleNamespace(stdout=" M unrelated.txt\n"))
    result = request_founder_cancel("execution-dirty", repo_root=tmp_path)
    assert result["working_tree_status"] == "cancelled_with_unresolved_worktree" and result["unrelated_paths_preserved"] == ["unrelated.txt"]

def test_completed_execution_cannot_be_stopped(monkeypatch, tmp_path):
    session = ExecutionSession("execution-complete", "task", "package", status="completed")
    monkeypatch.setattr("app.founder_ai.execution_cancel.get_execution_session", lambda _: (session, SimpleNamespace()))
    with pytest.raises(ValueError, match="execution_not_cancellable"): request_founder_cancel("execution-complete", repo_root=tmp_path)
