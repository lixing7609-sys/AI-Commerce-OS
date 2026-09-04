from pathlib import Path

from app.founder_ai import autonomous_main_loop as module


def test_transition_selection_is_state_driven_and_only_stops_at_safe_boundaries():
    assert module.select_transition("idea_received", {})["next_state"] == "goal_structured"
    assert module.select_transition("verification", {})["capability"] == "execution_result"
    assert module.select_transition("completed", {}) == {"stop": True, "state": "completed"}
    assert module.select_transition("reuse_lookup", {"founder_gate_required": {"reason": "cost"}})["state"] == "founder_gate_required"
    assert module.select_transition("reuse_lookup", {"technical_blocker": {"reason": "evidence"}})["state"] == "technical_blocker"


def test_main_loop_runs_reuse_first_to_closure_without_manual_continue(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "_working_tree_clean", lambda root: True)
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: type("R", (), {"stdout": "head\n"})())
    plan = {"task": {"task_id": "lineage-task"}, "package": {"package_id": "package"}, "reuse": {"reuse_candidate_id": "reuse", "reused_learning_ids": ["l1"], "registry_binding_refs": ["env"], "reused_action_templates": ["a"] * 5, "discovery_skipped": True, "metrics": {"registry_hits": 1, "discovery_calls": 0, "reuse_ratio": 1.0}}, "action_contract": {"action_contract_id": "contract", "compilation_status": "action_compilation_ready"}}
    execution = {**plan, "execution_session_id": "session", "handoff": {"handoff_id": "handoff"}, "execution_status": "completed", "verification": {"result": "PASS", "counts": {"PASS": 5, "FAIL": 0, "BLOCKED": 0}}, "action_results": [{"action_id": str(i), "status": "PASS"} for i in range(5)]}
    monkeypatch.setattr(module, "compile_reused_runtime_validation", lambda repository_head: plan)
    monkeypatch.setattr(module, "execute_reused_runtime_validation", lambda repo_root: execution)
    result = module.run_autonomous_main_loop(repo_root=tmp_path, goal="validate local runtime", persist=False)
    assert result["current_state"] == "completed"
    assert result["task"]["task_closed"] is True
    assert result["manual_continue_count"] == 0 and result["founder_gate_count"] == 0
    assert result["result_record"]["verification_status"] == "PASS"
    assert result["closure"]["closure_status"] == "completed"
    assert [item["previous_state"] for item in result["progress_log"]] == ["idea_received", "goal_structured", "reuse_lookup", "action_contract", "verification", "post_execution_commit", "learning", "closure"]


def test_state_inconsistency_routes_to_technical_blocker_without_founder_gate(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "_working_tree_clean", lambda root: False)
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: type("R", (), {"stdout": "head\n"})())
    result = module.run_autonomous_main_loop(repo_root=tmp_path, goal="validate", persist=False)
    assert result["current_state"] == "technical_blocker"
    assert result["technical_blocker_count"] == 1
    assert result["founder_gate_count"] == 0


def test_cycle_limit_stops_as_main_loop_stalled(monkeypatch, tmp_path):
    monkeypatch.setattr(module, "_working_tree_clean", lambda root: True)
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: type("R", (), {"stdout": "head\n"})())
    result = module.run_autonomous_main_loop(repo_root=tmp_path, goal="validate", max_cycles=1, persist=False)
    assert result["current_state"] == "main_loop_stalled"
