from pathlib import Path

from app.founder_ai import capability_reuse as module


def source_assets():
    results = []
    for index in range(1, 6):
        results.append({"work_item_id": f"wi-cloud-00{index}", "action_id": f"template-{index}", "evidence_refs": [f"e-{index}"]})
    package = {"task_id": "old-task", "task_closed": True, "conversation_id": "conv", "post_execution_commit": {"result_record": {"result_id": "old-result", "verification_status": "PASS", "action_results": results}}}
    candidate = {"reuse_candidate_id": "reuse-candidate-1f7d458e4c3e1a813c46", "confidence": "high", "founder_gate_conditions": ["new credential", "incremental cost"]}
    learnings = [{"learning_id": f"learning-{index}"} for index in range(9)]
    return package, candidate, learnings


def registry(valid=True):
    return {"validation": {"valid": valid, "freshness": "fresh", "health_status": "healthy"}, "environment": {"environment_id": "runtime-environment-local", "environment_type": "LOCAL", "last_verified_at": "now", "evidence_refs": ["runtime-evidence"], "services": [{"service_id": "founder_frontend", "host": "127.0.0.1", "port": 5173, "protocol": "http", "endpoint_reference": "runtime_environment.services.founder_frontend", "evidence_refs": ["network"]}, {"service_id": "founder_backend", "host": "127.0.0.1", "port": 8000, "protocol": "http", "endpoint_reference": "runtime_environment.services.founder_backend", "evidence_refs": ["compute"]}], "database": {"type": "PostgreSQL", "evidence_refs": ["db"]}, "iam": {"configuration_reference": "application-identity/intelligence-evolution-http-bearer-rbac", "evidence_refs": ["iam"]}, "network": {"boundary": "loopback", "evidence_refs": ["network"]}}}


def test_reuse_first_combines_templates_with_registry_bindings_and_skips_discovery(monkeypatch):
    monkeypatch.setattr(module, "_source_assets", source_assets)
    monkeypatch.setattr(module, "lookup_runtime_environment", lambda kind: registry())
    monkeypatch.setattr(module, "resolve_runtime_environment", lambda kind: (_ for _ in ()).throw(AssertionError("fallback must be skipped")))
    result = module.compile_reused_runtime_validation(repository_head="head")
    assert result["reuse"]["reuse_candidate_id"] == "reuse-candidate-1f7d458e4c3e1a813c46"
    assert len(result["reuse"]["reused_learning_ids"]) == 9
    assert result["reuse"]["discovery_skipped"] is True
    assert result["reuse"]["metrics"] == {"total_actions": 5, "reused_actions": 5, "newly_discovered_actions": 0, "discovery_calls": 0, "registry_hits": 1, "reuse_ratio": 1.0, "steps_omitted": ["runtime architecture proposal", "IAM discovery", "network discovery", "endpoint discovery", "Founder Gate"]}
    actions = result["action_contract"]["actions"]
    assert [item["reused_action_template"] for item in actions] == [f"template-{index}" for index in range(1, 6)]
    assert actions[1]["target"]["binding_ref"] == "runtime_environment.services.founder_backend"
    assert actions[3]["target"]["backend"]["port"] == 8000
    assert all(item["side_effect_class"] == ["READ_ONLY"] for item in actions)
    assert result["package"]["approval_ref"]["status"] == "not_required"


def test_invalid_registry_uses_existing_fallback_once(monkeypatch):
    monkeypatch.setattr(module, "_source_assets", source_assets)
    calls = []
    monkeypatch.setattr(module, "lookup_runtime_environment", lambda kind: registry(False))
    def fallback(kind):
        calls.append(kind)
        return registry(True)
    monkeypatch.setattr(module, "resolve_runtime_environment", fallback)
    result = module.compile_reused_runtime_validation(repository_head="head")
    assert calls == ["LOCAL"]
    assert result["reuse"]["metrics"]["discovery_calls"] == 1
    assert result["reuse"]["binding_refresh_required"] is True


def test_reuse_lineage_is_new_and_does_not_mutate_source(monkeypatch):
    source, candidate, learnings = source_assets()
    monkeypatch.setattr(module, "_source_assets", lambda: (source, candidate, learnings))
    monkeypatch.setattr(module, "lookup_runtime_environment", lambda kind: registry())
    result = module.compile_reused_runtime_validation(repository_head="head")
    assert result["task"]["task_id"] != source["task_id"]
    assert result["package"]["package_id"] != source.get("package_id")
    assert source["task_closed"] is True
    assert result["action_contract"]["founder_decision_required"] is False


def test_completed_reuse_session_is_idempotent_and_not_executed_again(tmp_path, monkeypatch):
    record = {"task": {"task_id": "reuse-task-existing", "status": "ready_for_execution"}, "execution_status": "completed"}
    path = tmp_path / ".founder-execution" / "reuse-validations" / "reuse-task-existing.json"
    path.parent.mkdir(parents=True); path.write_text(__import__("json").dumps(record))
    monkeypatch.setattr(module, "compile_reused_runtime_validation", lambda repository_head: {"task": record["task"], "package": {"package_id": "p", "execution_readiness_contract": {"contract_id": "r", "execution_scope": {"execution_goal": "g", "included_capabilities": [], "allowed_files_or_paths": [], "allowed_operations": [], "excluded_operations": []}, "executor": {}, "verification_contract": {}, "rollback_contract": {}, "side_effect_contract": {}, "automatic_stop_conditions": []}}, "action_contract": {"action_contract_id": "a", "action_contract_fingerprint": "af", "source_scope_fingerprint": "sf", "actions": []}, "reuse": {}})
    monkeypatch.setattr(module, "scope_fingerprint_v2", lambda *args: "scope")
    session = type("Session", (), {"status": "completed", "result": {"verification_result": "PASS"}})()
    monkeypatch.setattr(module, "create_controlled_handoff_session_v2", lambda **kwargs: session)
    monkeypatch.setattr(module, "execute_frozen_actions", lambda **kwargs: (_ for _ in ()).throw(AssertionError("must not execute again")))
    monkeypatch.setattr(module.subprocess, "run", lambda args, **kwargs: type("Result", (), {"stdout": "" if "status" in args else "head\n"})())
    result = module.execute_reused_runtime_validation(repo_root=tmp_path)
    assert result["task"]["status"] == "completed"
