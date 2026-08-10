import json
from types import SimpleNamespace

from app.founder_ai import sino_memory
from app.founder_ai.sino_memory import SinoMemoryRepository


def test_sino_memory_contract_persists_supported_types(monkeypatch):
    calls = []
    monkeypatch.setattr(sino_memory, "create_memory", lambda **kwargs: calls.append(kwargs) or SimpleNamespace(id="memory-1"))
    repository = SinoMemoryRepository()
    repository.save_decision(title="Architecture", decision={"choice": "provider boundary"}, conversation_id="conversation-1")
    repository.save_learning(title="Execution learning", learning={"result": "passed"}, task_asset_id="task-1")
    repository.save_project_state(title="Current state", project_state={"current_phase": "execution"})
    repository.save_execution_result(title="Codex result", result={"status": "completed"}, task_asset_id="task-1")

    assert [call["memory_type"] for call in calls] == ["decision", "learning", "project_state", "execution_result"]
    assert json.loads(calls[0]["content"])["choice"] == "provider boundary"
    assert calls[3]["task_asset_id"] == "task-1"
