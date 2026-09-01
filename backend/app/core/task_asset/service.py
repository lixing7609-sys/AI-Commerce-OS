from datetime import datetime, timezone
import hashlib

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class TaskAssetBoundaryError(ValueError):
    """Raised when a TaskAsset crosses the Founder application boundary."""


APPROVAL_DECISIONS = {"approved", "rejected"}
TASK_ASSET_EXECUTION_APPROVAL_DECISIONS = {"approve": "approved", "reject": "rejected"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_execution_approval_id(*, task_id: str, canonical_fingerprint: str) -> str:
    digest = hashlib.sha256(
        f"execution-approval:{task_id}:{canonical_fingerprint}".encode("utf-8")
    ).hexdigest()[:20]
    return f"approval-{digest}"


def ensure_task_execution_approval(
    *, task_id: str, canonical_fingerprint: str, candidate_id: str,
) -> dict:
    """Persist the pending approval identity before any Founder decision."""
    with SessionLocal() as session:
        task = session.scalar(select(TaskAssetDB).where(TaskAssetDB.id == task_id).with_for_update())
        if task is None:
            raise LookupError("task_asset_not_found")
        scope = dict(task.scope or {})
        authority = dict(scope.get("candidate_authority") or {})
        if (
            authority.get("candidate_id") != candidate_id
            or authority.get("canonical_fingerprint") != canonical_fingerprint
        ):
            raise ValueError("approval_authority_mismatch")
        existing = dict(scope.get("execution_approval") or {})
        if existing:
            return existing
        approval = {
            "schema_version": "execution-approval-v1",
            "approval_id": stable_execution_approval_id(
                task_id=task.id, canonical_fingerprint=canonical_fingerprint,
            ),
            "task_id": task.id, "candidate_id": candidate_id,
            "canonical_fingerprint": canonical_fingerprint,
            "decision": "pending", "actor": None,
            "created_at": _now(), "decided_at": None,
        }
        scope["execution_approval"] = approval
        task.scope = scope
        task.approval_status = "pending"
        session.commit()
        return approval


def decide_task_execution_approval(
    *, task_id: str, decision: str, canonical_fingerprint: str,
    candidate_id: str, actor: str = "founder",
) -> dict:
    """Persist a fingerprint-bound Founder execution approval decision."""
    if decision not in APPROVAL_DECISIONS:
        raise ValueError("unsupported_execution_approval_decision")
    with SessionLocal() as session:
        task = session.scalar(select(TaskAssetDB).where(TaskAssetDB.id == task_id).with_for_update())
        if task is None:
            raise LookupError("task_asset_not_found")
        scope = dict(task.scope or {})
        authority = dict(scope.get("candidate_authority") or {})
        if authority.get("candidate_id") != candidate_id:
            raise ValueError("approval_candidate_mismatch")
        if authority.get("canonical_fingerprint") != canonical_fingerprint:
            raise ValueError("approval_authority_fingerprint_mismatch")
        existing = dict(scope.get("execution_approval") or {})
        if existing:
            if (
                existing.get("canonical_fingerprint") != canonical_fingerprint
                or existing.get("candidate_id") != candidate_id
            ):
                raise ValueError("stale_execution_approval")
            if existing.get("decision") == "pending":
                existing.update({"decision": decision, "actor": actor, "decided_at": _now()})
                scope["execution_approval"] = existing
                task.scope = scope
                task.approval_status = decision
                session.commit()
                return existing
            if existing.get("decision") != decision:
                raise ValueError("execution_approval_already_decided")
            return existing
        now = _now()
        approval = {
            "schema_version": "execution-approval-v1",
            "approval_id": stable_execution_approval_id(
                task_id=task.id, canonical_fingerprint=canonical_fingerprint,
            ),
            "task_id": task.id,
            "candidate_id": candidate_id,
            "canonical_fingerprint": canonical_fingerprint,
            "decision": decision,
            "actor": actor,
            "created_at": now,
            "decided_at": now,
        }
        scope["execution_approval"] = approval
        task.scope = scope
        task.approval_status = decision
        session.commit()
        return approval


def validate_task_execution_approval(task: TaskAssetDB, authority: dict) -> dict:
    """Return an observable authorization result without trusting a mutable status string."""
    requires_approval = bool(
        authority.get("approval_required") or str(authority.get("risk") or "low").lower() != "low"
    )
    if not requires_approval:
        return {"authorized": True, "reason": "approval_not_required", "approval": None}
    approval = dict((task.scope or {}).get("execution_approval") or {})
    if not approval:
        return {"authorized": False, "reason": "blocked_approval_missing", "approval": None}
    if (
        approval.get("task_id") != task.id
        or approval.get("candidate_id") != authority.get("candidate_id")
        or approval.get("canonical_fingerprint") != authority.get("canonical_fingerprint")
    ):
        return {"authorized": False, "reason": "blocked_stale_approval", "approval": approval}
    if approval.get("decision") == "rejected":
        return {"authorized": False, "reason": "blocked_approval_rejected", "approval": approval}
    if approval.get("decision") == "invalidated":
        return {"authorized": False, "reason": "blocked_stale_approval", "approval": approval}
    if approval.get("decision") != "approved":
        return {"authorized": False, "reason": "blocked_approval_missing", "approval": approval}
    return {"authorized": True, "reason": "authorized", "approval": approval}


def invalidate_task_execution_approval(task: TaskAssetDB, *, reason: str) -> dict | None:
    """Invalidate a stale durable approval on the locked TaskAsset row."""
    scope = dict(task.scope or {})
    approval = dict(scope.get("execution_approval") or {})
    if not approval:
        return None
    approval.update({"decision": "invalidated", "invalidated_at": _now(), "invalidation_reason": reason})
    scope["execution_approval"] = approval
    task.scope = scope
    task.approval_status = "invalidated"
    return approval


def decide_task_asset_execution_approval(*, task_id: str, decision: str, actor: str = "founder") -> TaskAssetDB:
    """Approve/reject a TaskAsset for future execution without creating or starting Execution.

    This is the approval-only gate for FounderObject-bridged TaskAssets. It is
    intentionally separate from the standard-task resume path, which may create
    and enqueue Execution after approval.
    """
    if decision not in TASK_ASSET_EXECUTION_APPROVAL_DECISIONS:
        raise ValueError("unsupported_task_asset_execution_approval_decision")
    target = TASK_ASSET_EXECUTION_APPROVAL_DECISIONS[decision]
    with SessionLocal() as session:
        task = session.scalar(select(TaskAssetDB).where(TaskAssetDB.id == task_id).with_for_update())
        if task is None or task.system_id != FOUNDER_SYSTEM_KEY:
            raise LookupError("task_asset_not_found")
        if task.execution_status != "not_started":
            raise ValueError("task_asset_execution_already_started")
        current = task.approval_status
        if current == target:
            return task
        if current in {"approved", "rejected"} and current != target:
            raise ValueError("task_asset_execution_approval_already_decided")
        if current not in {"pending", "not_required"}:
            raise ValueError("task_asset_execution_approval_not_pending")
        now = _now()
        scope = dict(task.scope or {})
        approval = dict(scope.get("task_asset_execution_approval") or {})
        approval.update({
            "schema_version": "task-asset-execution-approval-v1",
            "task_id": task.id,
            "decision": target,
            "actor": actor,
            "decided_at": now,
        })
        approval.setdefault("created_at", now)
        scope["task_asset_execution_approval"] = approval
        task.scope = scope
        task.approval_status = target
        task.execution_status = "not_started"
        task.updated_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(task)
        return task


def _validate_reference(session, model, identifier: str | None, label: str) -> None:
    if identifier is None:
        return
    record = session.get(model, identifier)
    if record is None or record.system_id != FOUNDER_SYSTEM_KEY:
        raise TaskAssetBoundaryError(f"{label} is outside the Founder AI boundary")


def create_task_asset(
    *,
    title: str,
    description: str | None = None,
    scope: dict | None = None,
    status: str = "draft",
    approval_status: str = "pending",
    execution_status: str = "not_started",
    result: dict | None = None,
    conversation_id: str | None = None,
    decision_id: str | None = None,
    source_message_id: str | None = None,
    target_module: str | None = None,
    target_object: str | None = None,
) -> TaskAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        task_scope = dict(scope or {})
        task_id = None
        identity = None
        if source_message_id:
            from app.founder_ai.task_identity import build_task_identity, duplicate_reason
            conversation = session.get(ConversationDB, conversation_id) if conversation_id else None
            identity = build_task_identity(source_message_id=source_message_id, conversation_id=conversation_id or "",
                project_id=conversation.project_id if conversation else None, goal=description or title,
                target_module=target_module, target_object=target_object)
            for existing in session.scalars(select(TaskAssetDB).where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY)):
                reason = duplicate_reason(existing.scope, identity)
                if reason:
                    existing.duplicate_reason = reason
                    existing.duplicate_of_task_id = existing.id
                    return existing
            digest = hashlib.sha256(f"founder-task:{source_message_id}".encode()).hexdigest()[:16]
            task_id = f"task-asset-msg-{digest}"
            task_scope["task_identity"] = identity
        record = TaskAssetDB(
            **({"id": task_id} if task_id else {}),
            system_id=FOUNDER_SYSTEM_KEY,
            conversation_id=conversation_id,
            decision_id=decision_id,
            title=title,
            description=description,
            scope=task_scope,
            status=status,
            approval_status=approval_status,
            execution_status=execution_status,
            result=result,
        )
        session.add(record)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            if not task_id:
                raise
            record = session.get(TaskAssetDB, task_id)
            if record is None:
                raise
            record.duplicate_reason = "same_source_message_id"
            record.duplicate_of_task_id = record.id
            return record
        session.refresh(record)
        record.duplicate_reason = None
        record.duplicate_of_task_id = None
        return record


def list_founder_task_assets() -> list[TaskAssetDB]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(TaskAssetDB)
                .where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY)
                .order_by(TaskAssetDB.updated_at.desc())
            )
        )


def find_task_by_source_message(source_message_id: str | None) -> TaskAssetDB | None:
    """Return the canonical Task for one persisted Founder message, never by title/project similarity."""
    if not source_message_id:
        return None
    from app.founder_ai.task_identity import task_identity_from_scope
    with SessionLocal() as session:
        for item in session.scalars(select(TaskAssetDB).where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY)):
            if task_identity_from_scope(item.scope).get("source_message_id") == source_message_id:
                return item
    return None


def get_founder_task_asset(task_id: str) -> TaskAssetDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(TaskAssetDB).where(
                TaskAssetDB.id == task_id,
                TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
