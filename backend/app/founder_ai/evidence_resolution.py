"""Read-only discovery for evidence-bound local IAM and network targets."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess


def _evidence_id(kind: str, source: str) -> str:
    return f"evidence-{kind}-{hashlib.sha256(source.encode()).hexdigest()[:12]}"


def _listener_observed(port: int) -> bool:
    result = subprocess.run(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"],
        text=True, capture_output=True, check=False,
    )
    return result.returncode == 0 and bool(result.stdout.strip())


def discover_iam_network_evidence(repo_root: Path) -> dict:
    """Observe only non-secret configuration metadata; never create or mutate targets."""
    observed_at = datetime.now(timezone.utc).isoformat()
    auth_path = repo_root / "backend/app/core/intelligence_evolution/auth.py"
    api_path = repo_root / "backend/app/core/intelligence_evolution/api.py"
    backend_server = repo_root / "scripts/backend-server"
    frontend_server = repo_root / "scripts/frontend-server"
    runtime_common = repo_root / "scripts/runtime-common.sh"

    auth_text = auth_path.read_text(errors="replace") if auth_path.is_file() else ""
    api_text = api_path.read_text(errors="replace") if api_path.is_file() else ""
    iam_observed = all(token in auth_text for token in ("HTTPBearer", "require_roles", "claims.get(\"roles\")")) and "Depends(require_roles" in api_text
    iam_source = "backend/app/core/intelligence_evolution/auth.py + api.py"
    iam_evidence = {
        "evidence_id": _evidence_id("iam", iam_source), "evidence_type": "application_authorization_configuration",
        "source": iam_source, "observed_value_type": "configuration_metadata", "observed_at": observed_at,
        "confidence": "high" if iam_observed else "low", "sensitive": False,
        "observations": {"http_bearer_configured": "HTTPBearer" in auth_text, "role_claim_validation_configured": "claims.get(\"roles\")" in auth_text, "protected_routes_registered": "Depends(require_roles" in api_text},
    }

    backend_text = backend_server.read_text(errors="replace") if backend_server.is_file() else ""
    frontend_text = frontend_server.read_text(errors="replace") if frontend_server.is_file() else ""
    runtime_text = runtime_common.read_text(errors="replace") if runtime_common.is_file() else ""
    loopback_configured = "--host 127.0.0.1 --port 8000" in backend_text and "--host 127.0.0.1 --port 5173" in frontend_text
    metadata_consistent = "http://127.0.0.1:8000/health" in runtime_text and "http://127.0.0.1:5173/" in runtime_text
    network_observed = loopback_configured and metadata_consistent
    network_source = "scripts/backend-server + frontend-server + runtime-common.sh"
    network_evidence = {
        "evidence_id": _evidence_id("network", network_source), "evidence_type": "development_loopback_boundary",
        "source": network_source, "observed_value_type": "endpoint_metadata", "observed_at": observed_at,
        "confidence": "high" if network_observed else "low", "sensitive": False,
        "observations": {"bind_address_type": "loopback", "backend_port": 8000, "frontend_port": 5173, "backend_listener_observed": _listener_observed(8000), "frontend_listener_observed": _listener_observed(5173), "database_host_type": "loopback_metadata"},
    }
    return {
        "resolution_status": "resolved" if iam_observed and network_observed else "technical_blocker",
        "read_only": True, "secrets_read": False, "external_writes": False, "incremental_cost": False,
        "production_impact": "none", "observed_at": observed_at,
        "iam": {"observed": iam_observed, "target_type": "application_rbac_configuration", "target": {"target_id": "application-identity/intelligence-evolution-http-bearer-rbac", "boundary": "application roles and bearer claim validation"} if iam_observed else None, "evidence": iam_evidence},
        "network": {"observed": network_observed, "target_type": "development_loopback_service_boundary", "target": {"target_id": "development-network/loopback/backend-8000-frontend-5173", "bind_address_type": "loopback", "service_ports": [8000, 5173], "database_host_type": "loopback_metadata"} if network_observed else None, "evidence": network_evidence},
    }
