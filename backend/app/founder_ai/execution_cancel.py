"""Founder emergency stop for controlled execution sessions."""
from datetime import datetime, timezone
import os, signal, subprocess
from pathlib import Path
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_registry import get_execution_session, save_execution_session
from core.conversation_first.model import SinoBrainSessionDB
from sqlalchemy import select

REPO_ROOT = Path(__file__).resolve().parents[3]
RUNNING = {"queued", "executing", "testing", "self_healing", "retrying", "cancelling"}

def request_founder_cancel(execution_id: str, *, repo_root: Path = REPO_ROOT, killpg=os.killpg) -> dict:
    record = get_execution_session(execution_id)
    if record is None: raise LookupError("Execution session not found")
    session, package = record
    if session.status in {"cancelled", "canceled"}: return {"execution_id": execution_id, "status": "cancelled", "idempotent": True}
    if session.status not in RUNNING: raise ValueError("execution_not_cancellable")
    session.status = "cancelling"; append_event(session, "founder_stop_requested", status="cancelling", message="Founder emergency stop requested"); save_execution_session(session, package)
    if session.subprocess_pid:
        try: killpg(session.subprocess_pid, signal.SIGTERM)
        except ProcessLookupError: pass
    dirty = subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, capture_output=True, text=True).stdout.splitlines()
    dirty_paths = [line[3:] for line in dirty if len(line) > 3]; owned = set((session.result or {}).get("changed_files") or [])
    unrelated = [path for path in dirty_paths if path not in owned]; unresolved = bool(dirty_paths)
    now = datetime.now(timezone.utc).isoformat(); session.status = "cancelled"; session.completed_at = now; session.failure_reason = "founder_emergency_stop"
    append_event(session, "cancelled_by_founder", status="cancelled", message="Execution cancelled by Founder", metadata={"cancelled_by": "FOUNDER", "cancel_reason": "founder_emergency_stop", "dirty_paths": dirty_paths, "unrelated_paths_preserved": unrelated}); save_execution_session(session, package)
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, session.task_asset_id)
        if task:
            task.status = "cancelled"; task.execution_status = "cancelled"; task.result = {**dict(task.result or {}), "cancelled_by": "FOUNDER", "cancelled_at": now, "cancel_reason": "founder_emergency_stop", "working_tree_status": "cancelled_with_unresolved_worktree" if unresolved else "clean"}; db.commit()
            if task.conversation_id:
                brain = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == task.conversation_id).with_for_update())
                if brain:
                    discovery = dict(brain.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
                    route.update({"execution_status": "cancelled", "current_step": "complete", "founder_gate_required": False,
                                  "cancellation": {"cancelled_by": "FOUNDER", "cancelled_at": now, "cancel_reason": "founder_emergency_stop", "working_tree_status": "cancelled_with_unresolved_worktree" if unresolved else "clean"}})
                    route.pop("technical_blocker", None); discovery["task_complexity_route"] = route; brain.discovery = discovery; db.commit()
    return {"execution_id": execution_id, "status": "cancelled", "cancelled_by": "FOUNDER", "cancelled_at": now, "cancel_reason": "founder_emergency_stop", "working_tree_status": "cancelled_with_unresolved_worktree" if unresolved else "clean", "unrelated_paths_preserved": unrelated}

def callback_allowed(execution_id: str) -> bool:
    record = get_execution_session(execution_id)
    return bool(record and record[0].status not in {"cancelling", "cancelled", "canceled"})
