"""Authoritative, minimal lifecycle governance for learned ReusableAssets.

This authority is deliberately independent from AssetCatalog capability lifecycle.
ReusableAssets are advisory learned assets; lifecycle state never grants Candidate authority.
"""

from __future__ import annotations

from hashlib import sha256

from sqlalchemy import select

from app.core.reusable_asset.model import (
    ReusableAssetDB,
    ReusableAssetLifecycleEventDB,
    ReuseEvidenceDB,
)
from app.database.db import SessionLocal


ACTIVE = "active"
INVALIDATED = "invalidated"
SUPERSEDED = "superseded"
REUSABLE_ASSET_LIFECYCLE_STATES = frozenset({ACTIVE, INVALIDATED, SUPERSEDED})
SELECTABLE_REUSABLE_ASSET_STATUSES = frozenset({ACTIVE})
LEGAL_REUSABLE_ASSET_TRANSITIONS = {ACTIVE: frozenset({INVALIDATED, SUPERSEDED})}
TERMINAL_REUSABLE_ASSET_STATES = frozenset({INVALIDATED, SUPERSEDED})


class ReusableAssetLifecycleConflict(ValueError):
    pass


def is_reusable_asset_selectable(asset_or_status) -> bool:
    status = asset_or_status if isinstance(asset_or_status, str) else asset_or_status.status
    return status in SELECTABLE_REUSABLE_ASSET_STATUSES


def _required(value: str | None, field: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"reusable_asset_lifecycle_{field}_required")
    return normalized


def _transition_key(*, asset_id: str, to_status: str, successor_id: str | None) -> str:
    value = f"reusable-asset-lifecycle-v1:{asset_id}:{to_status}:{successor_id or '-'}"
    return sha256(value.encode()).hexdigest()


def _validate_successor(asset: ReusableAssetDB, successor: ReusableAssetDB | None) -> None:
    if successor is None:
        raise LookupError("reusable_asset_successor_not_found")
    if successor.id == asset.id:
        raise ReusableAssetLifecycleConflict("reusable_asset_cannot_supersede_itself")
    if not is_reusable_asset_selectable(successor):
        raise ReusableAssetLifecycleConflict("reusable_asset_successor_not_selectable")
    if (
        successor.system_id != asset.system_id
        or successor.asset_kind != asset.asset_kind
        or successor.pattern_type != asset.pattern_type
        or successor.semantic_module != asset.semantic_module
    ):
        raise ReusableAssetLifecycleConflict("reusable_asset_successor_incompatible")
    if successor.superseded_by:
        raise ReusableAssetLifecycleConflict("reusable_asset_successor_has_successor")


def _validate_exact_replay(
    existing: ReusableAssetLifecycleEventDB,
    *,
    asset_id: str,
    to_status: str,
    reason: str,
    actor: str,
    source: str,
    evidence_ref: str | None,
    successor_id: str | None,
) -> None:
    requested = (
        asset_id, ACTIVE, to_status, reason, actor, source, evidence_ref, successor_id,
    )
    persisted = (
        existing.reusable_asset_id, existing.from_status, existing.to_status,
        existing.reason, existing.actor, existing.source, existing.evidence_ref,
        existing.successor_id,
    )
    if requested != persisted:
        raise ReusableAssetLifecycleConflict(
            "reusable_asset_lifecycle_provenance_conflict"
        )


def transition_reusable_asset(
    asset_id: str,
    to_status: str,
    *,
    reason: str,
    actor: str,
    source: str = "governance",
    evidence_ref: str | None = None,
    successor_id: str | None = None,
    session_factory=SessionLocal,
) -> ReusableAssetLifecycleEventDB:
    """Perform the only legal durable ReusableAsset transitions, idempotently."""
    reason = _required(reason, "reason")
    actor = _required(actor, "actor")
    source = _required(source, "source")
    if to_status not in {INVALIDATED, SUPERSEDED}:
        raise ReusableAssetLifecycleConflict("illegal_reusable_asset_target_status")
    if to_status == SUPERSEDED and not successor_id:
        raise ValueError("reusable_asset_successor_required")
    if to_status == INVALIDATED and successor_id:
        raise ReusableAssetLifecycleConflict("invalidated_asset_cannot_have_successor")
    key = _transition_key(asset_id=asset_id, to_status=to_status, successor_id=successor_id)
    with session_factory() as db:
        asset = db.scalar(select(ReusableAssetDB).where(ReusableAssetDB.id == asset_id).with_for_update())
        if asset is None:
            raise LookupError("reusable_asset_not_found")
        existing = db.scalar(select(ReusableAssetLifecycleEventDB).where(
            ReusableAssetLifecycleEventDB.transition_key == key,
        ))
        if existing is not None:
            _validate_exact_replay(
                existing, asset_id=asset_id, to_status=to_status, reason=reason,
                actor=actor, source=source, evidence_ref=evidence_ref,
                successor_id=successor_id,
            )
            if asset.status != to_status:
                raise ReusableAssetLifecycleConflict(
                    "reusable_asset_lifecycle_state_event_conflict"
                )
            if to_status == SUPERSEDED and asset.superseded_by != successor_id:
                raise ReusableAssetLifecycleConflict("reusable_asset_conflicting_successor")
            return existing
        if asset.status != ACTIVE:
            raise ReusableAssetLifecycleConflict(
                f"illegal_reusable_asset_transition:{asset.status}->{to_status}"
            )
        successor = db.get(ReusableAssetDB, successor_id) if successor_id else None
        if to_status == SUPERSEDED:
            _validate_successor(asset, successor)
        event = ReusableAssetLifecycleEventDB(
            id=f"reuse-lifecycle-{key[:20]}", transition_key=key,
            reusable_asset_id=asset.id, from_status=ACTIVE, to_status=to_status,
            reason=reason, actor=actor, source=source, evidence_ref=evidence_ref,
            successor_id=successor_id,
        )
        asset.status = to_status
        asset.superseded_by = successor_id if to_status == SUPERSEDED else None
        db.add(event)
        db.commit()
        db.refresh(event)
        return event


def invalidate_reusable_asset(asset_id: str, *, reason: str, actor: str,
                              source: str = "governance", evidence_ref: str | None = None,
                              session_factory=SessionLocal) -> ReusableAssetLifecycleEventDB:
    return transition_reusable_asset(
        asset_id, INVALIDATED, reason=reason, actor=actor, source=source,
        evidence_ref=evidence_ref, session_factory=session_factory,
    )


def supersede_reusable_asset(old_asset_id: str, new_asset_id: str, *, reason: str, actor: str,
                             source: str = "governance", evidence_ref: str | None = None,
                             session_factory=SessionLocal) -> ReusableAssetLifecycleEventDB:
    return transition_reusable_asset(
        old_asset_id, SUPERSEDED, reason=reason, actor=actor, source=source,
        evidence_ref=evidence_ref, successor_id=new_asset_id, session_factory=session_factory,
    )


def invalidate_reusable_asset_from_reuse_failure(
    asset_id: str,
    reuse_evidence_id: str,
    *,
    reason: str,
    actor: str,
    session_factory=SessionLocal,
) -> ReusableAssetLifecycleEventDB:
    """Governance decision boundary: evidence is required; invalidation remains explicit."""
    with session_factory() as db:
        evidence = db.get(ReuseEvidenceDB, reuse_evidence_id)
        if evidence is None or evidence.reuse_asset_id != asset_id:
            raise ReusableAssetLifecycleConflict("reuse_failure_evidence_asset_mismatch")
        result = dict(evidence.final_result or {})
        playbook = dict(result.get("playbook_evidence") or {})
        outcome = str(playbook.get("final_result") or result.get("status") or "").lower()
        if outcome not in {"failed", "blocked", "cancelled", "canceled"}:
            raise ReusableAssetLifecycleConflict("reuse_evidence_is_not_negative")
    return invalidate_reusable_asset(
        asset_id, reason=reason, actor=actor, source="reuse_failure_governance",
        evidence_ref=reuse_evidence_id, session_factory=session_factory,
    )


def list_reusable_asset_lifecycle_events(asset_id: str, *, session_factory=SessionLocal) -> list[ReusableAssetLifecycleEventDB]:
    with session_factory() as db:
        return list(db.scalars(select(ReusableAssetLifecycleEventDB).where(
            ReusableAssetLifecycleEventDB.reusable_asset_id == asset_id,
        ).order_by(ReusableAssetLifecycleEventDB.created_at, ReusableAssetLifecycleEventDB.id)))


def reusable_asset_governance_boundary() -> dict:
    return {
        "reusable_asset_authority": "ReusableAssetDB + reusable_asset_lifecycle",
        "capability_catalog_authority": "AssetCatalogDB + asset_lifecycle.service",
        "promotion_bridge": False,
        "selectable_states": sorted(SELECTABLE_REUSABLE_ASSET_STATUSES),
    }
