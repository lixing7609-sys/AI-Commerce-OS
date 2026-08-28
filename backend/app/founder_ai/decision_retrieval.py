"""Deterministic retrieval and advisory injection for decision strategies."""

from datetime import datetime, timezone
import re

from sqlalchemy import select

from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.db import SessionLocal
from app.founder_ai.reuse_applicability import (
    infer_applicability_profile, interaction_factors, profile_supports_scope,
    semantic_scope_fingerprint, source_module_rank,
)

APPLICABLE, NOT_APPLICABLE, UNCERTAIN = "APPLICABLE", "NOT_APPLICABLE", "UNCERTAIN"
FOUNDER_SYSTEM_KEY = "founder_ai"


def _tokens(value: str) -> set[str]:
    return {item for item in re.split(r"[^\w\u4e00-\u9fff]+", value.lower()) if item}


def assess_decision_applicability(*, asset: ReusableAssetDB, goal: str, semantic_scope: dict,
                                  risk_level: str = "low", constraints: list[str] | None = None) -> tuple[str, str]:
    if semantic_scope.get("scope_source") != "semantic_module" or semantic_scope.get("confidence") != "HIGH":
        return UNCERTAIN, "semantic target is not resolved with HIGH confidence"
    if asset.asset_kind != "decision_strategy" or asset.pattern_type != "interaction_surface_choice":
        return NOT_APPLICABLE, "asset is not an interaction-surface decision strategy"
    profile = infer_applicability_profile(asset)
    if not profile_supports_scope(profile, semantic_scope):
        return NOT_APPLICABLE, "current target is outside the Decision applicability domain"
    if risk_level.lower() not in set(profile.get("supported_risk_levels") or []):
        return NOT_APPLICABLE, "historical low-risk strategy cannot lower current risk"
    factors = interaction_factors(goal=goal, constraints=constraints)
    if any(factors[key] for key in (
        "explicit_modal", "destructive_or_high_risk", "large_or_multistep",
        "full_screen", "accessibility_incompatible",
    )):
        return NOT_APPLICABLE, "current constraints hit an invalidation condition"
    if factors["clear_non_surface_intent"]:
        return NOT_APPLICABLE, "current task does not require an interaction-surface decision"
    if factors["compact"] and factors["contextual_trigger"]:
        relation = "cross-module" if asset.semantic_module not in (semantic_scope.get("allowed_modules") or []) else "same-module"
        return APPLICABLE, f"{relation} Decision profile matches compact low-risk contextual actions"
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
            ReusableAssetDB.pattern_type == "interaction_surface_choice",
        )))
        assets = [asset for asset in assets if profile_supports_scope(infer_applicability_profile(asset), semantic_scope)]
        goal_tokens = _tokens(goal)
        assets.sort(key=lambda item: (
            source_module_rank(item, semantic_scope),
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
            profile = infer_applicability_profile(selected)
            source_module = selected.semantic_module
            current_module = modules[0] if modules else None
            scope_fingerprint = semantic_scope_fingerprint(semantic_scope)
            context = {
                "advisory": True,
                "scope_authority": False, "risk_authority": False,
                "approval_authority": False, "completion_authority": False,
                "decision_lookup_performed": True, "decision_asset_id": selected.id,
                "asset_fingerprint": selected.fingerprint,
                "source_semantic_module": source_module, "current_semantic_module": current_module,
                "cross_module_reuse": source_module != current_module,
                "applicability_profile": profile,
                "applicability_domain": (profile.get("domains") or [None])[0],
                "scope_before": scope_fingerprint, "scope_after": scope_fingerprint,
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
            "source_semantic_module": context.get("source_semantic_module"),
            "current_semantic_module": context.get("current_semantic_module"),
            "cross_module_reuse": context.get("cross_module_reuse", False),
            "applicability_domain": context.get("applicability_domain"),
            "scope_before": context.get("scope_before"), "scope_after": context.get("scope_after"),
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
