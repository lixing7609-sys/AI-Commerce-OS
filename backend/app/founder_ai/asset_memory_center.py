"""Read-only historical view across Founder artifacts, memories, tasks and executions."""

import json
import re
from typing import Any

from app.core.artifact.service import list_founder_artifacts
from app.core.memory.service import list_founder_memories
from app.core.task_asset.service import list_founder_task_assets
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions


EXECUTION_ID_PATTERN = re.compile(r"execution-[a-zA-Z0-9]+")


def _json(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {"value": value}


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


def _execution_id(payload: dict[str, Any], title: str | None = None) -> str | None:
    if payload.get("execution_id"):
        return str(payload["execution_id"])
    match = EXECUTION_ID_PATTERN.search(title or "")
    return match.group(0) if match else None


def build_asset_memory_center() -> dict[str, Any]:
    tasks = {task.id: task for task in list_founder_task_assets()}
    sessions = list_execution_sessions()
    session_records = {}
    artifact_session = {}
    memory_session = {}
    for session in sessions:
        record = get_execution_session(session.id)
        package = record[1] if record else None
        session_records[session.id] = (session, package)
        if session.artifact and session.artifact.get("id"):
            artifact_session[session.artifact["id"]] = session.id
        for memory_id in (session.memory or {}).values():
            memory_session[memory_id] = session.id

    artifacts = []
    for artifact in list_founder_artifacts():
        content = _json(artifact.content_ref)
        execution_id = _execution_id(content) or artifact_session.get(artifact.id)
        session, package = session_records.get(execution_id, (None, None))
        task = tasks.get(artifact.task_asset_id or (session.task_asset_id if session else None))
        result = session.result or {} if session else {}
        files = content.get("files") or ((session.artifact or {}).get("files") if session else None) or []
        commit_hash = content.get("commit_hash") or (session.commit_hash if session else None)
        verification_status = "passed" if session and session.status == "completed" and result.get("exit_code") == 0 else ("failed" if session and session.status == "failed" else "unknown")
        artifacts.append({
            "artifact_id": artifact.id,
            "execution_id": execution_id,
            "task_asset_id": artifact.task_asset_id or (session.task_asset_id if session else None),
            "task": task.title if task else (package.goal if package else artifact.title),
            "goal": package.goal if package else (task.title if task else artifact.title),
            "artifact_type": artifact.artifact_type,
            "summary": artifact.description or content.get("summary") or artifact.title,
            "created_at": _iso(artifact.created_at),
            "updated_at": _iso(getattr(artifact, "updated_at", None)),
            "conversation_id": getattr(artifact, "conversation_id", None),
            "related_files": list(files) if isinstance(files, list) else [],
            "commit_hash": commit_hash,
            "verification_status": verification_status,
            "verification": list(result.get("tests") or []),
            "status": artifact.status,
            "version": getattr(artifact, "version", 1),
            "parent_artifact_id": getattr(artifact, "parent_artifact_id", None),
            "previous_version_id": getattr(artifact, "previous_version_id", None),
            "revision_reason": getattr(artifact, "revision_reason", None),
        })

    memories = []
    for memory in list_founder_memories():
        content = _json(memory.content)
        execution_id = _execution_id(content, memory.title) or memory_session.get(memory.id)
        session, package = session_records.get(execution_id, (None, None))
        task = tasks.get(memory.task_asset_id or (session.task_asset_id if session else None))
        memories.append({
            "memory_id": memory.id,
            "execution_id": execution_id,
            "task_asset_id": memory.task_asset_id or (session.task_asset_id if session else None),
            "artifact_id": memory.artifact_id,
            "task": task.title if task else (package.goal if package else memory.title),
            "memory_type": memory.memory_type,
            "title": memory.title,
            "summary": memory.summary,
            "created_at": _iso(memory.created_at),
            "updated_at": _iso(getattr(memory, "updated_at", None)),
            "status": memory.status,
            "conversation_id": getattr(memory, "conversation_id", None),
            "importance": getattr(memory, "importance", None),
            "tags": getattr(memory, "tags", None) or [],
            "revision_number": getattr(memory, "revision_number", 1),
            "parent_memory_id": getattr(memory, "parent_memory_id", None),
            "previous_revision_id": getattr(memory, "previous_revision_id", None),
            "revision_reason": getattr(memory, "revision_reason", None),
            "merged_into_memory_id": getattr(memory, "merged_into_memory_id", None),
        })

    artifacts.sort(key=lambda item: item["created_at"] or "", reverse=True)
    memories.sort(key=lambda item: item["created_at"] or "", reverse=True)
    executions = []
    execution_ids = set(session_records) | {item["execution_id"] for item in artifacts + memories if item["execution_id"]}
    for execution_id in execution_ids:
        session, package = session_records.get(execution_id, (None, None))
        task = tasks.get(session.task_asset_id if session else None)
        linked_artifacts = [item["artifact_id"] for item in artifacts if item["execution_id"] == execution_id]
        linked_memories = [item["memory_id"] for item in memories if item["execution_id"] == execution_id]
        executions.append({
            "execution_id": execution_id,
            "task_asset_id": session.task_asset_id if session else None,
            "task": task.title if task else (package.goal if package else None),
            "goal": package.goal if package else (task.title if task else None),
            "status": session.status if session else "historical",
            "commit_hash": session.commit_hash if session else next((item["commit_hash"] for item in artifacts if item["execution_id"] == execution_id), None),
            "verification_status": "passed" if session and session.status == "completed" and (session.result or {}).get("exit_code") == 0 else ("failed" if session and session.status == "failed" else "unknown"),
            "artifacts": linked_artifacts,
            "memories": linked_memories,
            "created_at": session.created_at if session else None,
            "completed_at": session.completed_at if session else None,
        })
    executions.sort(key=lambda item: item["completed_at"] or item["created_at"] or "", reverse=True)
    return {"artifacts": artifacts, "memories": memories, "executions": executions}
