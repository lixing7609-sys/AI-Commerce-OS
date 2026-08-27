from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_registry import save_execution_session
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.technical_resolution import (
    check_execution_liveness, classify_subprocess_constraint, evaluate_stall, is_local_health_check_goal, resolve_local_health_check, safe_repair_allowed,
)


def _package(conversation_id):
    return ExecutionPackage(goal="local health", context={}, task_asset=TaskAssetDraft(title="health", description="health", scope={}, constraints=[], risk="low", approval_required=False, conversation_id=conversation_id), constraints=[], verification=[], commit_requirement="not_required", execution_allowed=True)


def test_worker_heartbeat_and_live_owned_subprocess_prevent_false_stall():
    now = datetime.now(timezone.utc); old = (now - timedelta(minutes=10)).isoformat()
    session = ExecutionSession(id="stall-heartbeat", task_asset_id="task", execution_package_id="package", status="executing",
        started_at=old, meaningful_progress_at=old, worker_heartbeat_at=now.isoformat(), subprocess_pid=123,
        subprocess_activity_at=now.isoformat(), expected_long_running_operation="codex_execution", expected_operation_timeout_seconds=900)
    evidence = evaluate_stall(session, now=now, threshold_seconds=180, process_checker=lambda _: True)
    assert evidence["worker_alive"] is True
    assert evidence["subprocess_alive"] is True
    assert evidence["stalled"] is False


def test_true_stall_requires_unhealthy_worker_and_missing_subprocess():
    now = datetime.now(timezone.utc); old = (now - timedelta(minutes=10)).isoformat()
    session = ExecutionSession(id="true-stall", task_asset_id="task", execution_package_id="package", status="executing",
        started_at=old, meaningful_progress_at=old, worker_heartbeat_at=old, subprocess_pid=123)
    evidence = evaluate_stall(session, now=now, threshold_seconds=180, process_checker=lambda _: False)
    assert evidence["worker_alive"] is False
    assert evidence["subprocess_alive"] is False
    assert evidence["stalled"] is True


def test_finished_subprocess_without_next_pipeline_event_becomes_explicit_stall():
    now = datetime.now(timezone.utc); old = (now - timedelta(minutes=10)).isoformat()
    session = ExecutionSession(
        id="pipeline-stall", task_asset_id="task", execution_package_id="package", status="executing",
        started_at=old, subprocess_exit_status=0,
        events=[{"event_name": "codex_finished", "timestamp": old}],
    )
    evidence = evaluate_stall(session, now=now, threshold_seconds=180, process_checker=lambda _: False)
    assert evidence["stalled"] is True
    assert evidence["subprocess_alive"] is False


def test_watchdog_waits_for_live_process_and_requeues_missing_dead_owner():
    now = datetime.now(timezone.utc); old = (now - timedelta(minutes=20)).isoformat()
    live = ExecutionSession(id="live", task_asset_id="task", execution_package_id="package", status="executing", started_at=old, meaningful_progress_at=old, worker_heartbeat_at=now.isoformat(), subprocess_pid=123, subprocess_activity_at=now.isoformat())
    assert check_execution_liveness(live, now=now, process_checker=lambda _: True)["action"] == "wait"
    stale_heartbeat_live_process = ExecutionSession(id="live-stale-heartbeat", task_asset_id="task", execution_package_id="package", status="executing", started_at=old, meaningful_progress_at=old, worker_heartbeat_at=old, subprocess_pid=123, subprocess_activity_at=now.isoformat())
    assert check_execution_liveness(stale_heartbeat_live_process, now=now, process_checker=lambda _: True)["action"] == "wait"
    dead = ExecutionSession(id="dead", task_asset_id="task", execution_package_id="package", status="executing", started_at=old, meaningful_progress_at=old, worker_heartbeat_at=old, subprocess_pid=123)
    assert check_execution_liveness(dead, now=now, process_checker=lambda _: False)["action"] == "requeue"


def test_watchdog_blocks_unrecoverable_stall_instead_of_leaving_it_active():
    now = datetime.now(timezone.utc); old = (now - timedelta(minutes=20)).isoformat()
    session = ExecutionSession(id="partial", task_asset_id="task", execution_package_id="package", status="testing", started_at=old, meaningful_progress_at=old, worker_heartbeat_at=old, result={"changed_files": ["app.py"]})
    decision = check_execution_liveness(session, now=now, process_checker=lambda _: False)
    assert decision["action"] == "block"
    assert "cannot be safely replayed" in decision["reason"]


def test_pending_authorization_is_not_a_stall():
    now = datetime.now(timezone.utc); old = (now - timedelta(minutes=10)).isoformat()
    session = ExecutionSession(id="auth-wait", task_asset_id="task", execution_package_id="package", status="executing",
        started_at=old, meaningful_progress_at=old, worker_heartbeat_at=old, pending_codex_authorization={"decision": "escalate"})
    evidence = evaluate_stall(session, now=now, threshold_seconds=180, process_checker=lambda _: False)
    assert evidence["pending_authorization"] is True
    assert evidence["stalled"] is False


def test_permission_denied_is_a_technical_environment_constraint():
    session = ExecutionSession(id="permission", task_asset_id="task", execution_package_id="package", status="completed",
        result={"exit_code": 0, "stderr": "browser launch failed: Operation not permitted"})
    result = classify_subprocess_constraint(session)
    assert result["issue_type"] == "LOCAL_OS_PERMISSION_DENIED"
    assert result["permission_denied"] is True
    assert is_local_health_check_goal("检查 Founder frontend、Backend、Database、Worker、Execution Lifecycle 和 Git Working Tree 健康检查") is True
    assert is_local_health_check_goal("给能力仓库增加搜索") is False


def test_safe_repair_policy_never_changes_os_or_unknown_ownership():
    assert safe_repair_allowed("application_health_endpoints") is True
    assert safe_repair_allowed("modify_macos_privacy") is False
    assert safe_repair_allowed("kill_unrelated_process") is False
    assert safe_repair_allowed("delete_git_lock", ownership_verified=False) is False
    assert safe_repair_allowed("delete_git_lock", ownership_verified=True) is True


def test_resolution_retries_then_resumes_same_lineage_without_founder_action(tmp_path: Path):
    conversation_id = f"conv-resolution-{uuid4().hex[:10]}"; task_id = f"task-resolution-{uuid4().hex[:10]}"; execution_id = f"execution-resolution-{uuid4().hex[:10]}"
    with SessionLocal() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Path E fixture"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="standard_task", source_message_refs=[], discovery={"task_complexity_route": {"classification": "STANDARD_TASK", "current_step": "verification", "execution_status": "blocked", "founder_gate_required": False, "manual_continue_count": 0, "manual_codex_instruction_count": 0, "autonomous_execution": {"task_id": task_id, "execution_session_id": execution_id}}}))
        db.add(TaskAssetDB(id=task_id, system_id="founder_ai", conversation_id=conversation_id, title="health", description="health", scope={}, status="in_progress", approval_status="not_required", execution_status="blocked"))
        db.commit()
    session = ExecutionSession(id=execution_id, task_asset_id=task_id, execution_package_id="package", status="completed", result={"exit_code": 0, "stderr": "Permission denied", "changed_files": []})
    save_execution_session(session, _package(conversation_id)); calls = []
    def runner(_root):
        calls.append(1); return {"status": "FAIL" if len(calls) == 1 else "PASS", "checks": {}, "method": "fixture"}
    try:
        result = resolve_local_health_check(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, repo_root=tmp_path, retry_budget=3, health_runner=runner)
        assert result["resolution_status"] == "resolved" and result["attempt_count"] == 2
        with SessionLocal() as db:
            route = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id)).discovery["task_complexity_route"]
            assert route["execution_status"] == "completed" and route["health_check_resumed"] is True
            assert route["founder_gate_required"] is False and route["manual_continue_count"] == 0
    finally:
        with SessionLocal() as db:
            db.query(TaskAssetDB).filter_by(id=task_id).delete(); db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).delete(); db.query(ConversationDB).filter_by(id=conversation_id).delete(); db.commit()


def test_retry_budget_exhaustion_becomes_technical_blocker(tmp_path: Path):
    conversation_id = f"conv-exhaust-{uuid4().hex[:10]}"; task_id = f"task-exhaust-{uuid4().hex[:10]}"; execution_id = f"execution-exhaust-{uuid4().hex[:10]}"
    with SessionLocal() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Path E exhausted")); db.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="standard_task", source_message_refs=[], discovery={"task_complexity_route": {"classification": "STANDARD_TASK", "founder_gate_required": False}})); db.add(TaskAssetDB(id=task_id, system_id="founder_ai", conversation_id=conversation_id, title="health", description="health", scope={}, status="in_progress", approval_status="not_required", execution_status="blocked")); db.commit()
    save_execution_session(ExecutionSession(id=execution_id, task_asset_id=task_id, execution_package_id="package", status="completed", result={"stderr": "Permission denied"}), _package(conversation_id))
    try:
        result = resolve_local_health_check(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, repo_root=tmp_path, retry_budget=2, health_runner=lambda _: {"status": "FAIL", "checks": {}})
        assert result["resolution_status"] == "exhausted" and result["attempt_count"] == 2
        with SessionLocal() as db:
            route = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id)).discovery["task_complexity_route"]
            assert route["execution_status"] == "technical_blocker" and route["founder_gate_required"] is False
    finally:
        with SessionLocal() as db:
            db.query(TaskAssetDB).filter_by(id=task_id).delete(); db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).delete(); db.query(ConversationDB).filter_by(id=conversation_id).delete(); db.commit()
