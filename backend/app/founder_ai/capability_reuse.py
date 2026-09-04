"""Reuse-first compilation and controlled read-only runtime readiness validation."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

from sqlalchemy import select

from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.runtime_environment.service import lookup_runtime_environment, resolve_runtime_environment
from app.database.db import SessionLocal
from app.founder_ai.controlled_execution_v2 import execute_frozen_actions
from app.founder_ai.controlled_handoff import scope_fingerprint_v2
from app.founder_ai.execution_registry import create_controlled_handoff_session_v2, save_execution_session
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft


def _id(prefix: str, seed: str) -> str:
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"


def _source_assets() -> tuple[dict, dict, list[dict]]:
    with SessionLocal() as session:
        for state in session.scalars(select(SinoBrainSessionDB)):
            package = dict((state.discovery or {}).get("execution_package") or {})
            post = dict(package.get("post_execution_commit") or {})
            candidate = dict(post.get("reuse_candidate") or {})
            result = dict(post.get("result_record") or {})
            if package.get("task_closed") is True and candidate.get("status") == "candidate" and result.get("verification_status") == "PASS":
                return package, candidate, [dict(item) for item in post.get("learnings") or []]
    raise LookupError("reusable_runtime_validation_assets_not_found")


def _action(*, task_id: str, index: int, work_item_id: str, operation: str, capability: str, target_type: str, target: dict, evidence: list[str], template_ref: str, depends_on: list[str] | None = None) -> dict:
    action_id = _id("reuse-action", f"{task_id}:{index}:{operation}:{target.get('target_id')}")
    return {
        "action_id": action_id, "work_item_id": work_item_id, "capability": capability,
        "operation_type": operation, "target_type": target_type, "target": target,
        "target_source": "RUNTIME_ENVIRONMENT_REGISTRY", "evidence_refs": [ref for ref in evidence if ref],
        "reused_action_template": template_ref, "inputs": {"depends_on": list(depends_on or [])},
        "preconditions": ["registry binding remains fresh and healthy"], "allowed_effect": "READ_ONLY",
        "side_effect_class": ["READ_ONLY"], "verification": {"pass": "adapter returns machine-observed PASS", "fail": "adapter returns FAIL", "blocked": "target unavailable or guard mismatch"},
        "rollback": {"required": False, "reason": "READ_ONLY action"},
        "stop_conditions": ["binding mismatch", "secret value required", "external write required", "production impact"],
        "founder_gate_reentry_conditions": ["new credential", "incremental cost", "external write", "cloud infrastructure write", "production impact", "architecture boundary change"],
        "action_status": "executable",
    }


def compile_reused_runtime_validation(*, repository_head: str) -> dict:
    source_package, candidate, learnings = _source_assets()
    lookup = lookup_runtime_environment("LOCAL")
    discovery_calls = 0
    if not lookup["validation"]["valid"]:
        discovery_calls = 1
        resolved = resolve_runtime_environment("LOCAL")
        lookup = {"environment": resolved.get("environment"), "validation": resolved.get("validation")}
    if not lookup["validation"]["valid"]:
        raise RuntimeError("runtime_registry_binding_invalid_after_fallback")
    environment = dict(lookup["environment"])
    services = {item["service_id"]: item for item in environment.get("services") or []}
    frontend, backend = services["founder_frontend"], services["founder_backend"]
    source_result = dict((source_package.get("post_execution_commit") or {}).get("result_record") or {})
    templates = {item["work_item_id"]: item for item in source_result.get("action_results") or []}
    seed = f"runtime-readiness-validation:{environment['environment_id']}:{repository_head}:{environment.get('last_verified_at')}"
    task_id, package_id = _id("reuse-task", seed), _id("reuse-execution-package", seed)
    refs = [environment.get("environment_id"), *(environment.get("evidence_refs") or [])]
    wi = [f"wi-reuse-{i:03d}" for i in range(1, 6)]
    actions = [
        _action(task_id=task_id, index=1, work_item_id=wi[0], operation="VERIFY_CONNECTIVITY", capability="database_connectivity", target_type="postgresql_database", target={"target_id": f"{environment['environment_id']}/database", "binding_ref": "runtime_environment.database", "database_type": environment["database"]["type"]}, evidence=environment["database"].get("evidence_refs") or refs, template_ref=templates["wi-cloud-001"]["action_id"]),
        _action(task_id=task_id, index=2, work_item_id=wi[1], operation="VERIFY_CAPABILITY", capability="application_process", target_type="application_process", target={"target_id": f"{environment['environment_id']}/services/founder_backend", "binding_ref": backend["endpoint_reference"], "host": backend["host"], "port": backend["port"], "protocol": backend["protocol"]}, evidence=backend.get("evidence_refs") or refs, template_ref=templates["wi-cloud-002"]["action_id"]),
        _action(task_id=task_id, index=3, work_item_id=wi[2], operation="VERIFY_CONFIGURATION", capability="iam", target_type="application_rbac_configuration", target={"target_id": environment["iam"]["configuration_reference"], "binding_ref": "runtime_environment.iam", "metadata_only": True}, evidence=environment["iam"].get("evidence_refs") or refs, template_ref=templates["wi-cloud-003"]["action_id"]),
        _action(task_id=task_id, index=4, work_item_id=wi[3], operation="VERIFY_CONFIGURATION", capability="network", target_type="development_loopback_boundary", target={"target_id": f"{environment['environment_id']}/network", "binding_ref": "runtime_environment.network", "boundary": environment["network"]["boundary"], "backend": {"host": backend["host"], "port": backend["port"]}, "frontend": {"host": frontend["host"], "port": frontend["port"]}}, evidence=environment["network"].get("evidence_refs") or refs, template_ref=templates["wi-cloud-004"]["action_id"]),
    ]
    actions.append(_action(task_id=task_id, index=5, work_item_id=wi[4], operation="READ_ONLY_VALIDATE", capability="runtime_readiness", target_type="runtime_readiness_dependencies", target={"target_id": f"{environment['environment_id']}/runtime-readiness"}, evidence=refs, template_ref=templates["wi-cloud-005"]["action_id"], depends_on=wi[:4]))
    contract_seed = json.dumps(actions, ensure_ascii=False, sort_keys=True)
    action_contract = {"action_contract_id": _id("reuse-machine-action-contract", seed), "contract_version": 1, "source_reuse_candidate_id": candidate["reuse_candidate_id"], "source_result_id": source_result["result_id"], "compilation_status": "action_compilation_ready", "actions": actions, "executable_action_count": 5, "blocked_action_count": 0, "founder_decision_required": False, "source_scope_fingerprint": _id("reuse-source-scope", candidate["reuse_candidate_id"]), "action_contract_fingerprint": hashlib.sha256(contract_seed.encode()).hexdigest()}
    readiness = {"contract_id": _id("reuse-readiness", seed), "execution_scope": {"execution_goal": "Validate that the current Sino Founder AI LOCAL Runtime Environment still satisfies runtime prerequisites.", "included_capabilities": [item["capability"] for item in actions], "allowed_files_or_paths": [], "allowed_operations": sorted({item["operation_type"] for item in actions}), "excluded_operations": ["runtime mutation", "repository write", "external write", "cloud provisioning", "production write"]}, "executor": {"executor_provider": "codex", "executor_role": "controlled read-only verifier"}, "verification_contract": {"required_action_pass_count": 5, "working_tree_clean": True}, "rollback_contract": {"required": False, "reason": "READ_ONLY validation"}, "side_effect_contract": {"READ_ONLY": True, "writes_allowed": False}, "automatic_stop_conditions": [{"condition": item, "route": "founder_gate"} for item in candidate.get("founder_gate_conditions") or []]}
    package = {"task_id": task_id, "package_id": package_id, "conversation_id": source_package.get("conversation_id"), "execution_status": "not_started", "preflight_status": "ready", "approval_ref": {"status": "not_required", "reason": "reuse-first READ_ONLY validation"}, "runtime_binding": {"binding_status": "passed", "registry_environment_id": environment["environment_id"]}, "execution_readiness_contract": readiness, "active_machine_action_contract": action_contract}
    reuse = {"reuse_candidate_id": candidate["reuse_candidate_id"], "reused_learning_ids": [item["learning_id"] for item in learnings], "registry_binding_refs": [environment["environment_id"], frontend["endpoint_reference"], backend["endpoint_reference"], "runtime_environment.database", "runtime_environment.iam", "runtime_environment.network"], "reused_action_templates": [item["reused_action_template"] for item in actions], "discovery_skipped": discovery_calls == 0, "discovery_reason": "Registry binding is fresh and healthy" if discovery_calls == 0 else "Registry fallback was required", "binding_refresh_required": discovery_calls > 0, "reuse_confidence": candidate.get("confidence"), "metrics": {"total_actions": 5, "reused_actions": 5, "newly_discovered_actions": 0, "discovery_calls": discovery_calls, "registry_hits": 1, "reuse_ratio": 1.0, "steps_omitted": ["runtime architecture proposal", "IAM discovery", "network discovery", "endpoint discovery", "Founder Gate"]}}
    return {"task": {"task_id": task_id, "goal": readiness["execution_scope"]["execution_goal"], "status": "ready_for_execution", "source_task_id": source_package.get("task_id")}, "package": package, "action_contract": action_contract, "reuse": reuse, "source_result_id": source_result["result_id"]}


def execute_reused_runtime_validation(*, repo_root: Path) -> dict:
    if subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip():
        raise RuntimeError("working_tree_must_be_clean")
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
    record = compile_reused_runtime_validation(repository_head=head)
    package, action_contract = record["package"], record["action_contract"]
    readiness = package["execution_readiness_contract"]
    scope = scope_fingerprint_v2(package, readiness, action_contract)
    handoff_id = _id("reuse-handoff", f"{package['package_id']}:{scope}")
    session_id = _id("reuse-execution-session", handoff_id)
    handoff = {"handoff_id": handoff_id, "package_id": package["package_id"], "readiness_contract_id": readiness["contract_id"], "action_contract_id": action_contract["action_contract_id"], "action_contract_fingerprint": action_contract["action_contract_fingerprint"], "scope_fingerprint": scope, "machine_actions": action_contract["actions"], "handoff_status": "created", "execution_goal": readiness["execution_scope"]["execution_goal"]}
    typed = ExecutionPackage(goal=handoff["execution_goal"], context={"reuse": record["reuse"]}, task_asset=TaskAssetDraft(title="LOCAL Runtime Readiness Reuse Validation", description=handoff["execution_goal"], scope={"machine_actions": action_contract["actions"]}, constraints=readiness["execution_scope"]["excluded_operations"], risk="read_only", approval_required=False), constraints=readiness["execution_scope"]["excluded_operations"], verification=["all five machine actions PASS"], commit_requirement="none", approval_required=False, execution_allowed=True)
    session = create_controlled_handoff_session_v2(session_id=session_id, handoff_id=handoff_id, package_id=package["package_id"], readiness_contract_id=readiness["contract_id"], action_contract_id=action_contract["action_contract_id"], action_contract_fingerprint=action_contract["action_contract_fingerprint"], scope_fingerprint=scope, executor_provider="codex", package=typed)
    path = repo_root / ".founder-execution" / "reuse-validations" / f"{record['task']['task_id']}.json"
    if session.status == "completed" and session.result and path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        existing["task"]["status"] = "completed"
        path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        return existing
    started = datetime.now(timezone.utc).isoformat(); session.status = "executing"; session.execution_started_at = started; session.started_at = started; save_execution_session(session, typed)
    results, verification = execute_frozen_actions(handoff=handoff, action_contract=action_contract, repo_root=repo_root)
    completed = datetime.now(timezone.utc).isoformat(); final = "completed" if verification["result"] == "PASS" else "failed" if verification["result"] == "FAIL" else "blocked"
    session.status = final; session.completed_at = completed; session.result = {"package_id": package["package_id"], "handoff_id": handoff_id, "action_contract_id": action_contract["action_contract_id"], "action_contract_fingerprint": action_contract["action_contract_fingerprint"], "scope_fingerprint_v2": scope, "started_at": started, "completed_at": completed, "execution_status": final, "verification_result": verification["result"], "action_results": results, "pass_count": verification["counts"]["PASS"], "fail_count": verification["counts"]["FAIL"], "blocked_count": verification["counts"]["BLOCKED"], "side_effects": {"READ_ONLY": [item["action_id"] for item in results], "writes": []}, "founder_gate_reentry": False, "working_tree_status": "clean"}; save_execution_session(session, typed)
    record["task"]["status"] = final
    record.update({"handoff": handoff, "execution_session_id": session.id, "execution_status": final, "verification": verification, "action_results": results, "founder_decision_required": False, "external_side_effects": False, "repository_head": head})
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return record
