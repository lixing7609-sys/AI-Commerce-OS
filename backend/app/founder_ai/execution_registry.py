from dataclasses import asdict, replace
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
from threading import RLock
from uuid import uuid4

from .execution_loop import ExecutionSession
from .execution_events import append_event, migrate_legacy_events, migrate_restart_failure
from .session_lifecycle import classify_session_lifecycle
from .orchestrator import ExecutionPackage, TaskAssetDraft
from app.core.model_center.service import resolve_execution_capability

_sessions: dict[str, ExecutionSession] = {}
_packages: dict[str, ExecutionPackage] = {}
_lock = RLock()


def _registry_path() -> Path:
    configured = os.getenv("FOUNDER_EXECUTION_REGISTRY_PATH")
    return Path(configured).resolve() if configured else Path(__file__).resolve().parents[3] / ".founder-execution" / "registry.json"


def _package_from_dict(data: dict) -> ExecutionPackage:
    return ExecutionPackage(**{**data, "task_asset": TaskAssetDraft(**data["task_asset"])})


def _session_from_dict(data: dict) -> ExecutionSession:
    normalized = dict(data)
    if not normalized.get("created_at"):
        normalized["created_at"] = normalized.get("started_at") or normalized.get("completed_at") or "1970-01-01T00:00:00+00:00"
    return ExecutionSession(**normalized)


def _session_path(execution_id: str) -> Path:
    return _registry_path().parent / "sessions" / f"{execution_id}.json"


def _persist(execution_id: str) -> None:
    path = _session_path(execution_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    payload = {"session": asdict(_sessions[execution_id]), "package": asdict(_packages[execution_id])}
    temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def load_execution_sessions() -> None:
    sessions = {}
    packages = {}
    migrated = set()
    path = _registry_path()
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            legacy_sessions = {key: _session_from_dict(value) for key, value in payload.get("sessions", {}).items() if not _session_path(value.get("id") or key).exists()}
            for session in legacy_sessions.values():
                migrate_legacy_events(session)
                if migrate_restart_failure(session): migrated.add(session.id)
            sessions.update(legacy_sessions)
            packages.update({key: _package_from_dict(value) for key, value in payload.get("packages", {}).items()})
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass
    for item in sorted((path.parent / "sessions").glob("*.json")):
        try:
            payload = json.loads(item.read_text(encoding="utf-8"))
            session = _session_from_dict(payload["session"])
            migrate_legacy_events(session)
            if migrate_restart_failure(session): migrated.add(session.id)
            package = _package_from_dict(payload["package"])
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
        sessions[session.id] = session
        packages[session.id] = package
    with _lock:
        _sessions.update(sessions)
        _packages.update(packages)
        for execution_id in migrated:
            if execution_id in _packages:
                _persist(execution_id)


def save_execution_session(session: ExecutionSession, package: ExecutionPackage | None = None) -> None:
    with _lock:
        _sessions[session.id] = session
        if package is not None:
            _packages[session.id] = package
        if session.id in _packages:
            _persist(session.id)


def create_execution_session(task_asset_id: str, package: ExecutionPackage) -> ExecutionSession:
    execution = resolve_execution_capability()
    engine_id = execution.get("execution_engine_id")
    if not engine_id:
        raise RuntimeError("execution_engine_not_available")
    session = ExecutionSession(
        id=f"execution-{uuid4().hex[:16]}",
        task_asset_id=task_asset_id,
        execution_package_id=f"package-{uuid4().hex[:16]}",
        executor=engine_id,
    )
    from .codex_authorization import build_authorization_envelope
    session.authorization_envelope = build_authorization_envelope(task_asset_id, session.id, package)
    save_execution_session(session, package)
    return session


def authorize_codex_request(execution_id: str, request: dict) -> dict:
    """Evaluate and persist one idempotent Codex operation request."""
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Execution session not found")
    session, package = record
    from .codex_authorization import build_authorization_envelope, evaluate_codex_request
    session.authorization_envelope = session.authorization_envelope or build_authorization_envelope(session.task_asset_id, session.id, package)
    requested_id = request.get("request_id")
    if requested_id:
        existing = next((item for item in session.authorization_audit if item.get("request_id") == requested_id), None)
        if existing:
            return existing
    decision = evaluate_codex_request(request, session.authorization_envelope)
    session.authorization_audit.append(decision)
    if decision["founder_action_required"]:
        session.pending_codex_authorization = decision
    save_execution_session(session, package)
    return decision


def apply_codex_founder_authorization(execution_id: str, approved_scope: dict) -> dict:
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Execution session not found")
    session, package = record
    from .codex_authorization import apply_founder_scope, build_authorization_envelope
    envelope = session.authorization_envelope or build_authorization_envelope(session.task_asset_id, session.id, package)
    session.authorization_envelope = apply_founder_scope(envelope, approved_scope)
    session.pending_codex_authorization = None
    save_execution_session(session, package)
    return session.authorization_envelope


def create_controlled_handoff_session(*, session_id: str, handoff_id: str, package_id: str, readiness_contract_id: str, scope_fingerprint: str, executor_provider: str, package: ExecutionPackage) -> ExecutionSession:
    """Persist one inert session; no approval, queue, worker, or adapter is invoked."""
    with _lock:
        existing = next((item for item in _sessions.values() if item.handoff_id == handoff_id), None)
        if existing:
            if existing.scope_fingerprint != scope_fingerprint or existing.execution_package_id != package_id:
                raise ValueError("handoff_scope_mismatch")
            return existing
        session = ExecutionSession(
            id=session_id, task_asset_id=package_id, execution_package_id=package_id,
            executor=executor_provider, status="created", handoff_id=handoff_id,
            readiness_contract_id=readiness_contract_id, scope_fingerprint=scope_fingerprint,
        )
        _sessions[session.id] = session
        _packages[session.id] = package
        _persist(session.id)
        return session


def create_controlled_handoff_session_v2(*, session_id: str, handoff_id: str, package_id: str, readiness_contract_id: str, action_contract_id: str, action_contract_fingerprint: str, scope_fingerprint: str, executor_provider: str, package: ExecutionPackage) -> ExecutionSession:
    """Persist one inert v2 session that freezes a machine-action contract."""
    with _lock:
        existing = _sessions.get(session_id)
        if existing:
            if existing.handoff_id != handoff_id or existing.action_contract_fingerprint != action_contract_fingerprint:
                raise ValueError("handoff_v2_scope_mismatch")
            return existing
        session = ExecutionSession(
            id=session_id, task_asset_id=package_id, execution_package_id=package_id,
            executor=executor_provider, status="created", handoff_id=handoff_id,
            readiness_contract_id=readiness_contract_id, scope_fingerprint=scope_fingerprint,
            session_version=2, action_contract_id=action_contract_id,
            action_contract_fingerprint=action_contract_fingerprint,
        )
        _sessions[session.id] = session
        _packages[session.id] = package
        _persist(session.id)
        return session


def approve_execution_session(execution_id: str) -> tuple[ExecutionSession, ExecutionPackage] | None:
    session = _sessions.get(execution_id)
    package = _packages.get(execution_id)
    if session is None or package is None:
        return None
    if session.status != "draft":
        raise ValueError("only draft executions can be approved")
    session.status = "approved"
    session.approved_at = datetime.now(timezone.utc).isoformat()
    append_event(session, "approved", status="approved", message="Founder approval granted", timestamp=session.approved_at)
    package = replace(package, execution_allowed=True)
    save_execution_session(session, package)
    return session, package


def get_execution_session(execution_id: str) -> tuple[ExecutionSession, ExecutionPackage] | None:
    session = _sessions.get(execution_id)
    package = _packages.get(execution_id)
    return (session, package) if session is not None and package is not None else None


def list_execution_sessions() -> list[ExecutionSession]:
    """Return a read-only snapshot for Founder state analysis."""
    return list(_sessions.values())


def clear_execution_registry_runtime() -> dict:
    """Remove only execution/package runtime, retaining repository and long-term assets."""
    root = _registry_path().parent
    backup = root.with_name(f"{root.name}.cleanup-backup-{uuid4().hex[:10]}")
    with _lock:
        count = len(_sessions)
        if root.exists():
            root.replace(backup)
        try:
            root.mkdir(parents=True, exist_ok=True)
            _registry_path().write_text(json.dumps({"sessions": {}, "packages": {}}, ensure_ascii=False), encoding="utf-8")
            _sessions.clear()
            _packages.clear()
        except Exception:
            if root.exists():
                shutil.rmtree(root)
            if backup.exists():
                backup.replace(root)
            load_execution_sessions()
            raise
    return {"execution_count": count, "backup_path": str(backup) if backup.exists() else None}


def finalize_execution_registry_cleanup(backup_path: str | None) -> None:
    if backup_path:
        backup = Path(backup_path)
        if backup.exists():
            shutil.rmtree(backup)


def restore_execution_registry_cleanup(backup_path: str | None) -> None:
    if not backup_path:
        return
    backup = Path(backup_path)
    root = _registry_path().parent
    with _lock:
        _sessions.clear(); _packages.clear()
        if root.exists():
            shutil.rmtree(root)
        if backup.exists():
            backup.replace(root)
        load_execution_sessions()


def list_actually_active_sessions(*, queue_getter=None, task_lookup=None, package_id: str | None = None) -> list[ExecutionSession]:
    active = []
    for session in list_execution_sessions():
        if package_id and session.execution_package_id != package_id:
            continue
        package = _packages.get(session.id)
        task = task_lookup(session.task_asset_id) if task_lookup else None
        queue_item = queue_getter(session.id) if queue_getter else None
        if classify_session_lifecycle(session, package=package, task=task, queue_item=queue_item)["actually_active"]:
            active.append(session)
    return active


load_execution_sessions()
