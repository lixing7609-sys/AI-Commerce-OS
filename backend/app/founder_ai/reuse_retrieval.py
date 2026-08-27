"""Scope-safe deterministic retrieval and advisory reuse-context injection."""

from datetime import datetime, timezone
import re

from sqlalchemy import select

from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"
PASS, REJECT, UNCERTAIN = "PASS", "REJECT", "UNCERTAIN"


def _tokens(value: str) -> set[str]:
    return {item for item in re.split(r"[^\w\u4e00-\u9fff]+", value.lower()) if item}


def assess_reuse_compatibility(*, asset: ReusableAssetDB, goal: str, semantic_scope: dict) -> tuple[str, str]:
    modules = list(semantic_scope.get("allowed_modules") or [])
    if semantic_scope.get("scope_source") != "semantic_module" or semantic_scope.get("confidence") != "HIGH":
        return UNCERTAIN, "current semantic target is not resolved with HIGH confidence"
    if asset.semantic_module not in modules:
        return REJECT, "semantic module does not match the current target"
    lowered = goal.lower()
    if any(term in lowered for term in ("全屏", "full-screen", "bottom sheet", "移动端 sheet")):
        return REJECT, "current goal hits an asset invalidation condition"
    if any(term in lowered for term in ("popover", "弹出框", "弹窗", "菜单", "更多操作")):
        return PASS, "semantic module and compact anchored interaction are compatible"
    return UNCERTAIN, "target interaction does not clearly require an anchored popover"


def lookup_reusable_assets(*, goal: str, semantic_scope: dict, task_id: str,
                           execution_id: str | None = None, session_factory=SessionLocal) -> dict:
    """Lookup after scope resolution; returned guidance has no scope authority."""
    modules = list(semantic_scope.get("allowed_modules") or [])
    with session_factory() as db:
        assets = list(db.scalars(select(ReusableAssetDB).where(
            ReusableAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            ReusableAssetDB.status == "active",
            ReusableAssetDB.semantic_module.in_(modules or ["__none__"]),
        )))
        goal_tokens = _tokens(goal)
        assets.sort(key=lambda asset: (
            asset.semantic_module in modules,
            asset.pattern_type == "anchored_portal_popover" and bool(goal_tokens & _tokens(" ".join(asset.target_keywords or []))),
            float(asset.confidence), asset.updated_at,
        ), reverse=True)
        selected = None; compatibility = None; reason = None
        for candidate in assets:
            state, candidate_reason = assess_reuse_compatibility(asset=candidate, goal=goal, semantic_scope=semantic_scope)
            if state == PASS:
                selected, compatibility, reason = candidate, state, candidate_reason
                break
            compatibility, reason = compatibility or state, reason or candidate_reason
        now = datetime.now(timezone.utc)
        context = {}
        if selected is not None:
            context = {
                "advisory": True, "scope_authority": False, "risk_authority": False, "completion_authority": False,
                "reuse_lookup_performed": True, "reuse_asset_id": selected.id,
                "pattern_type": selected.pattern_type, "source_task_id": selected.source_task_id,
                "source_execution_id": selected.source_execution_id, "compatibility": PASS,
                "implementation_guidance": dict(selected.implementation_pattern),
                "verification_guidance": dict(selected.verification_pattern),
                "reuse_constraints": ["must_not_expand_current_scope", "must_run_current_task_verification"],
            }
        existing = db.scalar(select(ReuseEvidenceDB).where(
            ReuseEvidenceDB.system_id == FOUNDER_SYSTEM_KEY,
            ReuseEvidenceDB.task_asset_id == task_id,
            ReuseEvidenceDB.execution_id == execution_id,
            ReuseEvidenceDB.reuse_asset_id == (selected.id if selected else None),
        ).order_by(ReuseEvidenceDB.created_at.desc()))
        if existing is not None:
            return {"reuse_context": dict(existing.reuse_context or {}), "reuse_evidence_id": existing.id,
                    "reuse_candidate_count": existing.reuse_candidate_count,
                    "reuse_compatibility": existing.reuse_compatibility,
                    "reuse_applied": existing.reuse_applied}
        evidence = ReuseEvidenceDB(
            system_id=FOUNDER_SYSTEM_KEY, task_asset_id=task_id, execution_id=execution_id,
            reuse_asset_id=selected.id if selected else None, reuse_lookup_performed=True,
            reuse_candidate_count=len(assets), reuse_compatibility=compatibility,
            reuse_applied=selected is not None, reuse_rejected_reason=None if selected else (reason or "no compatible active asset"),
            reuse_context=context, telemetry_events=["reuse_lookup_started", "reuse_lookup_completed", "reuse_applied" if selected else "reuse_rejected"],
            final_result={"status": "planning_injected" if selected else "not_applied"}, injected_at=now if selected else None,
        )
        db.add(evidence); db.commit(); db.refresh(evidence)
        return {"reuse_context": context, "reuse_evidence_id": evidence.id,
                "reuse_candidate_count": len(assets), "reuse_compatibility": compatibility,
                "reuse_applied": selected is not None}


def inject_reuse_context(*, contract: dict, goal: str, task_id: str | None,
                         session_factory=SessionLocal) -> dict:
    if not task_id:
        return contract
    semantic_scope = dict(contract.get("semantic_scope") or {})
    if semantic_scope.get("scope_source") != "semantic_module":
        return contract
    before = (list(semantic_scope.get("allowed_modules") or []), list(semantic_scope.get("allowed_file_patterns") or []))
    lookup = lookup_reusable_assets(goal=goal, semantic_scope=semantic_scope, task_id=task_id, session_factory=session_factory)
    result = dict(contract)
    result["reuse_lookup"] = {key: value for key, value in lookup.items() if key != "reuse_context"}
    if lookup["reuse_context"]:
        result["reuse_context"] = lookup["reuse_context"]
    after_scope = dict(result.get("semantic_scope") or {})
    after = (list(after_scope.get("allowed_modules") or []), list(after_scope.get("allowed_file_patterns") or []))
    if before != after:
        raise RuntimeError("reuse_context_must_not_expand_semantic_scope")
    return result
