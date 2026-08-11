from dataclasses import replace
from datetime import datetime, timezone
from types import SimpleNamespace

import app.founder_ai.asset_memory_center as center_module
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


def _record(**kwargs):
    defaults = {"created_at": datetime(2026, 8, 10, 11, 24, 40, tzinfo=timezone.utc), "status": "active"}
    return SimpleNamespace(**{**defaults, **kwargs})


def test_asset_memory_center_restores_historical_execution_chain(monkeypatch):
    execution_id = "execution-history1"
    task_id = "task-asset-history1"
    artifact_id = "artifact-history1"
    session = ExecutionSession(
        execution_id,
        task_id,
        "package-history1",
        status="completed",
        completed_at="2026-08-10T11:24:41+00:00",
        result={"exit_code": 0, "tests": ["npm test"]},
        commit_hash="commit-history1",
        artifact={"id": artifact_id, "files": ["frontend/src/App.jsx"]},
        memory={"decision": "memory-decision1", "learning": "memory-learning1", "execution_result": "memory-result1"},
    )
    package = replace(build_execution_package(generate_task_asset_draft("Build historical center")), execution_allowed=True)
    task = _record(id=task_id, title="Build historical center")
    artifact = _record(
        id=artifact_id,
        task_asset_id=task_id,
        artifact_type="execution_result",
        title="Historical result",
        description="Implemented and verified",
        content_ref='{"execution_id":"execution-history1","commit_hash":"commit-history1","files":["frontend/src/App.jsx"]}',
    )
    memories = [
        _record(id="memory-decision1", task_asset_id=None, artifact_id=None, memory_type="decision", title=f"Execution decision {execution_id}", content=f'{{"execution_id":"{execution_id}","decision":"Founder approved"}}', summary=None),
        _record(id="memory-learning1", task_asset_id=task_id, artifact_id=None, memory_type="learning", title=f"Execution learning {execution_id}", content=f'{{"execution_id":"{execution_id}","learning":"Keep history durable"}}', summary=None),
        _record(id="memory-result1", task_asset_id=task_id, artifact_id=artifact_id, memory_type="execution_result", title=f"Execution result {execution_id}", content='{"exit_code":0,"changed_files":["frontend/src/App.jsx"]}', summary=None),
    ]
    monkeypatch.setattr(center_module, "list_founder_task_assets", lambda: [task])
    monkeypatch.setattr(center_module, "list_founder_artifacts", lambda: [artifact])
    monkeypatch.setattr(center_module, "list_founder_memories", lambda: memories)
    monkeypatch.setattr(center_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(center_module, "get_execution_session", lambda _execution_id: (session, package))

    result = center_module.build_asset_memory_center()

    assert result["artifacts"][0]["execution_id"] == execution_id
    assert result["artifacts"][0]["task"] == "Build historical center"
    assert result["artifacts"][0]["related_files"] == ["frontend/src/App.jsx"]
    assert result["artifacts"][0]["verification_status"] == "passed"
    assert result["artifacts"][0]["commit_hash"] == "commit-history1"
    assert {item["memory_type"] for item in result["memories"]} == {"decision", "learning", "execution_result"}
    assert all(item["execution_id"] == execution_id for item in result["memories"])
    assert result["executions"][0]["artifacts"] == [artifact_id]
    assert set(result["executions"][0]["memories"]) == {"memory-decision1", "memory-learning1", "memory-result1"}


def test_asset_memory_center_keeps_unlinked_historical_assets_visible(monkeypatch):
    artifact = _record(id="artifact-unlinked", task_asset_id=None, artifact_type="document", title="Imported history", description=None, content_ref=None)
    monkeypatch.setattr(center_module, "list_founder_task_assets", lambda: [])
    monkeypatch.setattr(center_module, "list_founder_artifacts", lambda: [artifact])
    monkeypatch.setattr(center_module, "list_founder_memories", lambda: [])
    monkeypatch.setattr(center_module, "list_execution_sessions", lambda: [])

    result = center_module.build_asset_memory_center()

    assert result["artifacts"][0]["artifact_id"] == "artifact-unlinked"
    assert result["artifacts"][0]["execution_id"] is None
