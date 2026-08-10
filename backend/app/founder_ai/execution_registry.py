from dataclasses import replace
from uuid import uuid4

from .execution_loop import ExecutionSession
from .orchestrator import ExecutionPackage

_sessions: dict[str, ExecutionSession] = {}
_packages: dict[str, ExecutionPackage] = {}


def create_execution_session(task_asset_id: str, package: ExecutionPackage) -> ExecutionSession:
    session = ExecutionSession(
        id=f"execution-{uuid4().hex[:16]}",
        task_asset_id=task_asset_id,
        execution_package_id=f"package-{uuid4().hex[:16]}",
    )
    _sessions[session.id] = session
    _packages[session.id] = package
    return session


def approve_execution_session(execution_id: str) -> tuple[ExecutionSession, ExecutionPackage] | None:
    session = _sessions.get(execution_id)
    package = _packages.get(execution_id)
    if session is None or package is None:
        return None
    if session.status != "draft":
        raise ValueError("only draft executions can be approved")
    session.status = "approved"
    package = replace(package, execution_allowed=True)
    _packages[execution_id] = package
    return session, package


def get_execution_session(execution_id: str) -> tuple[ExecutionSession, ExecutionPackage] | None:
    session = _sessions.get(execution_id)
    package = _packages.get(execution_id)
    return (session, package) if session is not None and package is not None else None


def list_execution_sessions() -> list[ExecutionSession]:
    """Return a read-only snapshot for Founder state analysis."""
    return list(_sessions.values())
