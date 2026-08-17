from pathlib import Path
from types import SimpleNamespace

from app.founder_ai import controlled_execution_v2 as module


def test_frozen_actions_execute_in_order_and_aggregate_last(monkeypatch, tmp_path):
    actions = []
    for index, operation in enumerate(("VERIFY_CONNECTIVITY", "VERIFY_CAPABILITY", "VERIFY_CONFIGURATION", "VERIFY_CONFIGURATION", "READ_ONLY_VALIDATE"), 1):
        actions.append({"action_id": f"a{index}", "work_item_id": f"wi-cloud-00{index}", "operation_type": operation, "target": {"target_id": f"t{index}"}, "evidence_refs": [f"e{index}"], "side_effect_class": ["READ_ONLY"], "action_status": "executable"})
    monkeypatch.setattr(module, "_execute_adapter", lambda action, _root, _previous: ([f"adapter:{action['action_id']}"], {"ok": True}, "PASS", None))
    results, verification = module.execute_frozen_actions(handoff={"machine_actions": actions}, action_contract={"actions": actions}, repo_root=tmp_path)
    assert [item["work_item_id"] for item in results] == [f"wi-cloud-00{i}" for i in range(1, 6)]
    assert verification["result"] == "PASS"
    assert verification["counts"] == {"PASS": 5, "FAIL": 0, "BLOCKED": 0}


def test_action_drift_blocks_before_adapter(monkeypatch, tmp_path):
    action = {"action_id": "a", "work_item_id": "wi-cloud-001", "operation_type": "VERIFY_CONNECTIVITY", "target": {"target_id": "changed"}, "evidence_refs": ["e"], "side_effect_class": ["READ_ONLY"], "action_status": "executable"}
    canonical = {**action, "target": {"target_id": "original"}}
    monkeypatch.setattr(module, "_execute_adapter", lambda *_: (_ for _ in ()).throw(AssertionError("adapter must not run")))
    results, verification = module.execute_frozen_actions(handoff={"machine_actions": [action]}, action_contract={"actions": [canonical]}, repo_root=tmp_path)
    assert results[0]["status"] == "BLOCKED"
    assert results[0]["commands_or_adapter_calls"] == []
    assert verification["scope_drift"] is True


def test_wi_005_is_not_run_when_a_prerequisite_fails(monkeypatch, tmp_path):
    actions = [{"action_id": f"a{i}", "work_item_id": f"wi-cloud-00{i}", "operation_type": "VERIFY_CONFIGURATION", "target": {"target_id": f"t{i}"}, "evidence_refs": ["e"], "side_effect_class": ["READ_ONLY"], "action_status": "executable"} for i in range(1, 6)]
    monkeypatch.setattr(module, "_execute_adapter", lambda action, _root, _previous: ([], {}, "FAIL" if action["work_item_id"] == "wi-cloud-002" else "PASS", None))
    results, verification = module.execute_frozen_actions(handoff={"machine_actions": actions}, action_contract={"actions": actions}, repo_root=tmp_path)
    assert len(results) == 2
    assert verification["result"] == "FAIL"
