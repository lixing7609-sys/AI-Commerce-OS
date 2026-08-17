"""Machine-verifiable execution boundary derived from one canonical package."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from pathlib import Path
import subprocess


def _git(repo_root: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()


def build_execution_readiness_contract(*, package: dict, project: dict, repo_root: Path, baseline_checkpoint: str | None = None) -> dict:
    package_id = package.get("package_id")
    checkpoint = dict(package.get("autonomous_checkpoint") or {})
    runtime = dict(package.get("runtime_binding") or {})
    approval = dict(package.get("approval_ref") or {})
    executor = dict(package.get("executor_requirements") or {})
    branch = _git(repo_root, "branch", "--show-current")
    head = _git(repo_root, "rev-parse", "HEAD")
    dirty = [line for line in _git(repo_root, "status", "--porcelain=v1", "--untracked-files=all").splitlines() if line]
    checkpoint_commit = baseline_checkpoint or checkpoint.get("commit_hash")
    anchor_available = False
    if checkpoint_commit:
        anchor_available = subprocess.run(["git", "cat-file", "-e", f"{checkpoint_commit}^{{commit}}"], cwd=repo_root, capture_output=True).returncode == 0
    anchor_on_branch = bool(checkpoint_commit and anchor_available and subprocess.run(["git", "merge-base", "--is-ancestor", checkpoint_commit, head], cwd=repo_root, capture_output=True).returncode == 0)

    work_items = [dict(item) for item in package.get("work_items") or []]
    resource_bindings = [dict(item) for item in runtime.get("resource_bindings") or []]
    runtime_targets = [
        {"path": f"runtime-binding://{package.get('project_id')}/{item.get('logical_dependency')}", "target": item.get("concrete_target"), "status": item.get("status")}
        for item in resource_bindings
    ]
    included_capabilities = [item.get("logical_dependency") for item in resource_bindings] + ["overall_runtime_validation"]
    stop_conditions = [
        {"condition": "package_id_changed", "route": "sino_brain"},
        {"condition": "founder_approval_not_approved", "route": "founder_gate"},
        {"condition": "runtime_binding_not_passed", "route": "founder_gate"},
        {"condition": "preflight_not_ready", "route": "autonomous_resolution"},
        {"condition": "working_tree_dirty_before_executor_start", "route": "autonomous_working_tree_resolution"},
        {"condition": "scope_external_path_required", "route": "sino_brain"},
        {"condition": "unknown_or_sensitive_discovered", "route": "autonomous_resolution"},
        {"condition": "new_credential_required", "route": "founder_gate"},
        {"condition": "new_paid_resource_required", "route": "founder_gate"},
        {"condition": "external_service_write_required", "route": "founder_gate"},
        {"condition": "production_impact_discovered", "route": "founder_gate"},
        {"condition": "targeted_validation_unsatisfied", "route": "sino_brain"},
        {"condition": "rollback_anchor_unavailable", "route": "autonomous_resolution"},
    ]
    checks = {
        "package_identity": bool(package_id),
        "founder_approval": approval.get("status") == "approved",
        "runtime_binding": runtime.get("binding_status") == "passed",
        "preflight": package.get("preflight_status") == "ready",
        "execution_not_started": package.get("execution_status") == "not_started",
        "working_tree_clean": not dirty,
        "branch_matches_checkpoint": bool(branch) and anchor_on_branch,
        "rollback_anchor_available": anchor_available,
        "bounded_runtime_targets": bool(runtime_targets) and all(item.get("target") and item.get("status") == "resolved" for item in runtime_targets),
    }
    founder_gate_checks = {"founder_approval", "runtime_binding"}
    founder_gate_required = any(not checks[name] for name in founder_gate_checks)
    ready = all(checks.values())
    readiness_status = "execution_readiness_ready" if ready else "execution_founder_gate_required" if founder_gate_required else "execution_readiness_blocked"
    seed = f"{package_id}:{checkpoint_commit}"
    return {
        "contract_id": f"execution-readiness-{hashlib.sha256(seed.encode()).hexdigest()[:20]}",
        "contract_type": "execution_readiness_contract", "package_id": package_id,
        "project": project, "current_branch": branch, "checkpoint_commit": checkpoint_commit,
        "founder_approval": approval.get("status"), "runtime_binding": runtime.get("binding_status"),
        "preflight_status": package.get("preflight_status"), "execution_status": package.get("execution_status"),
        "executor": {
            "executor_provider": executor.get("executor_provider") or "codex", "executor_role": "approved_package_executor",
            "executor_input": {"package_id": package_id, "work_item_ids": [item.get("work_item_id") for item in work_items]},
            "executor_output": ["work_item_results", "changed_files", "test_results", "validation_results", "rollback_points", "execution_result"],
            "execution_mode": "sequential_package_order", "retry_policy": {"max_attempts_per_work_item": 2, "continue_after_failed_validation": False},
            "stop_policy": "Stop immediately and return to Sino Brain when any automatic stop condition is met.",
        },
        "execution_scope": {
            "execution_goal": (package.get("scope") or [None])[0], "included_capabilities": included_capabilities,
            "allowed_files_or_paths": {"repository_paths": [], "runtime_targets": runtime_targets},
            "allowed_operations": [{"work_item_id": item.get("work_item_id"), "operation": item.get("scope")} for item in work_items],
            "excluded_operations": ["modify_founder_decision", "modify_runtime_recommendation", "expand_architecture_boundary", "create_commercial_cloud_resource", "access_production", "write_unlisted_repository_path"],
            "expected_artifacts": list(package.get("expected_artifacts") or []),
            "expected_state_transition": "storage/compute/iam/network validated; Intelligence Evolution Layer WI-007 becomes resumable; execution result recorded without Asset Commit.",
        },
        "side_effect_contract": {
            "LOCAL_REPOSITORY_SIDE_EFFECT": {"allowed": False, "evidence": f"Checkpoint {checkpoint_commit} is an existing local repository side effect; this runtime Package grants no repository path writes."},
            "LOCAL_RUNTIME_SIDE_EFFECT": {"allowed": True, "boundary": runtime_targets},
            "EXTERNAL_SERVICE_SIDE_EFFECT": {"allowed": False, "escalation": "founder_gate"},
            "CLOUD_INFRASTRUCTURE_SIDE_EFFECT": {"allowed": False, "escalation": "founder_gate"},
            "PRODUCTION_SIDE_EFFECT": {"allowed": False, "escalation": "founder_gate"},
        },
        "verification_contract": {
            "required_targeted_tests": list((package.get("validation_plan") or {}).get("work_items") or []),
            "required_build": {"required": False, "reason": "Current Package contains runtime binding operations and no approved repository paths."},
            "git_diff_check": {"required": True, "expected": "clean or only explicitly recorded execution artifacts"},
            "artifact_verification": list(package.get("expected_artifacts") or []),
            "state_verification": list(package.get("acceptance_criteria") or []),
            "package_consistency_check": {"package_id": package_id, "work_item_ids": [item.get("work_item_id") for item in work_items], "execution_order": list(package.get("execution_order") or [])},
            "result_states": ["PASS", "FAIL", "BLOCKED"],
        },
        "rollback_contract": {
            "rollback_anchor": checkpoint_commit, "rollback_trigger": ["validation_failed", "scope_violation", "new_side_effect_boundary", "runtime_binding_regression"],
            "rollback_scope": "Only changes produced inside listed runtime targets by this Package.",
            "rollback_action": list(package.get("rollback_plan") or []),
            "rollback_prohibited_actions": ["git reset --hard", "force push", "destructive checkout", "delete branch", "overwrite production"],
        },
        "automatic_stop_conditions": stop_conditions, "readiness_checks": checks,
        "founder_decision_required": founder_gate_required, "readiness_status": readiness_status,
        "validation_result": "PASS" if ready else "BLOCKED", "created_at": datetime.now(timezone.utc).isoformat(),
    }
