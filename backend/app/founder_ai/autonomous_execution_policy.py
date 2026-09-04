"""Authoritative autonomous execution policy for Sino-controlled work."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence


AUTO_CONTINUE = "AUTO_CONTINUE"
FOUNDER_APPROVAL_REQUIRED = "FOUNDER_APPROVAL_REQUIRED"

READ_ONLY_OPERATIONS = {"REPO_INSPECTION", "ANALYTICAL_INSPECTION"}
TEST_OPERATIONS = {"FOCUSED_TEST"}
BUILD_OPERATIONS = {"FRONTEND_BUILD"}
BOUNDED_LOCAL_DEVELOPMENT_OPERATIONS = {"BOUNDED_CODE_CHANGE"}

REMOTE_WRITE_OPERATIONS = {"SAFE_PUSH", "SAFE_INTEGRATION_PUSH"}
HIGH_RISK_LOCAL_OPERATIONS = {"SAFE_MERGE", "HIGH_RISK_OPERATION"}


@dataclass(frozen=True, slots=True)
class AutonomousExecutionDecision:
    decision: str
    reason: str
    approval_required: bool
    auto_continue: bool

    def to_dict(self) -> dict:
        return {
            "decision": self.decision,
            "reason": self.reason,
            "approval_required": self.approval_required,
            "auto_continue": self.auto_continue,
        }


def decide_autonomous_execution(
    *,
    operation_type: str | None,
    risk_level: str | None,
    side_effect: bool | None = None,
    read_only: bool | None = None,
    remote_write: bool | None = None,
    destructive: bool | None = None,
    production: bool | None = None,
    credential: bool | None = None,
    bounded_scope: bool | None = None,
    requested_files: Sequence[str] | None = None,
    branch: str | None = None,
    current_authorization: Mapping | None = None,
) -> AutonomousExecutionDecision:
    """Decide whether Sino may continue without a Founder Action Queue item.

    UNKNOWN is never treated as LOW. The policy is intentionally conservative:
    only explicit low-risk local/read-only/test/build work or already-approved
    bounded local development may auto-continue.
    """
    operation = (operation_type or "UNKNOWN").strip() or "UNKNOWN"
    risk = (risk_level or "UNKNOWN").strip().upper() or "UNKNOWN"
    authorization = dict(current_authorization or {})

    if operation == "UNKNOWN" or risk == "UNKNOWN":
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "unknown_operation_or_risk", True, False)
    if risk == "HIGH" or operation in HIGH_RISK_LOCAL_OPERATIONS:
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "high_risk_requires_founder_approval", True, False)
    if remote_write or operation in REMOTE_WRITE_OPERATIONS:
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "remote_write_requires_founder_approval", True, False)
    if destructive:
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "destructive_operation_requires_founder_approval", True, False)
    if production:
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "production_operation_requires_founder_approval", True, False)
    if credential:
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "credential_operation_requires_founder_approval", True, False)

    if operation in READ_ONLY_OPERATIONS:
        if risk == "LOW" and read_only is not False and side_effect is not True:
            return AutonomousExecutionDecision(AUTO_CONTINUE, "low_risk_read_only_operation", False, True)
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "read_only_operation_not_proven_low_risk", True, False)

    if operation in TEST_OPERATIONS:
        if risk == "LOW" and side_effect is not True:
            return AutonomousExecutionDecision(AUTO_CONTINUE, "low_risk_allowlisted_test", False, True)
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "test_operation_not_proven_low_risk", True, False)

    if operation in BUILD_OPERATIONS:
        if risk == "LOW" and side_effect is not True:
            return AutonomousExecutionDecision(AUTO_CONTINUE, "low_risk_local_build", False, True)
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "build_operation_not_proven_low_risk", True, False)

    if operation in BOUNDED_LOCAL_DEVELOPMENT_OPERATIONS:
        approved = bool(authorization.get("founder_approved") or authorization.get("approval_action_id"))
        has_scope = bool(bounded_scope or requested_files)
        if approved and has_scope and risk in {"LOW", "MEDIUM"} and side_effect is not True:
            return AutonomousExecutionDecision(AUTO_CONTINUE, "founder_approved_bounded_local_development", False, True)
        return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "bounded_local_development_requires_scope_and_approval", True, False)

    return AutonomousExecutionDecision(FOUNDER_APPROVAL_REQUIRED, "operation_not_allowlisted_for_autonomous_continue", True, False)


def decide_from_risk(risk_decision: Mapping, *, context: Mapping | None = None) -> dict:
    """Build an auditable policy decision from existing runtime fields."""
    risk = dict(risk_decision or {})
    ctx = dict(context or {})
    operation_type = risk.get("operation_type") or ctx.get("operation_type")
    requested_files = risk.get("requested_files") or ctx.get("requested_files") or ctx.get("allowed_files")
    bounded_scope = bool(risk.get("bounded_scope") or ctx.get("bounded_scope") or requested_files or ctx.get("allowed_directories"))
    approval_required = bool(risk.get("approval_required"))
    authorization = {
        "founder_approved": bool(ctx.get("founder_approved") or (operation_type == "BOUNDED_CODE_CHANGE" and risk.get("approval_action_id"))),
        "approval_action_id": risk.get("approval_action_id") or ctx.get("approval_action_id"),
    }
    decision = decide_autonomous_execution(
        operation_type=operation_type,
        risk_level=risk.get("risk_level"),
        side_effect=risk.get("side_effect") if "side_effect" in risk else ctx.get("side_effect"),
        read_only=risk.get("read_only") if "read_only" in risk else ctx.get("read_only"),
        remote_write=bool(risk.get("remote_write") or ctx.get("remote_write") or operation_type in REMOTE_WRITE_OPERATIONS),
        destructive=bool(risk.get("destructive") or ctx.get("destructive")),
        production=bool(risk.get("production") or ctx.get("production")),
        credential=bool(risk.get("credential") or ctx.get("credential")),
        bounded_scope=bounded_scope,
        requested_files=requested_files,
        branch=risk.get("branch") or ctx.get("branch"),
        current_authorization=authorization,
    ).to_dict()
    if approval_required and decision["decision"] == AUTO_CONTINUE and operation_type != "BOUNDED_CODE_CHANGE":
        return AutonomousExecutionDecision(
            FOUNDER_APPROVAL_REQUIRED,
            "existing_risk_decision_requires_founder_approval",
            True,
            False,
        ).to_dict()
    return decision
