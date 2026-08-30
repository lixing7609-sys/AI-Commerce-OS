"""Scope-safe deterministic retrieval and advisory reuse-context injection."""

from datetime import datetime, timezone
import re

from sqlalchemy import select

from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.db import SessionLocal
from app.founder_ai.reuse_applicability import (
    historical_source_files, infer_applicability_profile, interaction_factors,
    profile_supports_scope, semantic_scope_fingerprint, source_file_leakage, source_module_rank,
)
from app.founder_ai.reusable_asset_lifecycle import SELECTABLE_REUSABLE_ASSET_STATUSES

FOUNDER_SYSTEM_KEY = "founder_ai"
PASS, REJECT, UNCERTAIN = "PASS", "REJECT", "UNCERTAIN"


def _tokens(value: str) -> set[str]:
    return {item for item in re.split(r"[^\w\u4e00-\u9fff]+", value.lower()) if item}


def assess_reuse_compatibility(*, asset: ReusableAssetDB, goal: str, semantic_scope: dict,
                               recommended_strategy: str | None = None,
                               risk_level: str = "low", constraints: list[str] | None = None) -> tuple[str, str]:
    if semantic_scope.get("scope_source") != "semantic_module" or semantic_scope.get("confidence") != "HIGH":
        return UNCERTAIN, "current semantic target is not resolved with HIGH confidence"
    if asset.asset_kind != "ui_interaction_pattern" or asset.pattern_type != "anchored_portal_popover":
        return REJECT, "asset is not the supported anchored popover interaction pattern"
    profile = infer_applicability_profile(asset)
    if not profile_supports_scope(profile, semantic_scope):
        return REJECT, "current target is outside the pattern applicability domain"
    if risk_level.lower() not in set(profile.get("supported_risk_levels") or []):
        return REJECT, "historical low-risk pattern cannot lower current risk"
    factors = interaction_factors(goal=goal, constraints=constraints)
    if any(factors[key] for key in (
        "explicit_modal", "destructive_or_high_risk", "large_or_multistep",
        "full_screen", "accessibility_incompatible",
    )):
        return REJECT, "current goal hits an asset invalidation condition"
    if recommended_strategy and recommended_strategy != "anchored_popover":
        return REJECT, "the applicable Decision recommends a different interaction surface"
    if not factors["compact"] or not factors["contextual_trigger"]:
        return REJECT, "current interaction intent does not match a compact contextual trigger"
    if recommended_strategy == "anchored_popover" or factors["explicit_anchored_surface"]:
        relation = "cross-module" if asset.semantic_module not in (semantic_scope.get("allowed_modules") or []) else "same-module"
        return PASS, f"{relation} applicability profile matches the compact anchored interaction"
    return UNCERTAIN, "anchored interaction has not been selected by Decision or current constraints"


def lookup_reusable_assets(*, goal: str, semantic_scope: dict, task_id: str,
                           execution_id: str | None = None, recommended_strategy: str | None = None,
                           risk_level: str = "low", constraints: list[str] | None = None,
                           session_factory=SessionLocal) -> dict:
    """Lookup after scope resolution; returned guidance has no scope authority."""
    modules = list(semantic_scope.get("allowed_modules") or [])
    with session_factory() as db:
        assets = list(db.scalars(select(ReusableAssetDB).where(
            ReusableAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            ReusableAssetDB.status.in_(SELECTABLE_REUSABLE_ASSET_STATUSES),
            ReusableAssetDB.asset_kind == "ui_interaction_pattern",
            ReusableAssetDB.pattern_type == "anchored_portal_popover",
        )))
        assets = [asset for asset in assets if profile_supports_scope(infer_applicability_profile(asset), semantic_scope)]
        goal_tokens = _tokens(goal)
        assets.sort(key=lambda asset: (
            source_module_rank(asset, semantic_scope),
            asset.pattern_type == "anchored_portal_popover" and bool(goal_tokens & _tokens(" ".join(asset.target_keywords or []))),
            float(asset.confidence), asset.updated_at,
        ), reverse=True)
        selected = None; compatibility = None; reason = None
        for candidate in assets:
            state, candidate_reason = assess_reuse_compatibility(
                asset=candidate, goal=goal, semantic_scope=semantic_scope,
                recommended_strategy=recommended_strategy, risk_level=risk_level, constraints=constraints,
            )
            if state == PASS:
                selected, compatibility, reason = candidate, state, candidate_reason
                break
            compatibility, reason = compatibility or state, reason or candidate_reason
        now = datetime.now(timezone.utc)
        context = {}
        if selected is not None:
            profile = infer_applicability_profile(selected)
            source_module = selected.semantic_module
            current_module = modules[0] if modules else None
            scope_fingerprint = semantic_scope_fingerprint(semantic_scope)
            leakage = source_file_leakage(
                source_files=historical_source_files(selected),
                scope_before=semantic_scope, scope_after=semantic_scope,
            )
            context = {
                "advisory": True, "scope_authority": False, "risk_authority": False, "completion_authority": False,
                "reuse_lookup_performed": True, "reuse_asset_id": selected.id,
                "asset_fingerprint": selected.fingerprint,
                "source_semantic_module": source_module, "current_semantic_module": current_module,
                "cross_module_reuse": source_module != current_module,
                "applicability_profile": profile,
                "applicability_domain": (profile.get("domains") or [None])[0],
                "source_file_leakage": leakage["source_file_leakage"],
                "source_file_leakage_check": leakage["check"],
                "scope_before": scope_fingerprint, "scope_after": scope_fingerprint,
                "pattern_type": selected.pattern_type, "source_task_id": selected.source_task_id,
                "source_execution_id": selected.source_execution_id, "compatibility": PASS,
                "implementation_guidance": {
                    "guidance": list(dict(selected.implementation_pattern or {}).get("guidance") or []),
                },
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
            final_result={
                "status": "planning_injected" if selected else "not_applied",
                "source_semantic_module": context.get("source_semantic_module"),
                "current_semantic_module": context.get("current_semantic_module"),
                "cross_module_reuse": context.get("cross_module_reuse", False),
                "applicability_domain": context.get("applicability_domain"),
                "source_file_leakage": context.get("source_file_leakage", False),
                "scope_before": context.get("scope_before"), "scope_after": context.get("scope_after"),
            }, injected_at=now if selected else None,
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
    decision = dict(contract.get("decision_context") or {})
    recommended_strategy = (
        decision.get("recommended_strategy")
        if decision.get("applicability") == "APPLICABLE" else None
    )
    lookup = lookup_reusable_assets(
        goal=goal, semantic_scope=semantic_scope, task_id=task_id,
        recommended_strategy=recommended_strategy, risk_level="low",
        constraints=list(contract.get("constraints") or []), session_factory=session_factory,
    )
    result = dict(contract)
    result["reuse_lookup"] = {key: value for key, value in lookup.items() if key != "reuse_context"}
    if lookup["reuse_context"]:
        result["reuse_context"] = lookup["reuse_context"]
    after_scope = dict(result.get("semantic_scope") or {})
    after = (list(after_scope.get("allowed_modules") or []), list(after_scope.get("allowed_file_patterns") or []))
    if before != after:
        raise RuntimeError("reuse_context_must_not_expand_semantic_scope")
    return result
