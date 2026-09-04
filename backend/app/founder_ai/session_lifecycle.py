"""Evidence-based lifecycle classification shared by Registry, Workspace and Closure."""
from __future__ import annotations

from dataclasses import dataclass


ACTUALLY_ACTIVE = "ACTUALLY_ACTIVE"
RESUMABLE_PAUSED = "RESUMABLE_PAUSED"
STALE_PAUSED = "STALE_PAUSED"
TERMINAL = "TERMINAL"
LIFECYCLE_INCONSISTENT = "LIFECYCLE_INCONSISTENT"
UNKNOWN = "UNKNOWN"
WAITING_READY = "WAITING_READY"
TERMINAL_STATUSES = {"completed", "failed", "blocked", "cancelled", "canceled", "superseded"}


def _value(value, key, default=None):
    return value.get(key, default) if isinstance(value, dict) else getattr(value, key, default)


def classify_session_lifecycle(session, *, package=None, task=None, queue_item=None) -> dict:
    status = str(_value(session, "status", "") or "").lower()
    started = _value(session, "started_at") or _value(session, "execution_started_at")
    completed = _value(session, "completed_at")
    result = dict(_value(session, "result", {}) or {})
    task_execution = str(_value(task, "execution_status", "") or "").lower()
    task_status = str(_value(task, "status", "") or "").lower()
    queue_status = str(_value(queue_item, "status", "") or "").lower()
    worker_owned = queue_status in {"queued", "running", "testing"}
    lifecycle_inconsistent = bool(
        status not in TERMINAL_STATUSES
        and started
        and task is not None
        and (task_execution == "not_started" or task_status == "draft")
    )
    resume_evidence = {
        "recoverable": _value(session, "recoverable") is True,
        "valid_lineage": bool(_value(session, "handoff_id") and _value(session, "action_contract_id") and package is not None),
        "unfinished_work": bool(result.get("incomplete_actions") or result.get("pending_actions") or _value(session, "deltas", [])),
        "resume_path": bool(result.get("resume_path") or result.get("resume_contract") or str(_value(session, "pause_reason", "")).startswith("Founder delta")),
    }
    if status in TERMINAL_STATUSES:
        classification = TERMINAL
    elif status == "paused":
        classification = RESUMABLE_PAUSED if all(resume_evidence.values()) else STALE_PAUSED
    elif status in {"queued", "executing", "testing", "running"}:
        classification = ACTUALLY_ACTIVE if worker_owned and not completed else LIFECYCLE_INCONSISTENT
        lifecycle_inconsistent = lifecycle_inconsistent or classification == LIFECYCLE_INCONSISTENT
    elif status in {"created", "draft", "approved"}:
        classification = WAITING_READY
    else:
        classification = UNKNOWN
    return {
        "session_id": _value(session, "id"), "status": status, "classification": classification,
        "actually_active": classification == ACTUALLY_ACTIVE, "resumable": classification == RESUMABLE_PAUSED,
        "stale": classification == STALE_PAUSED, "lifecycle_inconsistent": lifecycle_inconsistent,
        "worker_owned": worker_owned, "queue_status": queue_status or None, "resume_evidence": resume_evidence,
        "source_status": _value(session, "source_status") or status,
        "migration_version": _value(session, "lifecycle_migration_version"),
    }
