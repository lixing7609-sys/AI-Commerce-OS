"""Deterministic retrieval and advisory injection for decision strategies."""

from datetime import datetime, timezone
import re

from sqlalchemy import select

from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.db import SessionLocal

APPLICABLE, NOT_APPLICABLE, UNCERTAIN = "APPLICABLE", "NOT_APPLICABLE", "UNCERTAIN"
FOUNDER_SYSTEM_KEY = "founder_ai"


def _tokens(value: str) -> set[str]:
    return {item for item in re.split(r"[^\w\u4e00-\u9fff]+", value.lower()) if item}


def assess_decision_applicability(*, asset: ReusableAssetDB, goal: str, semantic_scope: dict,
                                  risk_level: str = "low", constraints: list[str] | None = None) -> tuple[str, str]:
    modules = list(semantic_scope.get("allowed_modules") or [])
    if semantic_scope.get("scope_source") != "semantic_module" or semantic_scope.get("confidence") != "HIGH":
        return UNCERTAIN, "semantic target is not resolved with HIGH confidence"
    if asset.asset_kind != "decision_strategy" or asset.pattern_type != "interaction_surface_choice":
        return NOT_APPLICABLE, "asset is not an interaction-surface decision strategy"
    if asset.semantic_module not in modules:
        return NOT_APPLICABLE, "semantic module does not match the current target"
    if risk_level.lower() != "low":
        return NOT_APPLICABLE, "historical low-risk strategy cannot lower current risk"
    text = " ".join([goal, *(constraints or [])]).lower()
    if any(term in text for term in ("必须 modal", "必须模态", "全屏", "full-screen", "多步骤", "大工作区", "高风险", "destructive")):
        return NOT_APPLICABLE, "current constraints hit an invalidation condition"
    compact = any(term in text for term in (
        "一组操作", "几个操作", "操作入口", "操作选择", "操作选项", "菜单", "下拉", "弹出",
        "action set", "action choice", "actions", "menu", "点击后", "contextual",
    ))
    anchored = any(term in text for term in ("入口", "trigger", "按钮", "图标", "标题后", "底部"))
    if compact and anchored:
        return APPLICABLE, "compact low-risk actions are contextual to a visible trigger"
    return UNCERTAIN, "interaction surface requirements are not explicit enough"


def lookup_decision_strategies(*, goal: str, semantic_scope: dict, task_id: str,
                               execution_id: str | None = None, risk_level: str = "low",
                               constraints: list[str] | None = None, session_factory=SessionLocal) -> dict:
    modules = list(semantic_scope.get("allowed_modules") or [])
    with session_factory() as db:
        assets = list(db.scalars(select(ReusableAssetDB).where(
            ReusableAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            ReusableAssetDB.status == "active",
            ReusableAssetDB.asset_kind == "decision_strategy",
            ReusableAssetDB.semantic_module.in_(modules or ["__none__"]),
        )))
        goal_tokens = _tokens(goal)
        assets.sort(key=lambda item: (
            item.semantic_module in modules,
            item.pattern_type == "interaction_surface_choice",
            len(goal_tokens & _tokens(" ".join(item.target_keywords or []))),
            float(item.confidence), item.updated_at,
        ), reverse=True)
        selected = None; applicability = None; reason = None
        for asset in assets:
            state, why = assess_decision_applicability(
                asset=asset, goal=goal, semantic_scope=semantic_scope,
                risk_level=risk_level, constraints=constraints,
            )
            if state == APPLICABLE:
                selected, applicability, reason = asset, state, why
                break
            applicability, reason = applicability or state, reason or why

        context = {}
        if selected is not None:
            payload = dict(selected.implementation_pattern or {}).get("decision_strategy") or {}
            sources = list(selected.source_evidence or [])
            context = {
                "advisory": True,
                "scope_authority": False, "risk_authority": False,
                "approval_authority": False, "completion_authority": False,
                "decision_lookup_performed": True, "decision_asset_id": selected.id,
                "strategy_type": selected.pattern_type,
                "strategy_name": payload.get("strategy_name", "anchored_overlay_choice"),
                "applicability": APPLICABLE,
                "recommended_strategy": payload.get("recommended_strategy"),
                "rejected_strategies": payload.get("alternative_strategies") or [],
                "rationale": payload.get("rationale"),
                "selection_conditions": payload.get("selection_conditions") or [],
                "tradeoffs": payload.get("tradeoffs") or [],
                "source_lineage": sources,
                "decision_constraints": [
                    "must_not_expand_current_scope", "must_not_change_current_risk",
                    "must_not_approve_current_task", "must_not_decide_completion",
                    "must_run_current_task_verification",
                ],
            }
        now = datetime.now(timezone.utc)
        existing = db.scalar(select(ReuseEvidenceDB).where(
            ReuseEvidenceDB.system_id == FOUNDER_SYSTEM_KEY,
            ReuseEvidenceDB.task_asset_id == task_id,
            ReuseEvidenceDB.execution_id == execution_id,
            ReuseEvidenceDB.reuse_asset_id == (selected.id if selected else None),
        ).order_by(ReuseEvidenceDB.created_at.desc()))
        if existing is not None:
            return {"decision_context": dict(existing.reuse_context or {}), "decision_evidence_id": existing.id,
                    "decision_candidate_count": existing.reuse_candidate_count,
                    "applicability": existing.reuse_compatibility, "decision_applied": existing.reuse_applied}
        final_result = {
            "status": "planning_injected" if selected else "not_applied",
            "decision_lookup_performed": True,
            "decision_candidate_count": len(assets),
            "decision_asset_id": selected.id if selected else None,
            "strategy_type": selected.pattern_type if selected else None,
            "strategy_name": context.get("strategy_name"),
            "applicability": applicability,
            "decision_applied": selected is not None,
            "recommended_strategy": context.get("recommended_strategy"),
            "rejected_strategies": context.get("rejected_strategies") or [],
            "reason": reason,
            "source_task_ids": sorted({item.get("task_id") for item in (selected.source_evidence or []) if item.get("task_id")}) if selected else [],
            "source_execution_ids": sorted({item.get("execution_id") for item in (selected.source_evidence or []) if item.get("execution_id")}) if selected else [],
            "source_message_ids": sorted({message.get("message_id") for item in (selected.source_evidence or []) for message in (item.get("evidence", {}).get("messages") or []) if message.get("message_id")}) if selected else [],
            "scope_authority": False, "risk_authority": False,
            "approval_authority": False, "completion_authority": False,
        }
        evidence = ReuseEvidenceDB(
            system_id=FOUNDER_SYSTEM_KEY, task_asset_id=task_id, execution_id=execution_id,
            reuse_asset_id=selected.id if selected else None, reuse_lookup_performed=True,
            reuse_candidate_count=len(assets), reuse_compatibility=applicability,
            reuse_applied=selected is not None, reuse_rejected_reason=None if selected else (reason or "no applicable active strategy"),
            reuse_context=context,
            telemetry_events=["decision_lookup_started", "decision_lookup_completed", "decision_applied" if selected else "decision_rejected"],
            final_result=final_result, injected_at=now if selected else None,
        )
        db.add(evidence); db.commit(); db.refresh(evidence)
        return {"decision_context": context, "decision_evidence_id": evidence.id,
                "decision_candidate_count": len(assets), "applicability": applicability,
                "decision_applied": selected is not None}


def inject_decision_context(*, contract: dict, goal: str, task_id: str | None,
                            risk_level: str = "low", session_factory=SessionLocal) -> dict:
    if not task_id:
        return contract
    semantic_scope = dict(contract.get("semantic_scope") or {})
    if semantic_scope.get("scope_source") != "semantic_module":
        return contract
    before = (list(semantic_scope.get("allowed_modules") or []), list(semantic_scope.get("allowed_file_patterns") or []))
    lookup = lookup_decision_strategies(
        goal=goal, semantic_scope=semantic_scope, task_id=task_id,
        risk_level=risk_level, constraints=list(contract.get("constraints") or []),
        session_factory=session_factory,
    )
    result = dict(contract)
    result["decision_lookup"] = {key: value for key, value in lookup.items() if key != "decision_context"}
    if lookup["decision_context"]:
        result["decision_context"] = lookup["decision_context"]
    after_scope = dict(result.get("semantic_scope") or {})
    after = (list(after_scope.get("allowed_modules") or []), list(after_scope.get("allowed_file_patterns") or []))
    if before != after:
        raise RuntimeError("decision_context_must_not_expand_semantic_scope")
    return result
