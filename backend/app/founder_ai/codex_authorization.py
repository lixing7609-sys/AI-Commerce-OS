"""Task-scoped Sino authorization for Codex operations.

This is deliberately narrower than a Founder Gate: ordinary local operations
are authorized inside a frozen task envelope, while external or irreversible
effects are surfaced as Founder boundaries.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from typing import Any

from .orchestrator import ExecutionPackage


AUTO_APPROVED_OPERATIONS = {
    "repo_read", "localhost_curl", "conversation_read", "workspace_read", "execution_read",
    "git_status", "git_diff", "git_diff_check", "git_log", "git_show", "targeted_test",
    "pytest", "frontend_test", "frontend_build", "lint", "localhost_browser_verification",
    "repo_patch", "checkpoint", "worker_reconciliation", "callback_reconciliation",
    "app_process_inspection", "app_service_restart", "app_health_check", "repo_lock_check",
    "safe_technical_resolution", "non_destructive_retry",
}
READ_ONLY_OPERATIONS = {
    "repo_read", "conversation_read", "workspace_read", "execution_read", "git_status",
    "git_diff", "git_diff_check", "git_log", "git_show", "app_process_inspection",
    "app_health_check", "repo_lock_check", "localhost_curl",
}
FOUNDER_BOUNDARY_OPERATIONS = {
    "architecture_decision", "external_api_call", "external_paid_api", "credential_use",
    "credential_scope_expansion", "production_write", "cloud_mutation", "nas_mutation",
    "external_account_action", "irreversible_operation", "important_asset_delete",
    "scope_expansion", "cross_project_write", "high_risk_migration", "founder_acceptance",
    "sudo", "system_security_change", "macos_privacy", "full_disk_access",
}
DENIED_OPERATIONS = {
    "git_reset_hard", "git_clean_fd", "force_push", "destructive_rebase",
    "rewrite_shared_history", "kill_unrelated_process", "unrelated_repo_write",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalized_paths(package: ExecutionPackage) -> list[str]:
    paths: list[str] = []
    context = package.context if isinstance(package.context, dict) else {}
    for owner in (context, context.get("repository_context") or {}, context.get("code_context") or {}):
        for item in owner.get("relevant_files") or []:
            value = item if isinstance(item, str) else item.get("path")
            if value and value not in paths:
                paths.append(str(value).lstrip("./"))
    scope = package.task_asset.scope or {}
    for item in scope.get("allowed_files_or_paths") or scope.get("allowed_paths") or []:
        value = item if isinstance(item, str) else item.get("path")
        if value and value not in paths:
            paths.append(str(value).lstrip("./"))
    return paths


@dataclass
class TaskAuthorizationEnvelope:
    envelope_id: str
    task_id: str
    execution_id: str
    allowed_repo: str
    allowed_paths: list[str]
    allowed_operation_types: list[str] = field(default_factory=lambda: sorted(AUTO_APPROVED_OPERATIONS))
    local_only: bool = True
    external_calls_allowed: bool = False
    credential_scope: list[str] = field(default_factory=list)
    provider_scope: list[str] = field(default_factory=list)
    probe_count: int = 0
    cost_ceiling: float = 0.0
    production_write: bool = False
    destructive_ops: bool = False
    checkpoint_allowed: bool = True
    test_allowed: bool = True
    build_allowed: bool = True
    localhost_verification: bool = True
    service_restart_allowed: bool = True
    created_at: str = field(default_factory=_now)


def build_authorization_envelope(task_id: str, execution_id: str, package: ExecutionPackage, *, repo: str | Path = "AI-Commerce-OS") -> dict[str, Any]:
    repo_name = Path(repo).name
    paths = _normalized_paths(package)
    marker = json.dumps({"task": task_id, "execution": execution_id, "repo": repo_name, "paths": paths}, sort_keys=True)
    return asdict(TaskAuthorizationEnvelope(
        envelope_id=f"auth-envelope-{sha256(marker.encode()).hexdigest()[:16]}",
        task_id=task_id, execution_id=execution_id, allowed_repo=repo_name, allowed_paths=paths,
    ))


def _paths_allowed(requested: list[str], envelope: dict[str, Any], *, read_only: bool) -> bool:
    if not requested or read_only:
        return True
    allowed = [str(item).rstrip("/") for item in envelope.get("allowed_paths") or []]
    if not allowed:
        return False
    return all(any(path == root or path.startswith(f"{root}/") for root in allowed) for path in requested)


def evaluate_codex_request(request: dict[str, Any], envelope: dict[str, Any]) -> dict[str, Any]:
    operation = str(request.get("operation_type") or "unknown").lower()
    request_id = str(request.get("request_id") or f"codex-request-{sha256(json.dumps(request, sort_keys=True, default=str).encode()).hexdigest()[:16]}")
    requested_paths = [str(item).lstrip("./") for item in request.get("requested_paths") or []]
    external = bool(request.get("external_effect") not in (None, False, "", "none") or request.get("incremental_cost") or request.get("credential_use") or request.get("production_write"))
    destructive = bool(request.get("destructive") or operation in DENIED_OPERATIONS)
    within_scope = _paths_allowed(requested_paths, envelope, read_only=operation in READ_ONLY_OPERATIONS)
    boundary = operation in FOUNDER_BOUNDARY_OPERATIONS or external

    if destructive or operation in DENIED_OPERATIONS:
        decision, reason, risk = "denied", "Destructive or unrelated operation is outside the task envelope.", "high"
    elif boundary:
        already_allowed = (
            operation in {"external_api_call", "external_paid_api"}
            and envelope.get("external_calls_allowed")
            and not request.get("production_write")
            and float(request.get("estimated_cost") or 0) <= float(envelope.get("cost_ceiling") or 0)
            and (not request.get("provider") or request.get("provider") in (envelope.get("provider_scope") or []))
        ) or (operation == "production_write" and envelope.get("production_write")) or (
            operation == "credential_use" and request.get("credential_scope") in (envelope.get("credential_scope") or [])
        )
        if already_allowed:
            decision, reason, risk = "auto_approved", "Operation is inside the exact Founder-approved external scope.", "medium"
        else:
            decision, reason, risk = "founder_authorization_required", "The request crosses a Founder authorization boundary.", "high"
    elif operation not in AUTO_APPROVED_OPERATIONS:
        decision, reason, risk = "needs_scope_reduction", "Operation is ambiguous; classify or reduce its scope before escalating.", "unknown"
    elif not within_scope:
        decision, reason, risk = "denied", "Requested write paths are outside the current task scope.", "high"
    elif operation == "checkpoint" and not all(request.get(key) is True for key in ("verification_passed", "ownership_resolved")):
        decision, reason, risk = "denied", "Checkpoint requires passing verification and resolved working-tree ownership.", "medium"
    else:
        decision, reason, risk = "auto_approved", "Local, non-destructive operation is within the task authorization envelope.", "low"

    return {
        "request_id": request_id, "task_id": envelope["task_id"], "execution_id": envelope["execution_id"],
        "operation_type": operation, "resource_scope": requested_paths or request.get("resource_scope") or envelope.get("allowed_repo"),
        "risk_level": risk, "local_only": not external, "external_effect": request.get("external_effect") or "none",
        "credential_use": bool(request.get("credential_use")), "incremental_cost": bool(request.get("incremental_cost")),
        "production_write": bool(request.get("production_write")), "destructive": destructive,
        "within_task_scope": within_scope, "decision": decision, "decision_reason": reason,
        "authorized_by": "SINO" if decision == "auto_approved" else None,
        "authorized_at": _now() if decision == "auto_approved" else None,
        "task_envelope_id": envelope["envelope_id"], "founder_action_required": decision == "founder_authorization_required",
        "requested_scope": {
            "external_calls_allowed": operation in {"external_api_call", "external_paid_api"},
            "provider_scope": [request["provider"]] if request.get("provider") else [],
            "credential_scope": [request["credential_scope"]] if request.get("credential_scope") else [],
            "probe_count": int(request.get("probe_count") or 1) if operation in {"external_api_call", "external_paid_api"} else 0,
            "cost_ceiling": float(request.get("estimated_cost") or 0),
            "production_write": bool(request.get("production_write")),
        } if decision == "founder_authorization_required" else None,
    }


def apply_founder_scope(envelope: dict[str, Any], approved_scope: dict[str, Any]) -> dict[str, Any]:
    """Extend only the exact bounded scope approved by Founder (Path D)."""
    result = dict(envelope)
    result.update({
        "external_calls_allowed": bool(approved_scope.get("external_calls_allowed")),
        "provider_scope": list(approved_scope.get("provider_scope") or []),
        "credential_scope": list(approved_scope.get("credential_scope") or []),
        "probe_count": int(approved_scope.get("probe_count") or 0),
        "cost_ceiling": float(approved_scope.get("cost_ceiling") or 0),
        "production_write": bool(approved_scope.get("production_write")),
    })
    return result
