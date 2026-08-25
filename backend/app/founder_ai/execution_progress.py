from datetime import datetime, timezone

from app.founder_ai.execution_registry import get_execution_session
from app.founder_ai.technical_resolution import evaluate_stall


STANDARD_PROGRESS = {"inspect": 10, "plan": 25, "execution": 35, "verification": 80, "learning": 95, "closure": 95, "complete": 100}
QUICK_FIX_PROGRESS = {"issue": 5, "inspect": 20, "fix": 40, "verify": 80, "complete": 100}
STRATEGIC_PROGRESS = {"architecture_analysis": 25, "alternatives": 45, "proposal": 55, "impact_analysis": 75, "decision_readiness": 90, "approved": 100, "rejected": 100}
REUSE_PROGRESS = {"reuse_lookup": 15, "candidate_found": 25, "binding_validation": 40, "lightweight_verification": 70, "verification": 90, "complete": 100}


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
        status = proposal.get("decision_status") or proposal.get("status")
        ready = phase == "decision_readiness" and status in {"pending", "ready_for_founder_decision", "revision_requested"}
        if status == "approved":
            current_action, next_action, closure = "方案已批准", "等待进入实施阶段", "approved_for_implementation"
        elif status == "rejected":
            current_action, next_action, closure = "方案已驳回", "Founder 无需操作", "rejected"
        elif status == "revision_requested":
            current_action, next_action, closure = "等待 Founder 修改意见", "Founder 需要操作", "revision_requested"
        else:
            current_action, next_action, closure = ("等待 Founder 决策", "Founder 需要操作", "awaiting_founder_decision") if ready else ("正在分析架构", "Founder 无需操作", "pending")
        return {
            "task_id": None, "execution_id": None, "task_type": route.get("task_type") or classification,
            "current_phase": phase, "execution_status": "not_started", "verification_status": "NOT_APPLICABLE",
            "closure_status": closure, "founder_action_required": ready,
            "technical_blocker": None, "started_at": None, "phase_started_at": None,
            "updated_at": None, "completed_at": None, "elapsed_seconds": 0,
            "progress_percent": STRATEGIC_PROGRESS.get(phase, 0),
            "current_action": current_action, "next_action": next_action,
            "stalled": False, "stall_reason": None,
        }
    execution = dict(route.get("autonomous_execution") or {})
    if classification == "STANDARD_TASK" and route.get("reuse_lane"):
        log = list(route.get("progress_log") or [])
        phase = route.get("current_step") or (log[-1] if log else "reuse_lookup")
        reuse = dict(route.get("reuse") or {})
        completed = route.get("execution_status") == "completed"
        acceptance_pending = completed and dict(route.get("founder_acceptance") or {}).get("status") != "accepted"
        current_action = "复用验证完成" if completed else "正在验证当前环境" if phase in {"lightweight_verification", "verification"} else "正在复用已有经验"
        return {"task_id": (route.get("standard_task_contract") or {}).get("task_id"), "execution_id": None,
                "task_type": classification, "current_phase": phase, "execution_status": "completed" if completed else route.get("execution_status"),
                "verification_status": "PASS" if completed else "PENDING", "closure_status": "awaiting_founder_acceptance" if completed else "pending",
                "founder_action_required": acceptance_pending, "technical_blocker": route.get("technical_blocker"), "started_at": None,
                "phase_started_at": None, "updated_at": (reuse.get("lightweight_validation") or {}).get("checked_at"), "completed_at": (reuse.get("lightweight_validation") or {}).get("checked_at") if completed else None,
                "elapsed_seconds": 0, "progress_percent": REUSE_PROGRESS.get(phase, 0), "current_action": current_action,
                "next_action": "等待 Founder 验收" if completed else "Founder 无需操作", "stalled": False, "stall_reason": None}
    session_id = execution.get("execution_session_id")
    record = get_execution_session(session_id) if session_id else None
    session = record[0] if record else None
    if route.get("execution_status") == "cancelled" or (session and session.status in {"cancelled", "canceled"}):
        return {"task_id": execution.get("task_id"), "execution_id": session_id, "task_type": classification, "current_phase": "complete",
                "execution_status": "cancelled", "verification_status": "NOT_APPLICABLE", "closure_status": "cancelled",
                "founder_action_required": False, "technical_blocker": None, "started_at": session.started_at if session else None,
                "phase_started_at": None, "updated_at": session.completed_at if session else None, "completed_at": session.completed_at if session else None,
                "elapsed_seconds": _elapsed(session.started_at, session.completed_at) if session else 0, "progress_percent": 100,
                "current_action": "已停止", "next_action": "本次任务已由 Founder 停止", "stalled": False, "stall_reason": None}
    route_step = route.get("current_step") or ("inspect" if classification == "STANDARD_TASK" else "issue")
    blocker = dict(route.get("technical_blocker") or {}) or None
    founder_required = bool(route.get("founder_gate_required"))
    codex_boundary = dict(session.pending_codex_authorization or {}) if session else {}
    if codex_boundary:
        founder_required = True
    resolution = dict(route.get("technical_resolution_contract") or {})
    exhausted = resolution.get("resolution_status") == "exhausted"
    if exhausted:
        founder_required = True
    terminal = not founder_required and (route.get("execution_status") == "completed" or bool(session and session.status == "completed" and session.commit_hash and not blocker))
    terminal_failure = route.get("execution_status") in {"blocked", "failed"} and bool(blocker)
    acceptance_pending = terminal and dict(route.get("founder_acceptance") or {}).get("status") != "accepted"
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
    running = bool(session and session.status in {"queued", "executing", "testing"})
    stall_evidence = evaluate_stall(session) if session and running else {"stalled": False}
    stalled = bool(stall_evidence["stalled"])
    if exhausted:
        title, next_action = "Technical Blocker", "Founder 需要关注"
    elif founder_required:
        title, next_action = "等待 Founder 授权", "Founder 需要操作"
    elif resolution.get("resolution_status") == "retrying":
        title, next_action = "正在重新验证", "Founder 无需操作"
    elif resolution.get("resolution_status") in {"pending", "diagnosing"}:
        title, next_action = "正在自愈", "Founder 无需操作"
    elif blocker:
        if route.get("execution_status") == "failed":
            title, next_action = "验证失败", "验收结果未通过；等待 Founder 决定下一步"
        elif phase in {"verification", "verify"}:
            title, next_action = "验证受阻", "自动验证器均不可用；等待 Founder 人工验收"
        else:
            title, next_action = "执行受阻", "等待 Founder 查看阻塞原因"
    elif stalled:
        title, next_action = "执行器异常 · 正在自愈", "Founder 无需操作"
    elif terminal:
        title, next_action = ("环境健康检查完成" if route.get("health_check_resumed") else "已完成"), "等待 Founder 验收"
    else:
        titles = {"inspect": "正在检查", "plan": "正在规划", "execution": "正在实施", "fix": "正在修复", "verification": "正在验证", "verify": "正在验证", "learning": "正在沉淀", "closure": "正在关闭", "issue": "正在理解问题"}
        title, next_action = titles.get(phase, "正在自动执行"), "Founder 无需操作"
    return {
        "task_id": execution.get("task_id") or (route.get("standard_task_contract") or route.get("quick_fix_contract") or {}).get("task_id"),
        "execution_id": session_id, "task_type": classification, "current_phase": phase,
        "execution_status": "waiting_for_founder_authorization" if founder_required else "completed" if terminal else route.get("execution_status") if terminal_failure else "stalled" if stalled else (session.status if session else route.get("execution_status")),
        "verification_status": "PASS" if terminal else "FAILED" if terminal_failure and route.get("execution_status") == "failed" else "BLOCKED" if terminal_failure else "PENDING",
        "closure_status": "awaiting_founder_acceptance" if terminal else "pending",
        "founder_action_required": founder_required or acceptance_pending, "technical_blocker": blocker,
        "started_at": started_at, "phase_started_at": session.testing_at if session and phase in {"verification", "verify"} else started_at,
        "updated_at": latest_at or execution.get("dispatched_at"), "completed_at": completed_at,
        "elapsed_seconds": _elapsed(started_at, completed_at), "progress_percent": progress,
        "current_action": title, "next_action": next_action, "stalled": stalled,
        "stall_reason": "meaningful_progress_stale" if stalled else None,
        "worker_heartbeat_at": stall_evidence.get("worker_heartbeat_at"),
        "meaningful_progress_at": stall_evidence.get("meaningful_progress_at"),
        "codex_authorization_boundary": codex_boundary or None,
    }
