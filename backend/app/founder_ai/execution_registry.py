from dataclasses import asdict, replace
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from threading import RLock
from uuid import uuid4

from .execution_loop import ExecutionSession
from .execution_events import append_event, migrate_legacy_events, migrate_restart_failure
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
    path = _registry_path()
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            legacy_sessions = {key: ExecutionSession(**value) for key, value in payload.get("sessions", {}).items()}
            for session in legacy_sessions.values():
                migrate_legacy_events(session)
                migrate_restart_failure(session)
            sessions.update(legacy_sessions)
            packages.update({key: _package_from_dict(value) for key, value in payload.get("packages", {}).items()})
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            pass
    for item in sorted((path.parent / "sessions").glob("*.json")):
        try:
            payload = json.loads(item.read_text(encoding="utf-8"))
            session = ExecutionSession(**payload["session"])
            migrate_legacy_events(session)
            migrate_restart_failure(session)
            package = _package_from_dict(payload["package"])
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
        sessions[session.id] = session
        packages[session.id] = package
    with _lock:
        _sessions.update(sessions)
        _packages.update(packages)


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
    save_execution_session(session, package)
    return session


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


load_execution_sessions()
