from pathlib import Path

from app.founder_ai import execution_readiness as module


def package():
    return {
        "package_id": "execution-package-1", "project_id": "project-1", "scope": ["Configure bounded runtime dependencies."],
        "work_items": [{"work_item_id": "wi-1", "scope": "Configure storage binding", "validation": "storage ready"}],
        "execution_order": ["wi-1"], "expected_artifacts": [{"work_item_id": "wi-1", "title": "storage result"}],
        "validation_plan": {"work_items": [{"work_item_id": "wi-1", "validation": "storage ready"}]}, "acceptance_criteria": ["storage ready"],
        "rollback_plan": [{"area": "configuration", "strategy": "restore prior binding"}],
        "approval_ref": {"status": "approved"}, "preflight_status": "ready", "execution_status": "not_started",
        "executor_requirements": {"executor_provider": "codex"},
        "runtime_binding": {"binding_status": "passed", "resource_bindings": [{"logical_dependency": "storage", "concrete_target": "isolated development database", "status": "resolved"}]},
        "autonomous_checkpoint": {"commit_hash": "abc123"},
    }


def git_state(monkeypatch, *, dirty=False, anchor=True):
    monkeypatch.setattr(module, "_git", lambda _root, *args: "feature/test" if args[0] == "branch" else "abc123" if args[0] == "rev-parse" else " M changed.py" if dirty else "")
    monkeypatch.setattr(module.subprocess, "run", lambda *args, **kwargs: type("Result", (), {"returncode": 0 if anchor else 1})())


def test_ready_contract_is_bounded_and_does_not_start_execution(monkeypatch, tmp_path):
    git_state(monkeypatch)
    result = module.build_execution_readiness_contract(package=package(), project={"project_id": "project-1", "name": "Cloud"}, repo_root=tmp_path)
    assert result["readiness_status"] == "execution_readiness_ready"
    assert result["founder_decision_required"] is False
    assert result["execution_status"] == "not_started"
    assert result["execution_scope"]["allowed_files_or_paths"]["repository_paths"] == []
    assert result["execution_scope"]["allowed_files_or_paths"]["runtime_targets"][0]["path"] == "runtime-binding://project-1/storage"
    assert result["side_effect_contract"]["LOCAL_RUNTIME_SIDE_EFFECT"]["allowed"] is True
    assert result["side_effect_contract"]["CLOUD_INFRASTRUCTURE_SIDE_EFFECT"]["allowed"] is False
    assert result["rollback_contract"]["rollback_anchor"] == "abc123"


def test_dirty_tree_blocks_readiness_without_founder_gate(monkeypatch, tmp_path):
    git_state(monkeypatch, dirty=True)
    result = module.build_execution_readiness_contract(package=package(), project={}, repo_root=tmp_path)
    assert result["readiness_status"] == "execution_readiness_blocked"
    assert result["readiness_checks"]["working_tree_clean"] is False
    assert result["founder_decision_required"] is False


def test_new_authorization_boundary_routes_to_founder_gate(monkeypatch, tmp_path):
    git_state(monkeypatch)
    payload = package(); payload["runtime_binding"]["binding_status"] = "unresolved"
    result = module.build_execution_readiness_contract(package=payload, project={}, repo_root=tmp_path)
    assert result["readiness_status"] == "execution_founder_gate_required"
    assert result["founder_decision_required"] is True


def test_missing_rollback_anchor_blocks_machine_validation(monkeypatch, tmp_path):
    git_state(monkeypatch, anchor=False)
    result = module.build_execution_readiness_contract(package=package(), project={}, repo_root=tmp_path)
    assert result["validation_result"] == "BLOCKED"
    assert result["readiness_checks"]["rollback_anchor_available"] is False
