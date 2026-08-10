"""Read-only projection from legacy TaskDB and TaskAsset records.

The adapter deliberately does not persist, mutate, or infer application
ownership.  In particular, a legacy record without ``system_id`` remains
unscoped instead of being silently assigned to Founder AI.
"""

from dataclasses import asdict, dataclass
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class TaskViewModel:
    """Stable task read model shared by legacy and canonical consumers."""

    id: str
    title: str
    description: str | None
    scope: dict[str, Any]
    status: str
    approval_status: str
    execution_status: str
    result: dict[str, Any] | None
    system_id: str | None
    conversation_id: str | None
    decision_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _value(record: Any, name: str, default: Any = None) -> Any:
    if isinstance(record, Mapping):
        return record.get(name, default)
    return getattr(record, name, default)


def _payload(record: Any) -> dict[str, Any]:
    payload = _value(record, "payload", {})
    return payload if isinstance(payload, Mapping) else {}


def _legacy_title(record: Any, payload: Mapping[str, Any]) -> str:
    title = payload.get("title") or payload.get("name")
    if title:
        return str(title)
    task_type = _value(record, "task_type")
    if task_type:
        return str(task_type)
    return str(_value(record, "id", ""))


def _legacy_description(payload: Mapping[str, Any]) -> str | None:
    for key in ("description", "goal", "summary"):
        value = payload.get(key)
        if value is not None:
            return str(value)
    return None


def _legacy_execution_status(status: str) -> str:
    return {
        "running": "running",
        "completed": "completed",
        "failed": "failed",
    }.get(status, "not_started")


def adapt_legacy_task(record: Any) -> TaskViewModel:
    """Project a legacy ``TaskDB``-shaped record without changing it."""

    payload = _payload(record)
    status = str(_value(record, "status", "pending"))
    scope = payload.get("scope", {})
    if not isinstance(scope, Mapping):
        scope = {}

    return TaskViewModel(
        id=str(_value(record, "id", "")),
        title=_legacy_title(record, payload),
        description=_legacy_description(payload),
        scope=dict(scope),
        status=status,
        approval_status=str(_value(record, "approval_status", "pending")),
        execution_status=str(
            _value(record, "execution_status", _legacy_execution_status(status))
        ),
        result=_value(record, "result"),
        # TaskDB predates the application boundary.  Preserve the absence of
        # system_id instead of silently assigning founder_ai.
        system_id=_value(record, "system_id"),
        conversation_id=_value(record, "conversation_id"),
        decision_id=_value(record, "decision_id"),
    )


def adapt_task_asset(record: Any) -> TaskViewModel:
    """Project a canonical ``TaskAssetDB``-shaped record."""

    scope = _value(record, "scope", {})
    if not isinstance(scope, Mapping):
        scope = {}

    return TaskViewModel(
        id=str(_value(record, "id", "")),
        title=str(_value(record, "title", "")),
        description=_value(record, "description"),
        scope=dict(scope),
        status=str(_value(record, "status", "draft")),
        approval_status=str(_value(record, "approval_status", "pending")),
        execution_status=str(_value(record, "execution_status", "not_started")),
        result=_value(record, "result"),
        system_id=_value(record, "system_id"),
        conversation_id=_value(record, "conversation_id"),
        decision_id=_value(record, "decision_id"),
    )
