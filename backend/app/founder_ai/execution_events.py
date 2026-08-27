"""Canonical, durable events for Founder execution observability."""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import NAMESPACE_URL, uuid4, uuid5


EXECUTION_EVENT_NAMES = {
    "approved",
    "queued",
    "worker_started",
    "codex_started",
    "codex_finished",
    "scope_verification_started",
    "scope_verification_finished",
    "scope_correction_started",
    "scope_correction_finished",
    "scope_reconciled",
    "testing_started",
    "testing_finished",
    "tests_started",
    "tests_passed",
    "tests_failed",
    "build_started",
    "build_passed",
    "build_failed",
    "diff_check_started",
    "diff_check_passed",
    "diff_check_failed",
    "browser_verification_started",
    "verification_completed",
    "verification_fallback_finished",
    "preferred_browser_started",
    "preferred_browser_passed",
    "preferred_browser_unavailable",
    "preferred_browser_failed",
    "fallback_browser_passed",
    "fallback_browser_started",
    "fallback_browser_unavailable",
    "fallback_browser_failed",
    "component_static_acceptance_pass",
    "component_static_acceptance_unavailable",
    "component_static_acceptance_acceptance_failed",
    "artifact_saved",
    "memory_saved",
    "completed",
    "failed",
    "cancelled_due_to_route_misclassification",
    "backend_restarted",
    "founder_delta_received",
    "delta_classified",
    "delta_applied",
    "execution_paused_for_delta",
    "execution_replanned",
    "execution_resumed",
    "worker_heartbeat",
    "stall_detected",
    "technical_resolution_started",
    "technical_resolution_attempted",
    "technical_resolution_completed",
    "technical_resolution_exhausted",
    "evidence_reconciled",
    "founder_stop_requested",
    "cancelled_by_founder",
}

LEGACY_EVENT_NAMES = {
    "executing": "codex_started",
    "testing": "testing_started",
    "persisting": "testing_finished",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True, slots=True)
class ExecutionEvent:
    event_id: str
    execution_id: str
    event_name: str
    timestamp: str
    status: str
    message: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        execution_id: str,
        event_name: str,
        *,
        status: str,
        message: str,
        timestamp: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "ExecutionEvent":
        if event_name not in EXECUTION_EVENT_NAMES:
            raise ValueError(f"unsupported execution event: {event_name}")
        return cls(
            event_id=f"event-{uuid4().hex[:20]}",
            execution_id=execution_id,
            event_name=event_name,
            timestamp=timestamp or utc_now(),
            status=status,
            message=message,
            metadata=dict(metadata or {}),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def append_event(
    session,
    event_name: str,
    *,
    status: str,
    message: str,
    timestamp: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event = ExecutionEvent.create(
        session.id,
        event_name,
        status=status,
        message=message,
        timestamp=timestamp,
        metadata=metadata,
    ).to_dict()
    session.events.append(event)
    session.current_stage = event_name
    from .execution_state import canonical_stage, runtime_revision
    stage = canonical_stage(event_name, status)
    if getattr(session, "execution_stage", None) != stage:
        session.execution_stage = stage
        session.stage_started_at = event["timestamp"]
    revision = runtime_revision()
    session.runtime_revision = revision
    session.execution_created_revision = getattr(session, "execution_created_revision", None) or revision
    session.worker_heartbeat_at = event["timestamp"]
    session.last_heartbeat_at = event["timestamp"]
    if event_name != "worker_heartbeat":
        session.meaningful_progress_at = event["timestamp"]
        session.last_meaningful_event_at = event["timestamp"]
    # Preserve the old response and persisted shape while clients migrate to events.
    session.execution_logs.append({"timestamp": event["timestamp"], "stage": event_name, "message": message})
    return event


def migrate_legacy_events(session) -> None:
    """Populate canonical events once for sessions written before Timeline V2."""
    if session.events:
        return
    for index, log in enumerate(session.execution_logs):
        raw_name = str(log.get("stage", ""))
        event_name = LEGACY_EVENT_NAMES.get(raw_name, raw_name)
        if event_name not in EXECUTION_EVENT_NAMES:
            continue
        timestamp = str(log.get("timestamp") or session.created_at)
        event_id = f"event-{uuid5(NAMESPACE_URL, f'{session.id}:{timestamp}:{event_name}:{index}').hex[:20]}"
        session.events.append(
            {
                "event_id": event_id,
                "execution_id": session.id,
                "event_name": event_name,
                "timestamp": timestamp,
                "status": _legacy_status(event_name, session.status),
                "message": str(log.get("message") or event_name.replace("_", " ").title()),
                "metadata": {},
            }
        )
    if session.events:
        session.current_stage = session.events[-1]["event_name"]


def migrate_restart_failure(session) -> bool:
    """Turn the former restart-as-failure representation into a paused session."""
    if getattr(session, "lifecycle_migration_version", None):
        return False
    if session.status != "failed" or not str(session.error_message or "").startswith("Backend restarted during execution"):
        return False
    session.source_status = "failed"
    session.source_error_message = session.error_message
    session.lifecycle_migration_version = 1
    session.restart_recovery_migrated_at = session.completed_at or session.started_at or session.created_at
    interrupted_status = "testing" if session.testing_at else "executing"
    session.status = "paused"
    session.pause_reason = "Backend restarted"
    session.recoverable = not any((session.result, session.artifact, session.memory))
    session.failure_reason = None
    session.error_message = None
    session.completed_at = None
    append_event(
        session,
        "backend_restarted",
        status="paused",
        message="Backend restarted during execution; review and resume when safe",
        metadata={"interrupted_status": interrupted_status, "recoverable": session.recoverable, "migrated": True},
    )
    return True


def _legacy_status(event_name: str, final_status: str) -> str:
    if event_name == "failed":
        return "failed"
    if event_name == "backend_restarted":
        return "paused"
    if event_name == "completed":
        return "completed"
    if event_name in {"testing_started", "testing_finished", "artifact_saved", "memory_saved"}:
        return "testing"
    if event_name in {"worker_started", "codex_started", "codex_finished", "founder_delta_received", "delta_classified", "delta_applied", "execution_replanned", "execution_resumed"}:
        return "executing"
    if event_name == "execution_paused_for_delta":
        return "paused"
    if event_name in {"approved", "queued"}:
        return event_name
    return final_status
