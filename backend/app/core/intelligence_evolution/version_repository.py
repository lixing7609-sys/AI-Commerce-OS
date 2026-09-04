from datetime import datetime, timezone

from sqlalchemy import select

from .model import CapabilityVersionDB


VERSION_STATES = {"ready", "learning", "version_evolution", "deprecated"}
ALLOWED_TRANSITIONS = {
    "ready": {"learning"},
    "learning": {"version_evolution"},
    "version_evolution": {"ready", "deprecated"},
    "deprecated": set(),
}


def register_version(session, *, capability_id: str, version: str, change_log: str = "", compatibility=None, dependencies=None, content=None) -> CapabilityVersionDB:
    record = CapabilityVersionDB(
        capability_id=capability_id,
        version=version,
        change_log=change_log,
        compatibility=dict(compatibility or {}),
        dependencies=list(dependencies or []),
        content=dict(content or {}),
    )
    session.add(record)
    session.flush()
    return record


def list_versions(session, capability_id: str) -> list[CapabilityVersionDB]:
    return list(session.scalars(select(CapabilityVersionDB).where(CapabilityVersionDB.capability_id == capability_id).order_by(CapabilityVersionDB.created_at.desc())))


def compare_versions(left: CapabilityVersionDB, right: CapabilityVersionDB) -> dict[str, object]:
    if left.capability_id != right.capability_id:
        raise ValueError("Versions belong to different capabilities")
    return {
        "capability_id": left.capability_id,
        "from_version": left.version,
        "to_version": right.version,
        "dependency_changes": {"removed": [item for item in left.dependencies if item not in right.dependencies], "added": [item for item in right.dependencies if item not in left.dependencies]},
        "compatibility_changed": left.compatibility != right.compatibility,
        "content_changed": left.content != right.content,
    }


def transition_version(record: CapabilityVersionDB, target_status: str, *, founder_approved: bool = False) -> CapabilityVersionDB:
    if target_status not in VERSION_STATES or target_status not in ALLOWED_TRANSITIONS.get(record.status, set()):
        raise ValueError(f"Invalid version transition: {record.status} -> {target_status}")
    if record.status == "version_evolution" and target_status in {"ready", "deprecated"} and not founder_approved:
        raise PermissionError("Founder approval is required for formal version migration")
    record.status = target_status
    record.updated_at = datetime.now(timezone.utc)
    return record


def rollback_version(session, *, current: CapabilityVersionDB, target: CapabilityVersionDB, founder_approved: bool) -> CapabilityVersionDB:
    if current.capability_id != target.capability_id or target.status != "ready":
        raise ValueError("Rollback target must be a ready version of the same capability")
    if not founder_approved:
        raise PermissionError("Founder approval is required for rollback")
    current.status = "deprecated"
    current.updated_at = datetime.now(timezone.utc)
    target.updated_at = datetime.now(timezone.utc)
    session.flush()
    return target
