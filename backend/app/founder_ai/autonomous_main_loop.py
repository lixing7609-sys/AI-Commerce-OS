"""Finite state-driven orchestration over existing Founder AI capabilities."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

from app.founder_ai.capability_reuse import compile_reused_runtime_validation, execute_reused_runtime_validation


MAX_MAIN_LOOP_CYCLES = 20
TERMINAL_STATES = {"completed", "founder_gate_required", "technical_blocker", "production_safety_stop", "main_loop_stalled"}
TRANSITIONS = {
    "idea_received": ("structure_goal", "goal_structuring", "goal_structured"),
    "goal_structured": ("lookup_reuse_assets", "capability_reuse", "reuse_lookup"),
    "reuse_lookup": ("compile_reused_actions", "capability_reuse", "action_contract"),
    "action_contract": ("execute_controlled_reuse", "controlled_execution", "verification"),
    "verification": ("materialize_result", "execution_result", "post_execution_commit"),
    "post_execution_commit": ("evaluate_learning_and_reuse", "learning", "learning"),
    "learning": ("evaluate_closure", "autonomous_task_closure", "closure"),
    "closure": ("close_task", "autonomous_task_closure", "completed"),
}


def _id(prefix: str, seed: str) -> str:
    return f"{prefix}-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"


def select_transition(state: str, context: dict) -> dict:
    if state in TERMINAL_STATES:
        return {"stop": True, "state": state}
    if context.get("production_safety_stop"):
        return {"stop": True, "state": "production_safety_stop"}
    if context.get("founder_gate_required"):
        return {"stop": True, "state": "founder_gate_required"}
    if context.get("technical_blocker"):
        return {"stop": True, "state": "technical_blocker"}
    action, capability, next_state = TRANSITIONS.get(state, ("reconcile_state", "state_reconciliation", "technical_blocker"))
    return {"stop": False, "action": action, "capability": capability, "next_state": next_state}


def _working_tree_clean(repo_root: Path) -> bool:
    return not subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()


def _consistency(state: str, context: dict, repo_root: Path) -> dict:
    task = context.get("task") or {}
    checks = {
        "task_identity": bool(task.get("task_id")),
        "working_tree_clean": _working_tree_clean(repo_root),
        "no_pending_founder_gate": not context.get("founder_gate_required"),
        "package_lineage": state in {"idea_received", "goal_structured"} or bool((context.get("plan") or {}).get("package", {}).get("package_id")),
    }
    return {"valid": all(checks.values()), "checks": checks}


def _result_record(execution: dict) -> dict:
    result_id = _id("reuse-execution-result", execution["execution_session_id"])
    return {
        "result_id": result_id, "package_id": execution["package"]["package_id"],
        "handoff_id": execution["handoff"]["handoff_id"], "execution_session_id": execution["execution_session_id"],
        "action_contract_id": execution["action_contract"]["action_contract_id"],
        "final_status": execution["execution_status"], "verification_status": execution["verification"]["result"],
        "action_results": execution["action_results"], "pass_count": execution["verification"]["counts"]["PASS"],
        "fail_count": execution["verification"]["counts"]["FAIL"], "blocked_count": execution["verification"]["counts"]["BLOCKED"],
        "side_effects": {"READ_ONLY": True, "repository_write": False, "runtime_mutation": False, "external_write": False, "cloud_write": False, "production_write": False},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def run_autonomous_main_loop(*, repo_root: Path, goal: str, max_cycles: int = MAX_MAIN_LOOP_CYCLES, persist: bool = True) -> dict:
    if not goal.strip():
        raise ValueError("founder_goal_required")
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
    loop_id = _id("autonomous-main-loop", f"{goal}:{head}")
    task_id = _id("autonomous-task", loop_id)
    context = {"task": {"task_id": task_id, "goal": goal, "status": "active"}, "manual_continue_count": 0, "founder_gate_count": 0, "technical_blocker_count": 0}
    state, progress = "idea_received", []
    for cycle in range(1, max_cycles + 1):
        consistency = _consistency(state, context, repo_root)
        previous = state
        if not consistency["valid"]:
            state = "technical_blocker"
            context["technical_blocker"] = {"blocker_type": "state_consistency", "evidence": consistency["checks"], "attempted_resolutions": ["state_reconciliation"], "cycle_count": cycle, "next_possible_resolution": "restore a clean and internally consistent task state"}
            context["technical_blocker_count"] += 1
            progress.append({"loop_id": loop_id, "task_id": task_id, "cycle": cycle, "previous_state": previous, "action_selected": "reconcile_state", "capability_invoked": "state_reconciliation", "result": "blocked", "next_state": state, "founder_gate_required": False, "blocker": context["technical_blocker"], "timestamp": datetime.now(timezone.utc).isoformat()})
            break
        transition = select_transition(state, context)
        if transition.get("stop"):
            state = transition["state"]
            break
        action, capability, next_state = transition["action"], transition["capability"], transition["next_state"]
        result = "completed"
        try:
            if action == "structure_goal":
                context["task"]["goal_type"] = "runtime_readiness_validation"
            elif action == "lookup_reuse_assets":
                context["plan"] = compile_reused_runtime_validation(repository_head=head)
                context["reuse_decision"] = {"route": "reuse_first", **context["plan"]["reuse"]}
                context["task"]["lineage_task_id"] = context["plan"]["task"]["task_id"]
            elif action == "compile_reused_actions":
                if context["plan"]["action_contract"]["compilation_status"] != "action_compilation_ready":
                    raise RuntimeError("reused_action_compilation_blocked")
            elif action == "execute_controlled_reuse":
                context["execution"] = execute_reused_runtime_validation(repo_root=repo_root)
                if context["execution"]["execution_status"] != "completed":
                    raise RuntimeError("controlled_reuse_execution_not_completed")
            elif action == "materialize_result":
                if context["execution"]["verification"]["result"] != "PASS":
                    raise RuntimeError("verification_not_pass")
                context["result_record"] = _result_record(context["execution"])
            elif action == "evaluate_learning_and_reuse":
                context["learning_commit"] = {"status": "recorded", "reused_learning_ids": context["reuse_decision"]["reused_learning_ids"], "new_learning_records": [], "reuse_evaluation": "existing candidate validated again without broadening its environment scope"}
            elif action == "evaluate_closure":
                checks = {"execution_completed": context["execution"]["execution_status"] == "completed", "verification_pass": context["result_record"]["verification_status"] == "PASS", "all_actions_passed": context["result_record"]["pass_count"] == 5, "working_tree_clean": _working_tree_clean(repo_root), "no_founder_gate": context["founder_gate_count"] == 0, "no_blocker": context["technical_blocker_count"] == 0, "result_record_exists": bool(context["result_record"].get("result_id")), "learning_evaluated": context["learning_commit"]["status"] == "recorded"}
                context["closure"] = {"closure_status": "closure_ready" if all(checks.values()) else "closure_blocked", "checks": checks, "founder_decision_required": False}
                if context["closure"]["closure_status"] != "closure_ready":
                    raise RuntimeError("closure_not_ready")
            elif action == "close_task":
                context["task"].update({"status": "completed", "task_closed": True, "closed_by": "sino_autonomous_main_loop", "closed_at": datetime.now(timezone.utc).isoformat()})
                context["closure"]["closure_status"] = "completed"
        except Exception as error:
            result = "blocked"; next_state = "technical_blocker"
            context["technical_blocker"] = {"blocker_type": type(error).__name__, "evidence": str(error), "attempted_resolutions": [action], "cycle_count": cycle, "next_possible_resolution": "autonomous state reconciliation or bounded fallback"}
            context["technical_blocker_count"] += 1
        progress.append({"loop_id": loop_id, "task_id": task_id, "cycle": cycle, "previous_state": previous, "action_selected": action, "capability_invoked": capability, "result": result, "next_state": next_state, "founder_gate_required": next_state == "founder_gate_required", "blocker": context.get("technical_blocker") if result == "blocked" else None, "timestamp": datetime.now(timezone.utc).isoformat()})
        state = next_state
        if state in TERMINAL_STATES:
            break
    else:
        state = "main_loop_stalled"
        context["technical_blocker_count"] += 1
    output = {"loop_id": loop_id, **context, "current_state": state, "main_loop_cycles": len(progress), "progress_log": progress, "stop_reason": "task_completed" if state == "completed" else state}
    if persist:
        path = repo_root / ".founder-execution" / "main-loops" / f"{loop_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    return output
