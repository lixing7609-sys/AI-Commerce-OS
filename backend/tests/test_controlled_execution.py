from types import SimpleNamespace

from app.founder_ai.controlled_execution import blocked_execution_result, scope_guard


def test_scope_guard_blocks_descriptive_operations_before_any_command():
    result = scope_guard({"allowed_operations": [{"work_item_id": "wi-1", "operation": "Configure storage"}]})
    assert result["allowed"] is False
    assert result["status"] == "scope_guard_blocked"
    assert result["blocked_operations"] == ["wi-1"]
    assert result["founder_gate_reentry"] is False


def test_scope_guard_accepts_only_machine_bounded_actions():
    result = scope_guard({"allowed_operations": [{"work_item_id": "wi-1", "operation_type": "read_only_validation", "target": "runtime://storage", "side_effect_class": "LOCAL_RUNTIME_SIDE_EFFECT"}]})
    assert result["allowed"] is True


def test_blocked_result_records_no_repository_runtime_or_external_effects():
    package = {"package_id": "package-1"}; handoff = {"handoff_id": "handoff-1", "scope_fingerprint": "fp", "checkpoint_commit": "abc"}
    session = SimpleNamespace(id="session-1")
    guard = scope_guard({"allowed_operations": [{"work_item_id": "wi-1", "operation": "Configure storage"}]})
    result = blocked_execution_result(package=package, session=session, handoff=handoff, guard=guard, started_at="start")
    assert result["verification_results"]["result"] == "BLOCKED"
    assert result["commands_executed"] == []
    assert result["files_changed"] == []
    assert result["founder_gate_reentry"] is False
