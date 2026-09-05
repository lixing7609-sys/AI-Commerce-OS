"""Policy-driven permission adapter for Sino-managed Codex executions.

This adapter intentionally does not classify risk.  It consumes the
authoritative autonomous execution policy produced by
``autonomous_execution_policy.py`` and translates that single action decision
into the Codex subprocess permission mode.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any

from .autonomous_execution_policy import AUTO_CONTINUE, FOUNDER_APPROVAL_REQUIRED
from .orchestrator import ExecutionPackage


PERMISSION_AUTO_HANDLED = "PERMISSION_AUTO_HANDLED"
PERMISSION_FOUNDER_REQUIRED = "PERMISSION_FOUNDER_REQUIRED"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class CodexPermissionDecision:
    decision: str
    reason: str
    auto_handled: bool
    founder_action_required: bool
    codex_approval_policy: str | None
    policy_decision: str | None
    operation_type: str | None
    task_id: str | None
    execution_id: str | None
    scope: dict[str, Any]
    decided_at: str
    adapter: str = "sino_codex_permission_adapter_v1"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _policy_from_package(package: ExecutionPackage) -> dict[str, Any] | None:
    context = package.context if isinstance(package.context, dict) else {}
    policy = context.get("autonomous_execution_policy")
    if isinstance(policy, dict):
        return policy
    risk = context.get("risk_decision")
    if isinstance(risk, dict) and isinstance(risk.get("autonomous_execution_policy"), dict):
        return risk["autonomous_execution_policy"]
    operational = context.get("operational_runtime")
    if isinstance(operational, dict):
        nested = operational.get("autonomous_execution_policy")
        if isinstance(nested, dict):
            return nested
    return None


def _scope_from_package(package: ExecutionPackage) -> dict[str, Any]:
    context = package.context if isinstance(package.context, dict) else {}
    return {
        "operation_type": context.get("operation_type"),
        "risk_level": context.get("risk_level"),
        "allowed_files": list(context.get("allowed_files") or []),
        "allowed_directories": list(context.get("allowed_directories") or []),
        "repo_path": context.get("repo_path"),
        "remote_write": bool(context.get("remote_write")),
        "destructive": bool(context.get("destructive")),
        "production": bool(context.get("production")),
        "credential_change": bool(context.get("credential_change")),
    }


def _decide_codex_permission(package: ExecutionPackage) -> CodexPermissionDecision:
    context = package.context if isinstance(package.context, dict) else {}
    policy = _policy_from_package(package)
    scope = _scope_from_package(package)
    operation_type = str(context.get("operation_type") or "") or None
    task_id = str(context.get("task_id") or package.task_asset.title or "") or None
    execution_id = str(context.get("execution_id") or "") or None

    if not isinstance(policy, dict):
        return CodexPermissionDecision(
            decision=PERMISSION_FOUNDER_REQUIRED,
            reason="missing_authoritative_autonomous_execution_policy",
            auto_handled=False,
            founder_action_required=True,
            codex_approval_policy=None,
            policy_decision=None,
            operation_type=operation_type,
            task_id=task_id,
            execution_id=execution_id,
            scope=scope,
            decided_at=_now(),
        )

    policy_decision = str(policy.get("decision") or "")
    if policy_decision != AUTO_CONTINUE:
        return CodexPermissionDecision(
            decision=PERMISSION_FOUNDER_REQUIRED,
            reason=str(policy.get("reason") or "authoritative_policy_requires_founder_approval"),
            auto_handled=False,
            founder_action_required=True,
            codex_approval_policy=None,
            policy_decision=policy_decision or FOUNDER_APPROVAL_REQUIRED,
            operation_type=operation_type,
            task_id=task_id,
            execution_id=execution_id,
            scope=scope,
            decided_at=_now(),
        )

    return CodexPermissionDecision(
        decision=PERMISSION_AUTO_HANDLED,
        reason=str(policy.get("reason") or "authoritative_policy_auto_continue"),
        auto_handled=True,
        founder_action_required=False,
        codex_approval_policy="never",
        policy_decision=AUTO_CONTINUE,
        operation_type=operation_type,
        task_id=task_id,
        execution_id=execution_id,
        scope=scope,
        decided_at=_now(),
    )


def decide_codex_permission(package: ExecutionPackage) -> dict[str, Any]:
    """Return one auditable fail-closed Codex permission decision."""
    try:
        return _decide_codex_permission(package).to_dict()
    except Exception as error:  # pragma: no cover - exercised via monkeypatch.
        context = package.context if isinstance(package.context, dict) else {}
        return CodexPermissionDecision(
            decision=PERMISSION_FOUNDER_REQUIRED,
            reason="permission_adapter_exception",
            auto_handled=False,
            founder_action_required=True,
            codex_approval_policy=None,
            policy_decision=None,
            operation_type=str(context.get("operation_type") or "") or None,
            task_id=str(context.get("task_id") or package.task_asset.title or "") or None,
            execution_id=str(context.get("execution_id") or "") or None,
            scope={},
            decided_at=_now(),
        ).to_dict() | {"error": str(error)}
