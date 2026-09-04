from types import SimpleNamespace

from app.founder_ai.post_execution_commit import build_post_execution_records


def completed_session():
    actions = []
    capabilities = (("wi-cloud-001", "VERIFY_CONNECTIVITY", "storage"), ("wi-cloud-002", "VERIFY_CAPABILITY", "compute"), ("wi-cloud-003", "VERIFY_CONFIGURATION", "iam"), ("wi-cloud-004", "VERIFY_CONFIGURATION", "network"), ("wi-cloud-005", "READ_ONLY_VALIDATE", "validation"))
    for index, (work_item, operation, target) in enumerate(capabilities, 1):
        actions.append({"action_id": f"a{index}", "work_item_id": work_item, "operation_type": operation, "target": {"target_id": target}, "verification_result": "PASS", "status": "PASS", "evidence_refs": [f"e{index}"], "commands_or_adapter_calls": ["read-only"]})
    return SimpleNamespace(id="session-v2", status="completed", result={"package_id": "p", "handoff_id": "h", "action_contract_id": "ac", "action_contract_fingerprint": "af", "scope_fingerprint_v2": "sf", "started_at": "start", "completed_at": "end", "execution_status": "completed", "verification_result": "PASS", "action_results": actions, "pass_count": 5, "fail_count": 0, "blocked_count": 0, "side_effects": {"READ_ONLY": ["a1"]}, "founder_gate_reentry": False, "working_tree_status": "clean"})


def test_builds_result_artifacts_learning_memory_reuse_and_keeps_bindings_specific():
    package = {"active_executor_handoff_v2": {"execution_goal": "validate runtime"}, "founder_gate_proposal": {"proposal_id": "proposal"}}
    records = build_post_execution_records(package=package, session=completed_session(), repository_head="head")
    assert records["result_record"]["pass_count"] == 5
    assert len(records["artifacts"]) == 5
    assert {item["artifact_type"] for item in records["artifacts"]} >= {"VALIDATION_RESULT", "IAM_CONFIGURATION_EVIDENCE", "NETWORK_CONFIGURATION_EVIDENCE"}
    assert len(records["learnings"]) == 9
    assert {item["learning_type"] for item in records["learnings"]} >= {"VALIDATED_FACT", "GUARDRAIL", "REUSE_RULE"}
    assert records["decision_memory"]["links"] == ["Credential Authorization", "Cost Authorization", "External Side Effect Authorization", "Production Impact Authorization"]
    candidate = records["reuse_candidate"]
    assert candidate["capability"] == "development-runtime-validation"
    assert "environment-specific bindings are inputs" in candidate["side_effect_boundary"]
    assert candidate["status"] == "candidate"


def test_rejects_unverified_or_incomplete_session():
    session = completed_session(); session.status = "blocked"
    try:
        build_post_execution_records(package={}, session=session, repository_head="head")
    except ValueError as error:
        assert str(error) == "completed_verified_session_required"
    else:
        raise AssertionError("blocked session must not materialize learning")
