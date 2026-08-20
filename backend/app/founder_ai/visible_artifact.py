"""Browser-evidence gate for visible UI task completion."""
from datetime import datetime, timezone
from sqlalchemy import select
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from core.conversation_first.model import SinoBrainSessionDB

def browser_gate(evidence: dict | None, *, contract: dict | None = None) -> dict:
    evidence = dict(evidence or {})
    required = list((contract or {}).get("required_assertions") or ("hidden_without_query", "visible_with_query", "clears_input", "restores_full_list"))
    passed = evidence.get("status") == "PASS" and all(evidence.get(key) is True for key in required)
    return {"status": "PASS" if passed else "BLOCKED", "completion_allowed": passed, "evidence": evidence}

def complete_visible_ui_task(*, conversation_id: str, task_id: str, evidence: dict, checkpoint: str) -> dict:
    gate = browser_gate(evidence)
    if not gate["completion_allowed"]: return gate
    now = datetime.now(timezone.utc).isoformat()
    with SessionLocal() as db:
        brain = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if brain is None: raise LookupError("Sino Brain state not found")
        discovery = dict(brain.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        route.update({"current_step": "complete", "execution_status": "completed", "visible_artifact_verification": gate,
                      "visible_result": {"title": "能力仓库搜索清除功能", "target_surface": "Capability Repository", "target_route": "capability-center", "verification_status": "PASS", "verified_at": now},
                      "technical_resolution_contract": {**dict(route.get("technical_resolution_contract") or {}), "resolution_status": "resolved"}})
        route.pop("technical_blocker", None)
        execution = dict(route.get("autonomous_execution") or {}); execution.update({"dispatch_status": "completed", "verification": {"status": "PASS", "browser_verification": gate}, "checkpoint": {"status": "PASS", "commit": checkpoint}}); route["autonomous_execution"] = execution
        discovery["task_complexity_route"] = route; brain.discovery = discovery
        task = db.get(TaskAssetDB, task_id)
        if task:
            task.status = "completed"; task.execution_status = "completed"; task.result = {"status": "completed", "verification": gate, "checkpoint": checkpoint, "visible_result": route["visible_result"]}
        db.commit()
    return gate
