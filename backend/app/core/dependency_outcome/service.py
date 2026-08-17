from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.project.model import FounderProjectDB
from app.database.db import SessionLocal


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(value: str | None) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (value or "").casefold())


def _target_from_evidence(package: dict, issue: dict) -> str | None:
    reason = str(issue.get("reason") or "")
    for candidate in package.get("affected_system_objects") or []:
        label = re.split(r"[（(]", str(candidate), maxsplit=1)[0].strip()
        if label and _normalize(label) in _normalize(reason):
            return label
    for dependency in package.get("dependencies") or []:
        label = re.split(r"(?:提供|负责|依赖|[（(])", str(dependency), maxsplit=1)[0].strip(" ：:-")
        if label and _normalize(label) in _normalize(reason):
            return label
    return str(issue.get("dependency_target") or "").strip() or None


def _required_capabilities(issue: dict) -> list[str]:
    checks = issue.get("checks") or {}
    if isinstance(checks, dict):
        return [str(name) for name, ready in checks.items() if ready is False]
    return list(issue.get("required_capabilities") or [])


def derive_dependency_outcomes(*, project: FounderProjectDB, state: SinoBrainSessionDB) -> list[dict]:
    discovery = dict(state.discovery or {})
    package = dict(discovery.get("execution_package") or {})
    execution = dict(discovery.get("execution_session") or discovery.get("execution_result") or {})
    session_id, package_id = execution.get("execution_session_id"), package.get("package_id")
    if not session_id or not package_id:
        return []
    outcomes = []
    for issue in execution.get("remaining_issues") or []:
        if not isinstance(issue, dict):
            continue
        target, required = _target_from_evidence(package, issue), _required_capabilities(issue)
        if not target or not required:
            continue
        identity = f"{project.id}:{session_id}:{package_id}:{_normalize(target)}"
        outcomes.append({
            "dependency_id": f"dependency-{hashlib.sha256(identity.encode()).hexdigest()[:20]}",
            "source_project_id": project.id, "source_project_name": project.name,
            "source_conversation_id": state.conversation_id,
            "source_execution_session_id": session_id, "source_execution_package_id": package_id,
            "dependency_target": target,
            "dependency_type": issue.get("dependency_type") or "runtime_external_dependency",
            "required_capabilities": required, "reason": issue.get("reason"),
            "evidence": {"work_item_id": issue.get("work_item_id"), "checks": dict(issue.get("checks") or {}), "execution_status": execution.get("execution_status"), "validation_status": execution.get("validation_status"), "completed_work_items": list(execution.get("completed_work_items") or []), "commits": list(execution.get("commits") or [])},
            "blocking_scope": issue.get("work_item_id") or "real_environment_validation", "status": "open",
        })
    return outcomes


def feedback_execution_dependencies(conversation_id: str) -> dict:
    """Persist idempotent execution-derived context without changing execution truth."""
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        conversation = session.get(ConversationDB, conversation_id)
        project = session.get(FounderProjectDB, state.project_id if state else None)
        if state is None or conversation is None or project is None:
            raise LookupError("execution conversation not found")
        discovery = dict(state.discovery or {})
        derived = derive_dependency_outcomes(project=project, state=state)
        previous = {item.get("dependency_id"): item for item in discovery.get("dependency_outcomes") or []}
        timestamp = _now()
        outcomes = []
        for item in derived:
            item["created_at"] = (previous.get(item["dependency_id"]) or {}).get("created_at") or timestamp
            item["updated_at"] = timestamp
            outcomes.append(item)
        if not outcomes:
            raise ValueError("no_external_dependency_outcome")
        execution = dict(discovery.get("execution_session") or discovery.get("execution_result") or {})
        discovery["dependency_outcomes"] = outcomes
        discovery["execution_context_feedback"] = {"implementation_status": "completed", "validation_status": "blocked_by_external_dependency", "overall_execution_status": execution.get("execution_status") or "blocked", "external_dependencies": outcomes, "next_step": "resolve_external_dependency_then_resume_validation", "updated_at": timestamp}
        state.discovery, state.updated_at = discovery, datetime.now(timezone.utc)
        session.commit()
        return discovery["execution_context_feedback"]


def dependency_evidence_for_target(session, target: str) -> list[dict]:
    normalized = _normalize(target)
    evidence = []
    if not normalized:
        return evidence
    for state in session.scalars(select(SinoBrainSessionDB)):
        for item in (state.discovery or {}).get("dependency_outcomes") or []:
            if _normalize(item.get("dependency_target")) == normalized:
                evidence.append(dict(item))
    return sorted(evidence, key=lambda item: item.get("updated_at") or "", reverse=True)
