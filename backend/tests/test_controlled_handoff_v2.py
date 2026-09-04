from types import SimpleNamespace

import pytest

from app.founder_ai import controlled_handoff as module


def package():
    actions = [{"action_id": "a1", "work_item_id": "wi-1", "operation_type": "VERIFY_CONFIGURATION", "target_type": "config", "target": {"target_id": "t1"}, "evidence_refs": ["e1"], "side_effect_class": ["READ_ONLY"], "preconditions": ["clean"], "verification": {"pass": "true"}, "rollback": {"rollback_action": "none"}, "stop_conditions": ["drift"], "action_status": "executable"}]
    return {"package_id": "p1", "conversation_id": "c1", "approval_ref": {"status": "approved"}, "runtime_binding": {"binding_status": "passed"}, "preflight_status": "ready", "execution_status": "blocked", "execution_readiness_contract": {"contract_id": "r1", "executor": {"executor_provider": "codex"}, "execution_scope": {"execution_goal": "verify", "excluded_operations": ["write"]}, "verification_contract": {"tests": []}, "rollback_contract": {"anchor": "cp"}, "side_effect_contract": {"READ_ONLY": True}, "automatic_stop_conditions": [{"condition": "new_cost", "route": "founder_gate"}]}, "active_machine_action_contract": {"action_contract_id": "a-contract", "action_contract_fingerprint": "afp", "source_scope_fingerprint": "oldfp", "compilation_status": "action_compilation_ready", "blocked_action_count": 0, "founder_decision_required": False, "actions": actions}}


def expected():
    return {"package_id": "p1", "readiness_contract_id": "r1", "action_contract_id": "a-contract", "action_contract_fingerprint": "afp", "repository_checkpoint": "cp", "source_scope_fingerprint": "oldfp"}


def test_v2_freezes_machine_actions_and_creates_inert_versioned_session(monkeypatch):
    captured = {}
    def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(id=kwargs["session_id"], session_version=2, handoff_id=kwargs["handoff_id"], execution_package_id=kwargs["package_id"], readiness_contract_id=kwargs["readiness_contract_id"], action_contract_id=kwargs["action_contract_id"], action_contract_fingerprint=kwargs["action_contract_fingerprint"], scope_fingerprint=kwargs["scope_fingerprint"], executor=kwargs["executor_provider"], status="created", created_at="now", execution_started_at=None, completed_at=None)
    monkeypatch.setattr(module, "create_controlled_handoff_session_v2", create)
    handoff, session = module.create_controlled_handoff_v2(package=package(), expected=expected())
    assert handoff["handoff_version"] == 2
    assert handoff["machine_actions"] is not package()["active_machine_action_contract"]["actions"]
    assert handoff["machine_actions"][0]["target"] == {"target_id": "t1"}
    assert handoff["payload_priority"] == "machine_action_contract_over_natural_language_context"
    assert session.status == "created"
    assert session.execution_started_at is None and session.completed_at is None
    assert captured["action_contract_fingerprint"] == "afp"


def test_v2_rejects_blocked_action_contract(monkeypatch):
    value = package(); value["active_machine_action_contract"]["blocked_action_count"] = 1
    monkeypatch.setattr(module, "create_controlled_handoff_session_v2", lambda **_: (_ for _ in ()).throw(AssertionError("must not create")))
    with pytest.raises(ValueError, match="controlled_handoff_v2_preconditions_failed"):
        module.create_controlled_handoff_v2(package=value, expected=expected())


def test_v2_scope_fingerprint_changes_with_machine_target(monkeypatch):
    monkeypatch.setattr(module, "create_controlled_handoff_session_v2", lambda **kwargs: SimpleNamespace(id=kwargs["session_id"], session_version=2, handoff_id=kwargs["handoff_id"], execution_package_id=kwargs["package_id"], readiness_contract_id=kwargs["readiness_contract_id"], action_contract_id=kwargs["action_contract_id"], action_contract_fingerprint=kwargs["action_contract_fingerprint"], scope_fingerprint=kwargs["scope_fingerprint"], executor="codex", status="created", created_at="now", execution_started_at=None, completed_at=None))
    first, _ = module.create_controlled_handoff_v2(package=package(), expected=expected())
    changed = package(); changed["active_machine_action_contract"]["actions"][0]["target"] = {"target_id": "t2"}
    second, _ = module.create_controlled_handoff_v2(package=changed, expected=expected())
    assert first["scope_fingerprint"] != second["scope_fingerprint"]
