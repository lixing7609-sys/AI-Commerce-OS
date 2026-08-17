"""Freeze a ready package into an inert Codex handoff and created session."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json

from app.founder_ai.execution_registry import create_controlled_handoff_session
from app.founder_ai.execution_registry import create_controlled_handoff_session_v2
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft


def _fingerprint_payload(package: dict, readiness: dict) -> dict:
    scope = dict(readiness.get("execution_scope") or {})
    return {
        "package_id": package.get("package_id"), "execution_goal": scope.get("execution_goal"),
        "included_capabilities": scope.get("included_capabilities"), "allowed_files_or_paths": scope.get("allowed_files_or_paths"),
        "allowed_operations": scope.get("allowed_operations"), "prohibited_operations": scope.get("excluded_operations"),
        "verification_contract": readiness.get("verification_contract"), "rollback_contract": readiness.get("rollback_contract"),
        "side_effect_contract": readiness.get("side_effect_contract"), "stop_conditions": readiness.get("automatic_stop_conditions"),
    }


def scope_fingerprint(package: dict, readiness: dict) -> str:
    payload = json.dumps(_fingerprint_payload(package, readiness), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def create_controlled_handoff(*, package: dict, expected_package_id: str, expected_readiness_contract_id: str, expected_checkpoint: str) -> tuple[dict, object]:
    readiness = dict(package.get("execution_readiness_contract") or {})
    checkpoint = dict(package.get("autonomous_checkpoint") or {})
    checks = {
        "package_id": package.get("package_id") == expected_package_id,
        "readiness_contract_id": readiness.get("contract_id") == expected_readiness_contract_id,
        "checkpoint_commit": readiness.get("checkpoint_commit") == expected_checkpoint,
        "founder_approval": (package.get("approval_ref") or {}).get("status") == "approved",
        "runtime_binding": (package.get("runtime_binding") or {}).get("binding_status") == "passed",
        "preflight": package.get("preflight_status") == "ready",
        "execution_readiness": readiness.get("readiness_status") == "execution_readiness_ready",
        "execution_not_started": package.get("execution_status") == "not_started",
        "working_tree_clean": (readiness.get("readiness_checks") or {}).get("working_tree_clean") is True,
        "branch_and_anchor": (readiness.get("readiness_checks") or {}).get("branch_matches_checkpoint") is True,
    }
    if not all(checks.values()):
        raise ValueError("controlled_handoff_preconditions_failed")
    fingerprint = scope_fingerprint(package, readiness)
    seed = f"{expected_package_id}:{expected_readiness_contract_id}:{fingerprint}"
    handoff_id = f"executor-handoff-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"
    session_id = f"execution-session-{hashlib.sha256((handoff_id + ':session').encode()).hexdigest()[:20]}"
    scope = dict(readiness["execution_scope"])
    executor = dict(readiness["executor"])
    handoff = {
        "handoff_id": handoff_id, "package_id": expected_package_id, "readiness_contract_id": expected_readiness_contract_id,
        "checkpoint_commit": expected_checkpoint, "executor_provider": executor.get("executor_provider"), "executor_role": executor.get("executor_role"),
        "execution_goal": scope.get("execution_goal"), "execution_scope": scope, "allowed_files_or_paths": scope.get("allowed_files_or_paths"),
        "allowed_operations": scope.get("allowed_operations"), "prohibited_operations": scope.get("excluded_operations"),
        "verification_contract": readiness.get("verification_contract"), "rollback_contract": readiness.get("rollback_contract"),
        "side_effect_contract": readiness.get("side_effect_contract"), "automatic_stop_conditions": readiness.get("automatic_stop_conditions"),
        "founder_gate_reentry_conditions": [item for item in readiness.get("automatic_stop_conditions") or [] if item.get("route") == "founder_gate"],
        "scope_fingerprint": fingerprint, "handoff_status": "created", "precondition_checks": checks,
        "payload_priority": "frozen_contract_over_conversation_context", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    typed_package = ExecutionPackage(
        goal=handoff["execution_goal"], context={"handoff": handoff, "reference_conversation_id": package.get("conversation_id")},
        task_asset=TaskAssetDraft(title="Controlled Executor Handoff", description=handoff["execution_goal"], scope=scope, constraints=list(handoff["prohibited_operations"] or []), risk="bounded", approval_required=True, conversation_id=package.get("conversation_id")),
        constraints=list(handoff["prohibited_operations"] or []), verification=[json.dumps(readiness.get("verification_contract"), ensure_ascii=False)],
        commit_requirement="Only within frozen handoff scope", approval_required=True, execution_allowed=False,
    )
    session = create_controlled_handoff_session(
        session_id=session_id, handoff_id=handoff_id, package_id=expected_package_id,
        readiness_contract_id=expected_readiness_contract_id, scope_fingerprint=fingerprint,
        executor_provider=executor.get("executor_provider") or "codex", package=typed_package,
    )
    handoff["execution_session"] = {
        "execution_session_id": session.id, "handoff_id": session.handoff_id, "package_id": session.execution_package_id,
        "readiness_contract_id": session.readiness_contract_id, "executor_provider": session.executor,
        "scope_fingerprint": session.scope_fingerprint, "session_status": session.status,
        "created_at": session.created_at, "execution_started_at": session.execution_started_at,
        "execution_completed_at": session.completed_at,
    }
    return handoff, session


def _v2_fingerprint_payload(package: dict, readiness: dict, action_contract: dict) -> dict:
    return {
        "source_scope_fingerprint": action_contract.get("source_scope_fingerprint"),
        "package_id": package.get("package_id"), "readiness_contract_id": readiness.get("contract_id"),
        "action_contract_id": action_contract.get("action_contract_id"),
        "action_contract_fingerprint": action_contract.get("action_contract_fingerprint"),
        "execution_goal": (readiness.get("execution_scope") or {}).get("execution_goal"),
        "machine_actions": action_contract.get("actions"),
        "verification_contract": readiness.get("verification_contract"),
        "rollback_contract": readiness.get("rollback_contract"),
        "side_effect_contract": readiness.get("side_effect_contract"),
        "stop_conditions": readiness.get("automatic_stop_conditions"),
        "founder_gate_reentry_conditions": [item for item in readiness.get("automatic_stop_conditions") or [] if item.get("route") == "founder_gate"],
    }


def create_controlled_handoff_v2(*, package: dict, expected: dict) -> tuple[dict, object]:
    """Freeze the existing ready machine actions into an inert second attempt."""
    readiness = dict(package.get("execution_readiness_contract") or {})
    action_contract = dict(package.get("active_machine_action_contract") or {})
    actions = [dict(item) for item in action_contract.get("actions") or []]
    repo_checkpoint = expected["repository_checkpoint"]
    checks = {
        "package_id": package.get("package_id") == expected["package_id"],
        "readiness_contract_id": readiness.get("contract_id") == expected["readiness_contract_id"],
        "action_contract_id": action_contract.get("action_contract_id") == expected["action_contract_id"],
        "action_contract_fingerprint": action_contract.get("action_contract_fingerprint") == expected["action_contract_fingerprint"],
        "repository_checkpoint": repo_checkpoint == expected["repository_checkpoint"],
        "founder_approval": (package.get("approval_ref") or {}).get("status") == "approved",
        "runtime_binding": (package.get("runtime_binding") or {}).get("binding_status") == "passed",
        "preflight": package.get("preflight_status") == "ready",
        "action_compilation": action_contract.get("compilation_status") == "action_compilation_ready",
        "no_blocked_actions": action_contract.get("blocked_action_count") == 0,
        "no_founder_decision": action_contract.get("founder_decision_required") is False,
        "all_actions_executable": bool(actions) and all(item.get("action_status") == "executable" for item in actions),
        "source_scope_preserved": action_contract.get("source_scope_fingerprint") == expected["source_scope_fingerprint"],
    }
    if not all(checks.values()):
        raise ValueError("controlled_handoff_v2_preconditions_failed")
    payload = _v2_fingerprint_payload(package, readiness, action_contract)
    fingerprint = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    seed = f"{expected['package_id']}:{action_contract['action_contract_id']}:{fingerprint}:2"
    handoff_id = f"executor-handoff-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"
    session_id = f"execution-session-{hashlib.sha256((handoff_id + ':session:v2').encode()).hexdigest()[:20]}"
    executor = dict(readiness.get("executor") or {})
    handoff = {
        "handoff_id": handoff_id, "handoff_version": 2, "package_id": expected["package_id"],
        "readiness_contract_id": expected["readiness_contract_id"], "action_contract_id": expected["action_contract_id"],
        "action_contract_fingerprint": expected["action_contract_fingerprint"], "repository_checkpoint": repo_checkpoint,
        "source_scope_fingerprint": expected["source_scope_fingerprint"], "scope_fingerprint": fingerprint,
        "executor_provider": executor.get("executor_provider") or "codex", "execution_goal": payload["execution_goal"],
        "machine_actions": actions, "allowed_operations": actions,
        "prohibited_operations": (readiness.get("execution_scope") or {}).get("excluded_operations"),
        "verification_contract": readiness.get("verification_contract"), "rollback_contract": readiness.get("rollback_contract"),
        "side_effect_contract": readiness.get("side_effect_contract"), "automatic_stop_conditions": readiness.get("automatic_stop_conditions"),
        "founder_gate_reentry_conditions": payload["founder_gate_reentry_conditions"],
        "handoff_status": "created", "precondition_checks": checks,
        "payload_priority": "machine_action_contract_over_natural_language_context", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    typed_package = ExecutionPackage(
        goal=handoff["execution_goal"], context={"handoff": handoff, "reference_conversation_id": package.get("conversation_id")},
        task_asset=TaskAssetDraft(title="Controlled Executor Handoff v2", description=handoff["execution_goal"], scope={"machine_actions": actions}, constraints=list(handoff["prohibited_operations"] or []), risk="bounded", approval_required=True, conversation_id=package.get("conversation_id")),
        constraints=list(handoff["prohibited_operations"] or []), verification=[json.dumps(readiness.get("verification_contract"), ensure_ascii=False)],
        commit_requirement="No repository write before explicit execution start", approval_required=True, execution_allowed=False,
    )
    session = create_controlled_handoff_session_v2(
        session_id=session_id, handoff_id=handoff_id, package_id=expected["package_id"], readiness_contract_id=expected["readiness_contract_id"],
        action_contract_id=expected["action_contract_id"], action_contract_fingerprint=expected["action_contract_fingerprint"],
        scope_fingerprint=fingerprint, executor_provider=handoff["executor_provider"], package=typed_package,
    )
    handoff["execution_session"] = {
        "execution_session_id": session.id, "session_version": session.session_version, "handoff_id": session.handoff_id,
        "package_id": session.execution_package_id, "readiness_contract_id": session.readiness_contract_id,
        "action_contract_id": session.action_contract_id, "action_contract_fingerprint": session.action_contract_fingerprint,
        "scope_fingerprint": session.scope_fingerprint, "executor_provider": session.executor, "session_status": session.status,
        "created_at": session.created_at, "execution_started_at": session.execution_started_at, "completed_at": session.completed_at,
    }
    return handoff, session
