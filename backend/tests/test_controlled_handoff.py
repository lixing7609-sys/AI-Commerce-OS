from types import SimpleNamespace

import pytest

from app.founder_ai import controlled_handoff as module


def ready_package():
    readiness = {
        "contract_id": "readiness-1", "checkpoint_commit": "abc123", "readiness_status": "execution_readiness_ready",
        "readiness_checks": {"working_tree_clean": True, "branch_matches_checkpoint": True},
        "execution_scope": {"execution_goal": "Configure isolated runtime", "included_capabilities": ["storage"], "allowed_files_or_paths": {"repository_paths": [], "runtime_targets": ["runtime://storage"]}, "allowed_operations": ["validate storage"], "excluded_operations": ["production write"]},
        "executor": {"executor_provider": "codex", "executor_role": "approved_package_executor"},
        "verification_contract": {"tests": ["storage ready"]}, "rollback_contract": {"rollback_anchor": "abc123"},
        "side_effect_contract": {"PRODUCTION_SIDE_EFFECT": {"allowed": False}},
        "automatic_stop_conditions": [{"condition": "production", "route": "founder_gate"}, {"condition": "dirty", "route": "autonomous_resolution"}],
    }
    return {
        "package_id": "package-1", "project_id": "project-1", "conversation_id": "conversation-1",
        "approval_ref": {"status": "approved"}, "runtime_binding": {"binding_status": "passed"},
        "preflight_status": "ready", "execution_status": "not_started", "autonomous_checkpoint": {"commit_hash": "abc123"},
        "execution_readiness_contract": readiness,
    }


def test_handoff_freezes_contract_and_creates_inert_session(monkeypatch):
    captured = {}
    def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id=kwargs["session_id"], handoff_id=kwargs["handoff_id"], execution_package_id=kwargs["package_id"], readiness_contract_id=kwargs["readiness_contract_id"], executor=kwargs["executor_provider"], scope_fingerprint=kwargs["scope_fingerprint"], status="created", created_at="now", execution_started_at=None, completed_at=None)
    monkeypatch.setattr(module, "create_controlled_handoff_session", create)
    handoff, session = module.create_controlled_handoff(package=ready_package(), expected_package_id="package-1", expected_readiness_contract_id="readiness-1", expected_checkpoint="abc123")
    assert handoff["package_id"] == "package-1"
    assert handoff["readiness_contract_id"] == "readiness-1"
    assert handoff["scope_fingerprint"] == captured["scope_fingerprint"]
    assert handoff["payload_priority"] == "frozen_contract_over_conversation_context"
    assert handoff["founder_gate_reentry_conditions"] == [{"condition": "production", "route": "founder_gate"}]
    assert session.status == "created"
    assert session.execution_started_at is None


def test_handoff_rejects_changed_package_or_contract(monkeypatch):
    monkeypatch.setattr(module, "create_controlled_handoff_session", lambda **_: (_ for _ in ()).throw(AssertionError("session must not be created")))
    with pytest.raises(ValueError, match="controlled_handoff_preconditions_failed"):
        module.create_controlled_handoff(package=ready_package(), expected_package_id="changed", expected_readiness_contract_id="readiness-1", expected_checkpoint="abc123")


def test_scope_fingerprint_is_stable():
    package = ready_package(); readiness = package["execution_readiness_contract"]
    assert module.scope_fingerprint(package, readiness) == module.scope_fingerprint(package, readiness)
    changed = {**readiness, "execution_scope": {**readiness["execution_scope"], "allowed_operations": ["different"]}}
    assert module.scope_fingerprint(package, readiness) != module.scope_fingerprint(package, changed)
