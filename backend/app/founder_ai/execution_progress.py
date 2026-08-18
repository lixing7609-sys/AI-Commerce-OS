from datetime import datetime, timezone

from app.founder_ai.execution_registry import get_execution_session


STANDARD_PROGRESS = {"inspect": 10, "plan": 25, "execution": 35, "verification": 80, "learning": 95, "closure": 95, "complete": 100}
QUICK_FIX_PROGRESS = {"issue": 5, "inspect": 20, "fix": 40, "verify": 80, "complete": 100}
STRATEGIC_PROGRESS = {"architecture_analysis": 25, "alternatives": 45, "proposal": 55, "impact_analysis": 75, "decision_readiness": 90}


def _parse(value):
    try:
        return datetime.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def _elapsed(started_at, completed_at=None):
    start = _parse(started_at)
    end = _parse(completed_at) or datetime.now(timezone.utc)
    return max(0, int((end - start).total_seconds())) if start else 0


def build_execution_progress(route: dict) -> dict | None:
    classification = route.get("classification")
    if classification not in {"STANDARD_TASK", "QUICK_FIX", "STRATEGIC_TASK"}:
        return None
    if classification == "STRATEGIC_TASK":
        phase = route.get("current_step") or "architecture_analysis"
        proposal = dict(route.get("architecture_proposal") or {})
        ready = phase == "decision_readiness" and proposal.get("status") == "ready_for_founder_decision"
        return {
            "task_id": None, "execution_id": None, "task_type": route.get("task_type") or classification,
            "current_phase": phase, "execution_status": "not_started", "verification_status": "NOT_APPLICABLE",
            "closure_status": "awaiting_founder_decision", "founder_action_required": ready,
            "technical_blocker": None, "started_at": None, "phase_started_at": None,
            "updated_at": None, "completed_at": None, "elapsed_seconds": 0,
            "progress_percent": STRATEGIC_PROGRESS.get(phase, 0),
            "current_action": "等待 Founder 决策" if ready else "正在分析架构",
            "next_action": "Founder 需要操作" if ready else "Founder 无需操作",
            "stalled": False, "stall_reason": None,
        }
    execution = dict(route.get("autonomous_execution") or {})
    session_id = execution.get("execution_session_id")
    record = get_execution_session(session_id) if session_id else None
    session = record[0] if record else None
    route_step = route.get("current_step") or ("inspect" if classification == "STANDARD_TASK" else "issue")
    blocker = dict(route.get("technical_blocker") or {}) or None
    founder_required = bool(route.get("founder_gate_required"))
    terminal = route.get("execution_status") == "completed" or bool(session and session.status == "completed" and session.commit_hash and not blocker)
    phase = "complete" if terminal else route_step
    if blocker and phase == "complete":
        phase = "verification" if "verification" in str(blocker.get("type")) else "execution"
    weights = STANDARD_PROGRESS if classification == "STANDARD_TASK" else QUICK_FIX_PROGRESS
    progress = weights.get(phase, 0)
    if session and session.status == "completed" and phase in {"verification", "verify"}:
        progress = 90
    started_at = (session.started_at or session.queued_at or session.created_at) if session else execution.get("dispatched_at")
    completed_at = session.completed_at if terminal and session else None
    latest_at = None
    if session:
        latest_at = next((event.get("timestamp") for event in reversed(session.events or []) if event.get("timestamp")), None) or session.completed_at or session.testing_at or session.started_at or session.queued_at
    stale_age = _elapsed(latest_at) if latest_at and not terminal else 0
    running = bool(session and session.status in {"queued", "executing", "testing"})
    stalled = running and stale_age > (300 if session.status == "queued" else 180)
    if founder_required:
        title, next_action = "等待 Founder 授权", "Founder 需要操作"
    elif blocker:
        title, next_action = ("验证受阻" if phase in {"verification", "verify"} else "执行受阻"), "Sino 正在自动解决；Founder 无需操作"
    elif stalled:
        title, next_action = "执行器异常 · 正在自愈", "Founder 无需操作"
    elif terminal:
        title, next_action = "已完成", "等待 Founder 验收"
    else:
        titles = {"inspect": "正在检查", "plan": "正在规划", "execution": "正在实施", "fix": "正在修复", "verification": "正在验证", "verify": "正在验证", "learning": "正在沉淀", "closure": "正在关闭", "issue": "正在理解问题"}
        title, next_action = titles.get(phase, "正在自动执行"), "Founder 无需操作"
    return {
        "task_id": execution.get("task_id") or (route.get("standard_task_contract") or route.get("quick_fix_contract") or {}).get("task_id"),
        "execution_id": session_id, "task_type": classification, "current_phase": phase,
        "execution_status": "completed" if terminal else "stalled" if stalled else "blocked" if blocker else (session.status if session else route.get("execution_status")),
        "verification_status": "PASS" if terminal else "BLOCKED" if blocker and phase in {"verification", "verify"} else "PENDING",
        "closure_status": "awaiting_founder_acceptance" if terminal else "pending",
        "founder_action_required": founder_required, "technical_blocker": blocker,
        "started_at": started_at, "phase_started_at": session.testing_at if session and phase in {"verification", "verify"} else started_at,
        "updated_at": latest_at or execution.get("dispatched_at"), "completed_at": completed_at,
        "elapsed_seconds": _elapsed(started_at, completed_at), "progress_percent": progress,
        "current_action": title, "next_action": next_action, "stalled": stalled,
        "stall_reason": "worker_heartbeat_stale" if stalled else None,
    }
