from app.founder_ai.action_contract import compile_action_contract


def test_compiler_binds_observed_targets_and_blocks_designed_only_targets():
    package = {
        "package_id": "package-1", "work_items": [
            {"work_item_id": "wi-1", "title": "Configure storage"}, {"work_item_id": "wi-2", "title": "Configure compute"},
            {"work_item_id": "wi-3", "title": "Configure IAM"}, {"work_item_id": "wi-4", "title": "Configure network"},
            {"work_item_id": "wi-5", "title": "Overall runtime validation"},
        ],
        "execution_readiness_contract": {"contract_id": "readiness-1", "execution_scope": {"included_capabilities": ["storage", "compute", "iam", "network", "overall_runtime_validation"]}},
        "executor_handoff": {"scope_fingerprint": "scope-1"},
    }
    proposal = {"content": {"environment_discovery": {"candidate_infrastructure": [
        {"logical_dependency": "storage", "candidate": "Development DB", "availability": "ACTIVE"},
        {"logical_dependency": "compute", "candidate": "Development process", "availability": "ACTIVE"},
    ]}}}
    result = compile_action_contract(package=package, proposal=proposal, source_handoff_id="handoff-1", source_session_id="session-1", source_scope_fingerprint="scope-1")
    assert result["compilation_status"] == "action_compilation_blocked"
    assert result["executable_action_count"] == 2
    assert result["blocked_action_count"] == 3
    assert result["founder_gate_action_count"] == 0
    assert result["scope_validation"]["status"] == "passed"
    storage = next(item for item in result["actions"] if item["capability"] == "storage")
    assert storage["operation_type"] == "VERIFY_CONNECTIVITY"
    assert storage["target"]["target_id"] == "observed-runtime/storage/current-postgresql-development-database"
    assert storage["side_effect_class"] == ["READ_ONLY"]
    iam = next(item for item in result["actions"] if item["capability"] == "iam")
    assert iam["target"] is None
    assert iam["action_status"] == "ACTION_BLOCKED_MISSING_EVIDENCE"
    assert result["founder_decision_required"] is False


def test_scope_fingerprint_mismatch_fails_scope_validation():
    package = {"package_id": "package-1", "work_items": [], "execution_readiness_contract": {"execution_scope": {"included_capabilities": []}}, "executor_handoff": {"scope_fingerprint": "original"}}
    result = compile_action_contract(package=package, proposal={}, source_handoff_id="handoff", source_session_id="session", source_scope_fingerprint="changed")
    assert result["scope_validation"]["status"] == "failed"
    assert result["compilation_status"] == "action_compilation_blocked"
