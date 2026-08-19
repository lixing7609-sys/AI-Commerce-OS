from dataclasses import replace

import pytest

from app.founder_ai.codex_authorization import build_authorization_envelope, evaluate_codex_request, apply_founder_scope
from app.founder_ai.execution_registry import authorize_codex_request, create_execution_session, get_execution_session
from app.founder_ai.api import CodexBoundaryDecisionIn, decide_codex_boundary
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


@pytest.fixture(autouse=True)
def selected_engine(monkeypatch):
    from app.founder_ai import execution_registry
    monkeypatch.setattr(execution_registry, "resolve_execution_capability", lambda: {"execution_engine_id": "codex"})


def envelope():
    draft = generate_task_asset_draft("局部 UI 修改", context={"relevant_files": [{"path": "frontend/src/sino-founder"}]})
    package = replace(build_execution_package(draft), execution_allowed=True)
    return build_authorization_envelope("task-1", "execution-1", package)


@pytest.mark.parametrize("operation", ["pytest", "localhost_curl", "git_diff_check", "frontend_build", "app_service_restart", "safe_technical_resolution"])
def test_local_low_risk_operations_are_auto_approved(operation):
    result = evaluate_codex_request({"request_id": operation, "operation_type": operation}, envelope())
    assert result["decision"] == "auto_approved"
    assert result["authorized_by"] == "SINO"
    assert result["founder_action_required"] is False


def test_scoped_patch_and_verified_checkpoint_are_auto_approved():
    scoped = evaluate_codex_request({"operation_type": "repo_patch", "requested_paths": ["frontend/src/sino-founder/SinoBrainContext.jsx"]}, envelope())
    checkpoint = evaluate_codex_request({"operation_type": "checkpoint", "requested_paths": ["frontend/src/sino-founder/SinoBrainContext.jsx"], "verification_passed": True, "ownership_resolved": True}, envelope())
    assert scoped["decision"] == checkpoint["decision"] == "auto_approved"


@pytest.mark.parametrize("operation_request", [
    {"operation_type": "external_paid_api", "incremental_cost": True},
    {"operation_type": "credential_use", "credential_use": True},
    {"operation_type": "production_write", "production_write": True},
    {"operation_type": "full_disk_access"},
])
def test_founder_boundaries_are_escalated(operation_request):
    result = evaluate_codex_request(operation_request, envelope())
    assert result["decision"] == "founder_authorization_required"
    assert result["founder_action_required"] is True


@pytest.mark.parametrize("operation", ["git_reset_hard", "git_clean_fd", "force_push", "kill_unrelated_process", "unrelated_repo_write"])
def test_destructive_or_unrelated_operations_are_denied(operation):
    assert evaluate_codex_request({"operation_type": operation}, envelope())["decision"] == "denied"


def test_ambiguous_operation_is_reduced_before_founder_interruption():
    result = evaluate_codex_request({"operation_type": "unknown_python_action"}, envelope())
    assert result["decision"] == "needs_scope_reduction"
    assert result["founder_action_required"] is False


def test_exact_founder_external_scope_can_be_used_but_not_escaped():
    approved = apply_founder_scope(envelope(), {"external_calls_allowed": True, "provider_scope": ["openai"], "probe_count": 1, "cost_ceiling": 0.01})
    inside = evaluate_codex_request({"operation_type": "external_api_call", "provider": "openai", "estimated_cost": 0.005}, approved)
    outside = evaluate_codex_request({"operation_type": "external_api_call", "provider": "gemini", "estimated_cost": 0.005}, approved)
    assert inside["decision"] == "auto_approved"
    assert outside["decision"] == "founder_authorization_required"


def test_audit_is_persistent_and_idempotent():
    draft = generate_task_asset_draft("本地检查")
    session = create_execution_session("task-audit", build_execution_package(draft))
    first = authorize_codex_request(session.id, {"request_id": "request-1", "operation_type": "pytest"})
    second = authorize_codex_request(session.id, {"request_id": "request-1", "operation_type": "pytest"})
    restored, _ = get_execution_session(session.id)
    assert first == second
    assert len([item for item in restored.authorization_audit if item["request_id"] == "request-1"]) == 1


def test_boundary_only_sets_pending_action_for_founder():
    session = create_execution_session("task-boundary", build_execution_package(generate_task_asset_draft("本地任务")))
    authorize_codex_request(session.id, {"request_id": "local", "operation_type": "pytest"})
    assert get_execution_session(session.id)[0].pending_codex_authorization is None
    authorize_codex_request(session.id, {"request_id": "external", "operation_type": "external_paid_api", "incremental_cost": True})
    assert get_execution_session(session.id)[0].pending_codex_authorization["request_id"] == "external"


def test_founder_approval_extends_only_bounded_scope_and_clears_action():
    session = create_execution_session("task-gate", build_execution_package(generate_task_asset_draft("外部连通性验证")))
    authorize_codex_request(session.id, {"request_id": "probe", "operation_type": "external_paid_api", "incremental_cost": True, "provider": "openai", "estimated_cost": 0.01})
    result = decide_codex_boundary(session.id, CodexBoundaryDecisionIn(action="approve", approved_scope={"external_calls_allowed": True, "provider_scope": ["openai"], "probe_count": 1, "cost_ceiling": 0.01}))
    restored, _ = get_execution_session(session.id)
    assert result["auto_resume"] is True
    assert restored.pending_codex_authorization is None
    assert restored.authorization_envelope["provider_scope"] == ["openai"]
    assert restored.authorization_envelope["destructive_ops"] is False


def test_founder_rejection_does_not_expand_envelope_or_resume():
    session = create_execution_session("task-reject", build_execution_package(generate_task_asset_draft("外部验证")))
    authorize_codex_request(session.id, {"request_id": "prod", "operation_type": "production_write", "production_write": True})
    result = decide_codex_boundary(session.id, CodexBoundaryDecisionIn(action="reject"))
    restored, _ = get_execution_session(session.id)
    assert result == {"decision": "rejected", "auto_resume": False}
    assert restored.authorization_envelope["production_write"] is False
    assert restored.pending_codex_authorization is None
