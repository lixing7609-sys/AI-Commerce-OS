from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.runtime_environment.model import RuntimeEnvironmentRegistryDB
from app.database.db import SessionLocal
from app.founder_ai.evidence_resolution import discover_iam_network_evidence


REGISTRY_ID = "runtime-environment-registry-founder-ai"
LOCAL_ID = "runtime-environment-local"
FRESHNESS_SECONDS = 24 * 60 * 60


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _safe_local_environment(package: dict) -> dict:
    post = dict(package.get("post_execution_commit") or {})
    result = dict(post.get("result_record") or {})
    resolutions = list(package.get("machine_action_evidence_resolutions") or [])
    evidence = dict(resolutions[-1] if resolutions else {})
    verified_at = result.get("completed_at") or evidence.get("observed_at") or datetime.now(timezone.utc).isoformat()
    iam_evidence = ((evidence.get("iam") or {}).get("evidence") or {}).get("evidence_id")
    network_evidence = ((evidence.get("network") or {}).get("evidence") or {}).get("evidence_id")
    action_refs = {item.get("work_item_id"): item.get("action_id") for item in result.get("action_results") or []}
    return {
        "environment_id": LOCAL_ID, "environment_type": "LOCAL", "deployment_stage": "CURRENT", "status": "ACTIVE", "health_status": "healthy",
        "services": [
            {"service_id": "founder_frontend", "service_type": "frontend", "host": "127.0.0.1", "port": 5173, "protocol": "http", "endpoint_reference": "runtime_environment.services.founder_frontend", "status": "ACTIVE", "health": "healthy", "evidence_refs": [network_evidence, action_refs.get("wi-cloud-004")], "last_verified_at": verified_at},
            {"service_id": "founder_backend", "service_type": "backend", "host": "127.0.0.1", "port": 8000, "protocol": "http", "endpoint_reference": "runtime_environment.services.founder_backend", "status": "ACTIVE", "health": "healthy", "evidence_refs": [network_evidence, action_refs.get("wi-cloud-002")], "last_verified_at": verified_at},
        ],
        "database": {"type": "PostgreSQL", "environment": "LOCAL", "credential_reference": "credential-reference://database/local-development", "credential_reference_exists": True, "secret_stored": False, "connectivity_status": "verified", "health_status": "healthy", "evidence_refs": [action_refs.get("wi-cloud-001")], "last_verified_at": verified_at},
        "iam": {"type": "application-level HTTP Bearer RBAC", "environment": "LOCAL", "configuration_reference": "application-identity/intelligence-evolution-http-bearer-rbac", "metadata_only": True, "secret_stored": False, "verification_status": "verified", "evidence_refs": [iam_evidence, action_refs.get("wi-cloud-003")], "last_verified_at": verified_at},
        "network": {"environment": "LOCAL", "boundary": "loopback", "backend_endpoint_reference": "runtime_environment.services.founder_backend", "frontend_endpoint_reference": "runtime_environment.services.founder_frontend", "verification_status": "verified", "evidence_refs": [network_evidence, action_refs.get("wi-cloud-004")], "last_verified_at": verified_at},
        "credential_refs": ["credential-reference://database/local-development"], "source": "VERIFIED_EXECUTION",
        "evidence_refs": [result.get("result_id"), iam_evidence, network_evidence], "last_verified_at": verified_at,
    }


def _verified_local_package(states) -> dict | None:
    candidates = []
    for state in states:
        package = dict((state.discovery or {}).get("execution_package") or {})
        result = dict((package.get("post_execution_commit") or {}).get("result_record") or {})
        if (
            package.get("task_closed") is True
            and result.get("final_status") == "completed"
            and result.get("verification_status") == "PASS"
            and len(result.get("action_results") or []) == 5
            and all(item.get("verification_result") == "PASS" for item in result.get("action_results") or [])
        ):
            candidates.append(package)
    return max(candidates, key=lambda item: ((item.get("post_execution_commit") or {}).get("result_record") or {}).get("completed_at") or "", default=None)


def _planned_environments() -> list[dict]:
    return [
        {"environment_id": "runtime-environment-nas", "environment_type": "NAS", "deployment_stage": "NEXT_PLANNED", "status": "PLANNED", "services": [], "credential_refs": [], "source": "MANUAL_CONFIGURATION", "evidence_refs": []},
        {"environment_id": "runtime-environment-commercial-cloud", "environment_type": "COMMERCIAL_CLOUD", "deployment_stage": "FUTURE", "status": "NOT_CONFIGURED", "services": [], "credential_refs": [], "source": "MANUAL_CONFIGURATION", "evidence_refs": []},
    ]


def ensure_runtime_environment_registry() -> dict:
    with SessionLocal() as session:
        row = session.get(RuntimeEnvironmentRegistryDB, REGISTRY_ID)
        if row is None:
            states = list(session.scalars(select(SinoBrainSessionDB)))
            package = _verified_local_package(states)
            if package is None:
                raise LookupError("verified_local_runtime_evidence_not_found")
            local = _safe_local_environment(package)
            row = RuntimeEnvironmentRegistryDB(id=REGISTRY_ID, active_environment_id=LOCAL_ID, status="ACTIVE", version=1, environments=[local, *_planned_environments()], source={"source_type": "VERIFIED_EXECUTION", "package_id": package.get("package_id"), "result_id": (package.get("post_execution_commit") or {}).get("result_record", {}).get("result_id")})
            session.add(row); session.commit(); session.refresh(row)
        return serialize_registry(row)


def serialize_registry(row) -> dict:
    return {"registry_id": row.id, "active_environment_id": row.active_environment_id, "status": row.status, "version": row.version, "environments": list(row.environments or []), "source": dict(row.source or {}), "created_at": _iso(row.created_at), "updated_at": _iso(row.updated_at)}


def validate_environment(environment: dict, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    stamp = environment.get("last_verified_at")
    try:
        verified = datetime.fromisoformat(stamp) if stamp else None
        if verified and verified.tzinfo is None: verified = verified.replace(tzinfo=timezone.utc)
    except ValueError:
        verified = None
    fresh = bool(verified and (now - verified).total_seconds() <= FRESHNESS_SECONDS)
    healthy = environment.get("health_status") == "healthy"
    valid = environment.get("status") == "ACTIVE" and fresh and healthy
    return {"valid": valid, "freshness": "fresh" if fresh else "stale", "health_status": environment.get("health_status") or "unknown", "route": "registry" if valid else "autonomous_discovery"}


def lookup_runtime_environment(environment_type: str = "LOCAL") -> dict:
    registry = ensure_runtime_environment_registry()
    environment = next((item for item in registry["environments"] if item.get("environment_type") == environment_type), None)
    if environment is None:
        return {"environment": None, "validation": {"valid": False, "freshness": "missing", "health_status": "unknown", "route": "autonomous_discovery"}}
    return {"environment": environment, "validation": validate_environment(environment)}


def resolve_runtime_environment(environment_type: str = "LOCAL") -> dict:
    lookup = lookup_runtime_environment(environment_type)
    if lookup["validation"]["valid"]:
        return {**lookup, "resolution_source": "REGISTRY"}
    if environment_type != "LOCAL":
        return {**lookup, "resolution_source": "AUTONOMOUS_DISCOVERY_REQUIRED"}
    evidence = discover_iam_network_evidence(Path(__file__).resolve().parents[4])
    usable = evidence.get("resolution_status") == "resolved"
    if usable:
        _refresh_local_from_discovery(evidence)
    return {**lookup_runtime_environment(environment_type), "resolution_source": "AUTONOMOUS_DISCOVERY", "discovery": evidence, "usable": usable}


def _refresh_local_from_discovery(evidence: dict) -> None:
    """Persist only validated, non-sensitive discovery metadata into the canonical registry."""
    if evidence.get("resolution_status") != "resolved" or evidence.get("secrets_read") or evidence.get("external_writes"):
        return
    with SessionLocal() as session:
        row = session.get(RuntimeEnvironmentRegistryDB, REGISTRY_ID)
        if row is None:
            return
        environments = list(row.environments or [])
        local = next((dict(item) for item in environments if item.get("environment_type") == "LOCAL"), None)
        if local is None:
            return
        observed_at = evidence.get("observed_at")
        local.update({"last_verified_at": observed_at, "health_status": "healthy"})
        for key in ("iam", "network"):
            discovered = dict(evidence.get(key) or {})
            current = dict(local.get(key) or {})
            current.update({"verification_status": "verified", "last_verified_at": observed_at, "evidence_refs": [((discovered.get("evidence") or {}).get("evidence_id"))]})
            local[key] = current
        row.environments = [local if item.get("environment_type") == "LOCAL" else item for item in environments]
        row.version += 1
        session.commit()
