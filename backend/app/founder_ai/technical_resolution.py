"""Safe autonomous diagnosis and resolution for local execution constraints."""
from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
from urllib.request import urlopen

from sqlalchemy import select

from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_registry import get_execution_session, list_actually_active_sessions, save_execution_session
from core.conversation_first.model import SinoBrainSessionDB

STALL_THRESHOLD_SECONDS = int(os.getenv("FOUNDER_EXECUTION_STALL_SECONDS", "180"))
DEFAULT_RETRY_BUDGET = int(os.getenv("FOUNDER_TECHNICAL_RESOLUTION_RETRY_BUDGET", "3"))
MEANINGFUL_EVENTS = {"queued", "worker_started", "codex_started", "codex_finished", "testing_started", "testing_finished", "artifact_saved", "memory_saved", "completed", "failed"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse(value: str | None):
    try: return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError): return None


def meaningful_progress_at(session) -> str | None:
    explicit = getattr(session, "meaningful_progress_at", None)
    if explicit: return explicit
    event = next((item for item in reversed(session.events or []) if item.get("event_name") in MEANINGFUL_EVENTS), None)
    return event.get("timestamp") if event else session.started_at or session.queued_at


def evaluate_stall(session, *, now: datetime | None = None, threshold_seconds: int = STALL_THRESHOLD_SECONDS) -> dict:
    current = now or datetime.now(timezone.utc); progress = _parse(meaningful_progress_at(session)); heartbeat = _parse(getattr(session, "worker_heartbeat_at", None))
    meaningful_age = max(0, int((current - progress).total_seconds())) if progress else None
    heartbeat_age = max(0, int((current - heartbeat).total_seconds())) if heartbeat else None
    running = session.status in {"queued", "executing", "testing"}
    stalled = bool(running and meaningful_age is not None and meaningful_age > threshold_seconds)
    return {"stalled": stalled, "threshold_seconds": threshold_seconds, "worker_heartbeat_at": getattr(session, "worker_heartbeat_at", None),
            "meaningful_progress_at": meaningful_progress_at(session), "meaningful_progress_age_seconds": meaningful_age,
            "worker_alive": bool(heartbeat_age is not None and heartbeat_age <= max(30, threshold_seconds)), "heartbeat_age_seconds": heartbeat_age}


def classify_subprocess_constraint(session) -> dict:
    result = dict(session.result or {}); text = f"{result.get('stderr') or ''}\n{result.get('stdout') or ''}".lower()
    denied = "permission denied" in text or "operation not permitted" in text or "not authorized" in text
    return {"issue_type": "LOCAL_OS_PERMISSION_DENIED" if denied else "EXECUTION_VERIFICATION_BLOCKED",
            "permission_denied": denied, "subprocess_exit_status": result.get("exit_code"),
            "evidence": "permission-denied evidence captured from owned subprocess output" if denied else "verification did not reach closure"}


def safe_repair_allowed(action: str, *, ownership_verified: bool = False) -> bool:
    if action in {"modify_macos_privacy", "full_disk_access", "sudo", "kill_unrelated_process", "destructive_git_reset"}: return False
    if action in {"delete_git_lock", "kill_process"}: return ownership_verified
    return action in {"application_health_endpoints", "service_registry", "execution_registry", "git_read_only", "repository_lock_read_only", "state_reconciliation"}


def _application_owned_health(repo_root: Path) -> dict:
    checks = {}
    for name, url in (("frontend", "http://127.0.0.1:5173/"), ("backend_database", "http://127.0.0.1:8000/health")):
        try:
            with urlopen(url, timeout=5) as response: checks[name] = {"status": "PASS", "http_status": response.status}
        except Exception as error: checks[name] = {"status": "FAIL", "reason": error.__class__.__name__}
    status = subprocess.run([str(repo_root / "scripts" / "dev-status")], cwd=repo_root, capture_output=True, text=True, timeout=15)
    checks["service_registry"] = {"status": "PASS" if status.returncode == 0 and "Healthy" in status.stdout else "FAIL", "evidence": status.stdout[-1000:]}
    git = subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, capture_output=True, text=True, timeout=10)
    checks["git_working_tree"] = {"status": "PASS" if git.returncode == 0 and not git.stdout.strip() else "FAIL", "dirty_paths": git.stdout.splitlines()}
    checks["git_lock"] = {"status": "PASS" if not (repo_root / ".git" / "index.lock").exists() else "FAIL", "deleted": False}
    checks["execution_lifecycle"] = {"status": "PASS", "actually_active_sessions": len(list_actually_active_sessions())}
    return {"status": "PASS" if all(item["status"] == "PASS" for item in checks.values()) else "FAIL", "checks": checks, "checked_at": _now(), "method": "application_owned_low_privilege_evidence"}


def build_resolution_contract(session, *, retry_budget: int = DEFAULT_RETRY_BUDGET) -> dict:
    constraint = classify_subprocess_constraint(session)
    return {**constraint, "affected_component": "local_development_health_verification", "severity": "recoverable",
            "safe_auto_repair": True, "repair_plan": ["avoid_privileged_cross_app_inspection", "use_application_owned_health_evidence", "reconcile_execution_state"],
            "rollback_plan": "none_required_read_only_checks", "retry_limit": retry_budget, "attempt_count": 0,
            "last_attempt": None, "resolution_status": "pending", "created_at": _now()}


def is_local_health_check_goal(goal: str) -> bool:
    text = (goal or "").lower()
    return "健康检查" in text and all(term in text for term in ("backend", "database", "worker", "git"))


def mark_stalled_execution(*, conversation_id: str, execution_id: str, stall_evidence: dict) -> dict:
    record = get_execution_session(execution_id)
    if record is None: raise LookupError("Execution session not found")
    session, package = record
    if session.technical_resolution and session.technical_resolution.get("resolution_status") in {"diagnosing", "retrying", "resolved"}:
        return session.technical_resolution
    contract = build_resolution_contract(session); contract.update({"issue_type": "STALLED_EXECUTION", "resolution_status": "diagnosing", "stall_evidence": stall_evidence})
    append_event(session, "stall_detected", status="stalled", message="Meaningful progress exceeded the execution stall threshold", metadata=stall_evidence)
    session.technical_resolution = contract; save_execution_session(session, package)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None: raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        route.update({"stall_detected": True, "execution_status": "self_healing", "technical_resolution_contract": contract,
                      "founder_gate_required": False, "manual_continue_count": 0, "manual_codex_instruction_count": 0})
        discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    return contract


def resolve_local_health_check(*, conversation_id: str, task_id: str, execution_id: str, repo_root: Path | None = None, retry_budget: int = DEFAULT_RETRY_BUDGET, health_runner=None) -> dict:
    root = (repo_root or Path(__file__).resolve().parents[3]).resolve(); record = get_execution_session(execution_id)
    if record is None: raise LookupError("Execution session not found")
    session, package = record; contract = build_resolution_contract(session, retry_budget=retry_budget)
    append_event(session, "technical_resolution_started", status="self_healing", message="Autonomous technical resolution started", metadata={"issue_type": contract["issue_type"]})
    session.technical_resolution = contract; save_execution_session(session, package)
    runner = health_runner or _application_owned_health; attempts = []
    for number in range(1, retry_budget + 1):
        evidence = runner(root); attempt = {"attempt": number, "action": "application_owned_low_privilege_health_check", "result": evidence["status"], "evidence": evidence, "timestamp": _now()}
        attempts.append(attempt); contract.update({"attempt_count": number, "last_attempt": attempt, "resolution_status": "resolved" if evidence["status"] == "PASS" else "retrying"})
        append_event(session, "technical_resolution_attempted", status="self_healing", message=f"Safe resolution attempt {number}: {evidence['status']}", metadata=attempt)
        session.technical_resolution = contract; save_execution_session(session, package)
        if evidence["status"] == "PASS": break
    resolved = contract["resolution_status"] == "resolved"
    contract.update({"attempts": attempts, "resolution_status": "resolved" if resolved else "exhausted", "completed_at": _now()})
    append_event(session, "technical_resolution_completed" if resolved else "technical_resolution_exhausted", status="completed" if resolved else "blocked",
                 message="Autonomous technical resolution completed" if resolved else "Autonomous technical resolution exhausted", metadata={"attempt_count": len(attempts)})
    session.technical_resolution = contract; session.meaningful_progress_at = _now(); save_execution_session(session, package)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None: raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        route.update({"founder_gate_required": False, "manual_continue_count": 0, "manual_codex_instruction_count": 0,
                      "stall_detected": True, "health_check_resumed": True, "technical_resolution_contract": contract,
                      "current_step": "complete" if resolved else "verification", "execution_status": "completed" if resolved else "technical_blocker"})
        route.pop("technical_blocker", None)
        execution = dict(route.get("autonomous_execution") or {}); execution.update({"dispatch_status": "completed" if resolved else "technical_blocker",
            "verification": {"status": "PASS" if resolved else "BLOCKED", "health_check": attempts[-1]["evidence"] if attempts else None},
            "checkpoint": {"status": "NOT_REQUIRED", "reason": "read_only_health_check_no_changed_files"}})
        route["autonomous_execution"] = execution; discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc)
        task = db.get(TaskAssetDB, task_id)
        if task:
            task.status = "completed" if resolved else "blocked"; task.execution_status = "completed" if resolved else "blocked"
            task.result = {"status": "completed" if resolved else "technical_blocker", "technical_resolution": contract, "verification": execution["verification"]}
        db.commit()
    return contract
