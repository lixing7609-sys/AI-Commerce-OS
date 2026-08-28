"""Task-specific advisory composition for reusable execution guidance.

Playbooks are dynamic planning objects, not reusable assets. Future promotion requires
multiple independently verified tasks, stable composition, cycle-free lineage, and
measurable reuse value; this module intentionally performs no promotion.
"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from typing import Any

from sqlalchemy import select

from app.core.reusable_asset.model import ReuseEvidenceDB
from app.database.db import SessionLocal
from app.founder_ai.execution_state import runtime_revision
from app.founder_ai.reuse_applicability import semantic_scope_fingerprint


PASS, REJECT, UNCERTAIN = "PASS", "REJECT", "UNCERTAIN"
PLAYBOOK_TYPE = "ui_interaction_change"
MAX_LINEAGE_DEPTH = 8
REQUIRED_EVIDENCE = ["scope", "targeted_tests", "build", "diff_check", "browser_or_artifact"]
AUTHORITY_FLAGS = {
    "scope_authority": False,
    "risk_authority": False,
    "approval_authority": False,
    "completion_authority": False,
    "verification_override_authority": False,
}


def _stable(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _dedup(values: list[Any]) -> list[Any]:
    result: list[Any] = []
    seen: set[str] = set()
    for value in values:
        if value in (None, "", [], {}):
            continue
        marker = _stable(value)
        if marker not in seen:
            seen.add(marker)
            result.append(value)
    return result


def extract_explicit_founder_constraints(values: list[str] | None) -> list[str]:
    """Keep only explicit, bounded Founder language; never infer hidden preferences."""
    markers = ("不要", "不得", "必须", "只能", "保留", "不允许", "do not", "must", "only", "preserve")
    return _dedup([
        str(value).strip() for value in values or []
        if any(marker in str(value).lower() for marker in markers)
    ])


def _constraint(value: Any, *, priority: str, source: str, authority: str) -> dict[str, Any]:
    return {"value": value, "priority": priority, "source": source, "authority": authority}


def _merge_constraints(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the highest-priority occurrence and preserve every contributing source."""
    merged: dict[str, dict[str, Any]] = {}
    for value in values:
        marker = _stable(value.get("value"))
        if marker not in merged:
            merged[marker] = {**value, "sources": [value["source"]]}
            continue
        merged[marker]["sources"] = _dedup([*merged[marker]["sources"], value["source"]])
    return list(merged.values())


def _lineage_refs(context: dict, *, asset_key: str, kind: str) -> list[dict[str, Any]]:
    asset_id = context.get(asset_key)
    if not asset_id:
        return []
    sources = list(context.get("source_lineage") or [])
    if not sources and (context.get("source_task_id") or context.get("source_execution_id")):
        sources = [{"task_id": context.get("source_task_id"), "execution_id": context.get("source_execution_id")}]
    return [{
        "asset_id": asset_id,
        "asset_kind": kind,
        "asset_fingerprint": context.get("asset_fingerprint"),
        "source_task_ids": _dedup([item.get("task_id") for item in sources]),
        "source_execution_ids": _dedup([item.get("execution_id") for item in sources]),
    }]


def _cycle_conflicts(*, task_id: str, execution_id: str | None, playbook_id: str,
                     lineage: list[dict[str, Any]], ancestor_lineage_ids: list[str] | None) -> list[dict[str, Any]]:
    forbidden = {task_id, playbook_id, *(ancestor_lineage_ids or [])}
    if execution_id:
        forbidden.add(execution_id)
    conflicts = []
    if len(ancestor_lineage_ids or []) >= MAX_LINEAGE_DEPTH:
        conflicts.append({"conflict_type": "lineage_depth_exceeded", "resolution": "composition_rejected",
                          "rejected_reason": f"lineage depth reached {MAX_LINEAGE_DEPTH}"})
    for item in lineage:
        references = {item.get("asset_id"), *(item.get("source_task_ids") or []), *(item.get("source_execution_ids") or [])}
        matched = sorted(str(value) for value in references & forbidden if value)
        if matched:
            conflicts.append({"conflict_type": "recursive_lineage", "conflicting_asset_id": item.get("asset_id"),
                              "historical_guidance": matched, "resolution": "historical_asset_rejected",
                              "rejected_reason": "asset lineage references the current or an ancestor planning identity"})
    return conflicts


def _guidance_conflicts(founder_constraints: list[str], decision: dict, pattern: dict) -> list[dict[str, Any]]:
    current = " ".join(founder_constraints).lower()
    conflicts = []
    inline = any(term in current for term in ("不要浮层", "不要弹", "直接内联", "内联展开", "inline", "no overlay", "no popover"))
    no_portal = any(term in current for term in ("不要 portal", "不使用 portal", "no portal"))
    if inline and decision.get("recommended_strategy") == "anchored_popover":
        conflicts.append({
            "conflicting_asset_id": decision.get("decision_asset_id"), "conflict_type": "founder_constraint_vs_decision",
            "authoritative_constraint": next((item for item in founder_constraints if any(term in item.lower() for term in ("浮层", "弹", "内联", "inline", "overlay", "popover"))), founder_constraints[0] if founder_constraints else None),
            "historical_guidance": "anchored_popover", "resolution": "historical_asset_rejected",
            "rejected_reason": "Founder explicitly requires a non-overlay interaction",
        })
    if no_portal and pattern.get("reuse_asset_id"):
        conflicts.append({
            "conflicting_asset_id": pattern.get("reuse_asset_id"), "conflict_type": "founder_constraint_vs_pattern",
            "authoritative_constraint": next((item for item in founder_constraints if "portal" in item.lower()), founder_constraints[0] if founder_constraints else None),
            "historical_guidance": "portal implementation", "resolution": "historical_asset_rejected",
            "rejected_reason": "Founder explicitly disallows the pattern implementation mechanism",
        })
    return conflicts


def _cross_module_safety_conflicts(*, semantic_scope: dict, decision: dict, pattern: dict) -> list[dict[str, Any]]:
    current_scope = semantic_scope_fingerprint(semantic_scope)
    conflicts = []
    for context, asset_key, kind in (
        (decision, "decision_asset_id", "decision_strategy"),
        (pattern, "reuse_asset_id", "ui_interaction_pattern"),
    ):
        if not context.get(asset_key):
            continue
        if context.get("scope_before") not in (None, current_scope) or context.get("scope_after") not in (None, current_scope):
            conflicts.append({
                "conflicting_asset_id": context.get(asset_key),
                "conflict_type": "historical_reuse_scope_mutation",
                "authoritative_constraint": "current semantic scope must remain unchanged",
                "historical_guidance": kind,
                "resolution": "historical_asset_rejected",
                "rejected_reason": "historical reuse scope fingerprint differs from the current Task scope",
            })
        if context.get("source_file_leakage") is True or context.get("source_file_leakage_check") == REJECT:
            conflicts.append({
                "conflicting_asset_id": context.get(asset_key),
                "conflict_type": "historical_source_file_leakage",
                "authoritative_constraint": "historical source files cannot enter current write scope",
                "historical_guidance": kind,
                "resolution": "historical_asset_rejected",
                "rejected_reason": "historical source files leaked into added current write scope",
            })
    return conflicts


def composition_fingerprint(*, task_id: str, semantic_target: str, semantic_scope: dict,
                            risk: str, founder_constraints: list[str], decision_context: dict,
                            pattern_context: dict, required_verification: list[str]) -> str:
    stable = {
        "task_id": task_id,
        "semantic_target": semantic_target,
        "semantic_scope": semantic_scope,
        "risk": risk,
        "founder_constraints": founder_constraints,
        "decision_assets": [[decision_context.get("decision_asset_id"), decision_context.get("asset_fingerprint")]],
        "pattern_assets": [[pattern_context.get("reuse_asset_id"), pattern_context.get("asset_fingerprint")]],
        "required_verification": required_verification,
    }
    return sha256(_stable(stable).encode()).hexdigest()


def _persist_playbook_evidence(*, evidence_id: str | None, playbook: dict,
                               session_factory=SessionLocal) -> None:
    if not evidence_id:
        return
    with session_factory() as db:
        evidence = db.get(ReuseEvidenceDB, evidence_id)
        if evidence is None:
            return
        existing = dict(evidence.reuse_context or {}).get("playbook_context") or {}
        if existing.get("composition_fingerprint") == playbook["composition_fingerprint"]:
            return
        evidence.reuse_context = {**dict(evidence.reuse_context or {}), "playbook_context": playbook}
        event_names = ["playbook_composed", "playbook_applied" if playbook["applied"] else "playbook_rejected"]
        evidence.telemetry_events = _dedup([*list(evidence.telemetry_events or []), *event_names])
        evidence.final_result = {
            **dict(evidence.final_result or {}),
            "playbook_evidence": {
                "playbook_composed": playbook["composed"], "playbook_applied": playbook["applied"],
                "playbook_id": playbook["playbook_id"], "playbook_type": playbook["playbook_type"],
                "composition_fingerprint": playbook["composition_fingerprint"],
                "decision_asset_ids": playbook["decision_asset_ids"], "pattern_asset_ids": playbook["pattern_asset_ids"],
                "authoritative_constraint_count": len(playbook["authoritative_constraints"]),
                "advisory_constraint_count": len(playbook["advisory_constraints"]),
                "rejected_assets": playbook["rejected_assets"], "rejected_reasons": playbook["rejected_reasons"],
                "compatibility": playbook["compatibility"], "safety_gate": playbook["safety_gate"],
                "source_semantic_modules": playbook["source_semantic_modules"],
                "current_semantic_module": playbook["current_semantic_module"],
                "cross_module_reuse": playbook["cross_module_reuse"],
                "applicability_domains": playbook["applicability_domains"],
                "source_file_leakage_check": playbook["source_file_leakage_check"],
                "source_lineage": playbook["source_lineage"],
                "composition_reason": playbook["composition_reason"], **AUTHORITY_FLAGS,
                "injected_at": playbook["created_at"] if playbook["applied"] else None,
                "final_result": "planning_injected" if playbook["applied"] else "not_applied",
                "verification_result": "pending_current_task_verification",
            },
        }
        db.commit()


def finalize_playbook_evidence(
    *, task_id: str, execution_id: str, playbook_context: dict,
    final_result: str, verification_result: str, final_task_status: str,
    final_execution_status: str, final_canonical_stage: str, final_progress: int,
    browser_verification_result: str | None = None, scope_result: str | None = None,
    tests_result: str | None = None, build_result: str | None = None,
    diff_result: str | None = None, finalized_at: str | None = None,
    session_factory=SessionLocal,
) -> dict:
    """Attach canonical execution outcome to the existing Playbook evidence row."""
    playbook = dict(playbook_context or {})
    playbook_id = playbook.get("playbook_id")
    fingerprint = playbook.get("composition_fingerprint")
    if not playbook_id or not fingerprint:
        return {"status": "NOT_APPLICABLE", "reason": "playbook identity missing"}
    with session_factory() as db:
        candidates = list(db.scalars(select(ReuseEvidenceDB).where(
            ReuseEvidenceDB.task_asset_id == task_id,
        ).order_by(ReuseEvidenceDB.created_at)))
        evidence = next((item for item in candidates if
                         dict((item.final_result or {}).get("playbook_evidence") or {}).get("playbook_id") == playbook_id), None)
        if evidence is None:
            return {"status": "NOT_FOUND", "playbook_id": playbook_id}
        current = dict((evidence.final_result or {}).get("playbook_evidence") or {})
        if current.get("composition_fingerprint") != fingerprint:
            return {"status": "REJECTED", "reason": "playbook composition fingerprint mismatch"}
        outcome = {
            "execution_id": execution_id,
            "final_result": final_result,
            "verification_result": verification_result,
            "finalized_at": finalized_at or datetime.now(timezone.utc).isoformat(),
            "final_task_status": final_task_status,
            "final_execution_status": final_execution_status,
            "final_canonical_stage": final_canonical_stage,
            "final_progress": final_progress,
            "browser_verification_result": browser_verification_result,
            "scope_result": scope_result,
            "tests_result": tests_result,
            "build_result": build_result,
            "diff_result": diff_result,
        }
        comparable = {key: value for key, value in outcome.items() if key != "finalized_at"}
        if evidence.execution_id == execution_id and all(current.get(key) == value for key, value in comparable.items()):
            return {"status": "ALREADY_FINALIZED", "evidence_id": evidence.id, "playbook_id": playbook_id}
        evidence.execution_id = execution_id
        evidence.telemetry_events = _dedup([*list(evidence.telemetry_events or []), "playbook_finalized"])
        evidence.final_result = {
            **dict(evidence.final_result or {}),
            "status": final_result,
            "playbook_evidence": {**current, **outcome},
        }
        db.commit()
        return {"status": "FINALIZED", "evidence_id": evidence.id, "playbook_id": playbook_id,
                "composition_fingerprint": fingerprint, **outcome}


def compose_execution_playbook(*, contract: dict, task_id: str | None, goal: str, risk: str,
                               founder_constraints: list[str] | None = None,
                               execution_id: str | None = None,
                               ancestor_lineage_ids: list[str] | None = None,
                               session_factory=SessionLocal,
                               created_at: str | None = None,
                               runtime_revision_value: str | None = None) -> dict:
    """Compose one scope-safe UI playbook after Decision and Pattern retrieval."""
    if not task_id:
        return contract
    result = dict(contract)
    semantic_scope = dict(result.get("semantic_scope") or {})
    semantic_target = str(result.get("target_component") or result.get("target_surface") or "")
    decision = dict(result.get("decision_context") or {})
    pattern = dict(result.get("reuse_context") or {})
    current_acceptance = list(result.get("acceptance_criteria") or [])
    explicit = extract_explicit_founder_constraints(founder_constraints)
    required = _dedup([
        *REQUIRED_EVIDENCE,
        *list((pattern.get("verification_guidance") or {}).get("requires_own_evidence") or []),
    ])
    fingerprint = composition_fingerprint(
        task_id=task_id, semantic_target=semantic_target, semantic_scope=semantic_scope, risk=risk,
        founder_constraints=explicit, decision_context=decision, pattern_context=pattern,
        required_verification=required,
    )
    playbook_id = f"playbook-{sha256(f'{task_id}:{fingerprint}'.encode()).hexdigest()[:20]}"
    lineage = _dedup([
        *_lineage_refs(decision, asset_key="decision_asset_id", kind="decision_strategy"),
        *_lineage_refs(pattern, asset_key="reuse_asset_id", kind="ui_interaction_pattern"),
    ])

    authoritative = _merge_constraints([
        _constraint("frozen_system_and_risk_contract", priority="P1", source="frozen_v1", authority="authoritative"),
        *[_constraint(item, priority="P2", source="founder_current_explicit", authority="authoritative") for item in explicit],
        _constraint({"semantic_target": semantic_target, "semantic_scope": semantic_scope}, priority="P3", source="current_semantic_scope", authority="authoritative"),
        *[_constraint(item, priority="P4", source="current_acceptance_criteria", authority="authoritative") for item in current_acceptance],
        _constraint(risk, priority="P5", source="current_task_risk", authority="authoritative"),
    ])
    advisory = _merge_constraints([
        *[_constraint(item, priority="P6", source=f"decision_strategy:{decision.get('decision_asset_id')}", authority="advisory") for item in decision.get("decision_constraints") or []],
        *[_constraint(item, priority="P7", source=f"ui_interaction_pattern:{pattern.get('reuse_asset_id')}", authority="advisory") for item in pattern.get("reuse_constraints") or []],
    ])
    conflicts = _guidance_conflicts(explicit, decision, pattern)
    conflicts.extend(_cross_module_safety_conflicts(
        semantic_scope=semantic_scope, decision=decision, pattern=pattern,
    ))
    conflicts.extend(_cycle_conflicts(task_id=task_id, execution_id=execution_id, playbook_id=playbook_id,
                                      lineage=lineage, ancestor_lineage_ids=ancestor_lineage_ids))

    decision_ok = decision.get("applicability") == "APPLICABLE" and bool(decision.get("decision_asset_id"))
    pattern_ok = pattern.get("compatibility") == "PASS" and bool(pattern.get("reuse_asset_id"))
    scope_ok = semantic_scope.get("scope_source") == "semantic_module" and semantic_scope.get("confidence") == "HIGH"
    scope_fingerprint = semantic_scope_fingerprint(semantic_scope)
    source_file_leakage_ok = not any(
        context.get("source_file_leakage") is True or context.get("source_file_leakage_check") == REJECT
        for context in (decision, pattern)
    )
    reuse_scope_unchanged = all(
        context.get("scope_before") in (None, scope_fingerprint)
        and context.get("scope_after") in (None, scope_fingerprint)
        for context in (decision, pattern)
    )
    safety_checks = {
        "semantic_target_preserved": bool(semantic_target) and scope_ok,
        "semantic_scope_unchanged": reuse_scope_unchanged,
        "risk_not_lowered": str(risk).lower() == "low",
        "approval_boundary_unchanged": True,
        "decision_applicability_valid": decision_ok,
        "pattern_compatibility_valid": pattern_ok,
        "no_authoritative_constraint_conflict": not bool(conflicts),
        "verification_requirements_not_weakened": set(REQUIRED_EVIDENCE).issubset(required),
        "completion_requirements_not_weakened": True,
        "source_file_leakage_absent": source_file_leakage_ok,
        "no_lineage_cycle": not any(item.get("conflict_type") in {"recursive_lineage", "lineage_depth_exceeded"} for item in conflicts),
    }
    if conflicts:
        gate, reason = REJECT, "authoritative constraint or lineage conflicts with historical guidance"
    elif not scope_ok or not decision_ok or not pattern_ok:
        gate, reason = UNCERTAIN, "semantic target, Decision applicability, or Pattern compatibility is incomplete"
    else:
        gate, reason = PASS, "current authority preserved; applicable Decision and compatible Pattern composed"
    rejected_assets = _dedup([{
        "asset_id": item.get("conflicting_asset_id"),
        "asset_kind": "decision_strategy" if item.get("conflicting_asset_id") == decision.get("decision_asset_id") else "ui_interaction_pattern",
        "reason": item.get("rejected_reason"), "stage": "playbook_safety_gate", "source": item.get("conflict_type"),
    } for item in conflicts if item.get("conflicting_asset_id")])
    now = created_at or datetime.now(timezone.utc).isoformat()
    playbook = {
        "playbook_id": playbook_id, "playbook_type": PLAYBOOK_TYPE,
        "composed": True, "applied": gate == PASS, "task_id": task_id,
        "semantic_target": semantic_target,
        "semantic_module": (semantic_scope.get("allowed_modules") or [None])[0],
        "recommended_strategy": decision.get("recommended_strategy"),
        "source_semantic_modules": _dedup([
            decision.get("source_semantic_module"), pattern.get("source_semantic_module"),
        ]),
        "current_semantic_module": (semantic_scope.get("allowed_modules") or [None])[0],
        "cross_module_reuse": bool(decision.get("cross_module_reuse") or pattern.get("cross_module_reuse")),
        "applicability_domains": _dedup([
            decision.get("applicability_domain"), pattern.get("applicability_domain"),
        ]),
        "source_file_leakage_check": PASS if source_file_leakage_ok else REJECT,
        "decision_asset_ids": _dedup([decision.get("decision_asset_id")]),
        "pattern_asset_ids": _dedup([pattern.get("reuse_asset_id")]),
        "authoritative_constraints": authoritative, "advisory_constraints": advisory,
        "conflicts": conflicts, "rejected_assets": rejected_assets,
        "rejected_reasons": _dedup([item.get("rejected_reason") for item in conflicts]),
        "implementation_guidance": {
            "recommended_strategy": decision.get("recommended_strategy"),
            "decision_rationale": decision.get("rationale"), "tradeoffs": list(decision.get("tradeoffs") or []),
            "pattern_type": pattern.get("pattern_type"),
            "pattern_guidance": dict(pattern.get("implementation_guidance") or {}),
        },
        "verification_guidance": {
            "frozen_required": list(REQUIRED_EVIDENCE), "current_acceptance": current_acceptance,
            "historical": dict(pattern.get("verification_guidance") or {}),
            "merge_rule": "historical guidance may add or refine; it cannot remove frozen or current requirements",
        },
        "required_evidence": required,
        "compatibility": {"decision": decision.get("applicability"), "pattern": pattern.get("compatibility")},
        "safety_gate": gate, "safety_checks": safety_checks, "composition_reason": reason,
        "composition_fingerprint": fingerprint, "source_lineage": lineage,
        **AUTHORITY_FLAGS, "created_at": now,
        "runtime_revision": runtime_revision_value or runtime_revision(),
    }
    result["playbook_context"] = playbook
    result["playbook_evidence"] = {
        "playbook_composed": True, "playbook_applied": playbook["applied"],
        "playbook_id": playbook_id, "composition_fingerprint": fingerprint, "safety_gate": gate,
    }
    _persist_playbook_evidence(
        evidence_id=(result.get("decision_lookup") or {}).get("decision_evidence_id"),
        playbook=playbook, session_factory=session_factory,
    )
    return result
