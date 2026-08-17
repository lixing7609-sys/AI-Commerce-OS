from app.founder_ai.task_closure import build_closure_contract, close_task_if_ready


def payload(*, goal="Validate the runtime"):
    result = {"result_id": "result", "package_id": "p", "handoff_id": "h", "execution_session_id": "s", "action_contract_id": "a", "execution_goal": goal, "final_status": "completed", "verification_status": "PASS", "action_results": [{"action_id": f"x{i}", "status": "PASS"} for i in range(5)], "fail_count": 0, "blocked_count": 0, "side_effects": {"LOCAL_RUNTIME_MUTATION": []}, "founder_gate_reentry": False}
    post = {"result_record": result, "artifacts": [{"artifact_id": "artifact"}], "learnings": [{"learning_id": "learning"}], "decision_memory": {"links": ["credential", "cost", "external", "production"]}, "reuse_candidate": {"reuse_candidate_id": "reuse", "status": "candidate"}}
    package = {"package_id": "p", "active_executor_handoff_v2": {"handoff_id": "h"}, "active_machine_action_contract": {"action_contract_id": "a"}}
    return package, post


def test_closure_ready_when_claim_and_effects_align(monkeypatch):
    monkeypatch.setattr("app.founder_ai.task_closure.list_execution_sessions", lambda: [])
    package, post = payload()
    contract = build_closure_contract(package=package, post_execution=post, working_tree_clean=True, historical_integrity=True)
    assert contract["closure_status"] == "closure_ready"
    assert contract["founder_decision_required"] is False
    updated, record = close_task_if_ready(package=package, contract=contract, post_execution=post)
    assert updated["task_closed"] is True and record["closed_by"] == "sino_autonomous_closure"
    assert updated["reuse_candidate"]["status"] == "candidate"


def test_configuration_goal_with_read_only_result_requires_founder_closure(monkeypatch):
    monkeypatch.setattr("app.founder_ai.task_closure.list_execution_sessions", lambda: [])
    package, post = payload(goal="Configure storage, compute, IAM, and network and validate them")
    contract = build_closure_contract(package=package, post_execution=post, working_tree_clean=True, historical_integrity=True)
    assert contract["closure_checklist"]["completion_claim_supported"] is False
    assert contract["closure_status"] == "founder_closure_decision_required"
    assert contract["founder_decision_required"] is True
    updated, record = close_task_if_ready(package=package, contract=contract, post_execution=post)
    assert updated["task_status"] == "completed_pending_closure"
    assert updated["task_closed"] is False and record is None


def test_missing_closure_evidence_blocks_without_closing(monkeypatch):
    monkeypatch.setattr("app.founder_ai.task_closure.list_execution_sessions", lambda: [])
    package, post = payload(); post["artifacts"] = []
    contract = build_closure_contract(package=package, post_execution=post, working_tree_clean=True, historical_integrity=True)
    assert contract["closure_status"] == "closure_blocked"
    updated, record = close_task_if_ready(package=package, contract=contract, post_execution=post)
    assert updated["task_closed"] is False and record is None
