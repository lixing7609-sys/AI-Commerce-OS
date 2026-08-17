"""Evidence-backed autonomous task-closure contracts and records."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib

from app.founder_ai.execution_registry import list_execution_sessions


def _id(prefix: str, seed: str) -> str:
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"


def _goal_requires_mutation(goal: str) -> bool:
    lowered = goal.casefold()
    return any(term in lowered for term in ("配置", "创建", "provision", "configure", "create", "apply", "deploy"))


def build_closure_contract(*, package: dict, post_execution: dict, working_tree_clean: bool, historical_integrity: bool) -> dict:
    result = dict(post_execution.get("result_record") or {})
    artifacts = list(post_execution.get("artifacts") or [])
    learnings = list(post_execution.get("learnings") or [])
    decision_memory = dict(post_execution.get("decision_memory") or {})
    reuse = dict(post_execution.get("reuse_candidate") or {})
    goal = str(result.get("execution_goal") or "")
    side_effects = dict(result.get("side_effects") or {})
    mutation_effects = sum(len(side_effects.get(key) or []) for key in ("LOCAL_RUNTIME_MUTATION", "EXTERNAL_SERVICE_WRITE", "CLOUD_INFRASTRUCTURE_WRITE", "PRODUCTION_WRITE"))
    goal_effect_alignment = not _goal_requires_mutation(goal) or mutation_effects > 0
    completion_claim = (
        "All five evidence-bound runtime validation actions passed and produced a verified read-only result."
        if goal_effect_alignment else
        "The runtime validation portion is proven complete, but the approved execution goal also claims configuration; the read-only result contains no mutation evidence proving that configuration work occurred."
    )
    package_id = package.get("package_id")
    active = [item for item in list_execution_sessions() if item.execution_package_id == package_id and item.status in {"created", "approved", "queued", "executing", "testing", "paused"}]
    action_results = list(result.get("action_results") or [])
    checklist = {
        "execution_completed": result.get("final_status") == "completed",
        "verification_pass": result.get("verification_status") == "PASS",
        "all_required_actions_passed": len(action_results) == 5 and all(item.get("status") == "PASS" for item in action_results),
        "fail_count_zero": result.get("fail_count") == 0, "blocked_count_zero": result.get("blocked_count") == 0,
        "result_record_exists": bool(result.get("result_id")), "artifacts_recorded": len(artifacts) > 0,
        "learning_recorded": len(learnings) > 0, "decision_memory_linked": len(decision_memory.get("links") or []) == 4,
        "reuse_candidate_evaluated": bool(reuse.get("reuse_candidate_id")), "working_tree_clean": working_tree_clean,
        "no_unresolved_blocker": result.get("blocked_count") == 0, "no_pending_founder_gate": result.get("founder_gate_reentry") is False,
        "no_active_execution_session": not active,
        "package_consistency": result.get("package_id") == package_id and result.get("handoff_id") == (package.get("active_executor_handoff_v2") or {}).get("handoff_id") and result.get("action_contract_id") == (package.get("active_machine_action_contract") or {}).get("action_contract_id"),
        "historical_integrity": historical_integrity, "completion_claim_supported": goal_effect_alignment,
    }
    founder_required = not goal_effect_alignment
    ready = all(checklist.values()) and not founder_required
    now = datetime.now(timezone.utc).isoformat()
    return {
        "closure_contract_id": _id("closure-contract", f"{package_id}:{result.get('result_id')}"),
        "package_id": package_id, "result_id": result.get("result_id"), "execution_session_id": result.get("execution_session_id"),
        "handoff_id": result.get("handoff_id"), "action_contract_id": result.get("action_contract_id"), "reuse_candidate_id": reuse.get("reuse_candidate_id"),
        "execution_goal": goal, "completion_claim": completion_claim,
        "completion_evidence": {"action_result_refs": [item.get("action_id") for item in action_results], "verification_status": result.get("verification_status"), "result_id": result.get("result_id"), "artifact_refs": [item.get("artifact_id") for item in artifacts], "learning_refs": [item.get("learning_id") for item in learnings], "runtime_mutation_evidence_count": mutation_effects},
        "verification_status": result.get("verification_status"), "artifact_status": "recorded" if artifacts else "missing",
        "learning_status": "recorded" if learnings else "missing", "decision_memory_status": "linked" if decision_memory.get("links") else "missing",
        "reuse_status": reuse.get("status"), "blocker_status": "none" if result.get("blocked_count") == 0 else "present",
        "founder_gate_status": "none" if result.get("founder_gate_reentry") is False else "pending", "active_session_status": "none" if not active else "present",
        "working_tree_status": "clean" if working_tree_clean else "dirty", "historical_integrity_status": "passed" if historical_integrity else "failed",
        "closure_scope": "Close only this Package task; preserve Project, Conversation, execution history, and candidate lifecycle.",
        "closure_checklist": checklist, "founder_decision_required": founder_required,
        "closure_status": "closure_ready" if ready else "founder_closure_decision_required" if founder_required else "closure_blocked",
        "semantic_blocker": None if goal_effect_alignment else "execution_goal_result_effect_mismatch: configuration claimed, read-only validation evidenced",
        "created_at": now,
    }


def close_task_if_ready(*, package: dict, contract: dict, post_execution: dict) -> tuple[dict, dict | None]:
    if contract.get("closure_status") != "closure_ready" or contract.get("founder_decision_required"):
        return {**post_execution, "closure_contract": contract, "task_status": "completed_pending_closure", "task_closed": False}, None
    now = datetime.now(timezone.utc).isoformat()
    result = dict(post_execution.get("result_record") or {})
    record = {
        "task_closure_id": _id("task-closure", contract["closure_contract_id"]), "closure_contract_id": contract["closure_contract_id"],
        "package_id": package.get("package_id"), "result_id": result.get("result_id"), "final_task_status": "completed",
        "closed_at": now, "closed_by": "sino_autonomous_closure", "completion_summary": contract.get("completion_claim"),
        "verification_summary": "All closure checklist items passed.", "artifact_refs": contract["completion_evidence"]["artifact_refs"],
        "learning_refs": contract["completion_evidence"]["learning_refs"], "decision_memory_refs": list((post_execution.get("decision_memory") or {}).get("links") or []),
        "reuse_candidate_refs": [contract.get("reuse_candidate_id")], "unresolved_items": [], "historical_integrity": "passed",
        "next_action": "Task completed; return to Founder workspace and wait for new input.",
    }
    return {**post_execution, "closure_contract": contract, "task_closure_record": record, "task_status": "completed", "task_closed": True, "closed_at": now, "closed_by": "sino_autonomous_closure"}, record
