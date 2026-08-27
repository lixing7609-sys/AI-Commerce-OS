"""Persistence and deduplication for reusable assets built on ArtifactAsset."""

from dataclasses import asdict
from datetime import datetime, timezone
from hashlib import sha256
import json

from sqlalchemy import select

from app.core.artifact.model import ArtifactAssetDB
from app.core.reusable_asset.model import ReusableAssetDB
from app.database.db import SessionLocal
from app.founder_ai.learning_extractor import LearningCandidate

FOUNDER_SYSTEM_KEY = "founder_ai"


def candidate_fingerprint(candidate: LearningCandidate) -> str:
    stable = {
        "asset_kind": candidate.asset_kind, "pattern_type": candidate.pattern_type,
        "semantic_module": candidate.semantic_module,
        "implementation_pattern": candidate.implementation_pattern,
        "verification_pattern": candidate.verification_pattern,
        "reuse_conditions": candidate.reuse_conditions,
        "invalidation_conditions": candidate.invalidation_conditions,
    }
    return sha256(json.dumps(stable, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def classify_learning_candidate(candidate: LearningCandidate | None) -> str:
    if candidate is None:
        return "execution_evidence_only"
    return "reusable_asset" if candidate.asset_kind == "ui_interaction_pattern" else "memory_only"


def save_reusable_asset(candidate: LearningCandidate, *, session_factory=SessionLocal) -> ReusableAssetDB:
    fingerprint = candidate_fingerprint(candidate)
    with session_factory() as db:
        existing = db.scalar(select(ReusableAssetDB).where(
            ReusableAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            ReusableAssetDB.fingerprint == fingerprint,
        ))
        source = {"task_id": candidate.source_task_id, "execution_id": candidate.source_execution_id,
                  "artifact_id": candidate.source_artifact_id, "memory_ids": candidate.source_memory_ids,
                  "evidence": candidate.source_evidence}
        if existing is not None:
            evidence = [item for item in list(existing.source_evidence or [])
                        if not (item.get("task_id") == candidate.source_task_id
                                and item.get("execution_id") == candidate.source_execution_id)]
            evidence.append(source)
            existing.source_evidence = evidence
            existing.updated_at = datetime.now(timezone.utc)
            db.commit(); db.refresh(existing)
            return existing
        artifact = ArtifactAssetDB(
            system_id=FOUNDER_SYSTEM_KEY, task_asset_id=candidate.source_task_id,
            artifact_type="reusable_ui_pattern", title="Anchored Portal Popover",
            description="Reusable UI interaction pattern extracted from a verified completed execution.",
            location="asset-memory-center/reusable-assets", content_ref=None, status="active",
        )
        db.add(artifact); db.flush()
        record = ReusableAssetDB(
            system_id=FOUNDER_SYSTEM_KEY, artifact_id=artifact.id,
            asset_kind=candidate.asset_kind, pattern_type=candidate.pattern_type,
            semantic_module=candidate.semantic_module, target_keywords=candidate.target_keywords,
            source_task_id=candidate.source_task_id, source_execution_id=candidate.source_execution_id,
            source_artifact_id=candidate.source_artifact_id, source_memory_ids=candidate.source_memory_ids,
            source_evidence=[source], implementation_pattern=candidate.implementation_pattern,
            verification_pattern=candidate.verification_pattern, reuse_conditions=candidate.reuse_conditions,
            invalidation_conditions=candidate.invalidation_conditions, confidence=candidate.confidence,
            status="active", fingerprint=fingerprint,
        )
        db.add(record); db.commit(); db.refresh(record)
        return record


def list_reusable_assets(*, session_factory=SessionLocal) -> list[ReusableAssetDB]:
    with session_factory() as db:
        return list(db.scalars(select(ReusableAssetDB).where(
            ReusableAssetDB.system_id == FOUNDER_SYSTEM_KEY,
        ).order_by(ReusableAssetDB.updated_at.desc())))


def serialize_reusable_asset(asset: ReusableAssetDB) -> dict:
    return {key: value for key, value in asdict(_AssetView.from_record(asset)).items()}


from dataclasses import dataclass

@dataclass(frozen=True)
class _AssetView:
    reuse_asset_id: str; artifact_id: str; asset_kind: str; pattern_type: str; semantic_module: str
    target_keywords: list; source_task_id: str; source_execution_id: str; source_artifact_id: str | None
    source_memory_ids: list; implementation_pattern: dict; verification_pattern: dict; reuse_conditions: list
    invalidation_conditions: list; confidence: float; status: str; fingerprint: str; superseded_by: str | None
    created_at: str; updated_at: str

    @classmethod
    def from_record(cls, item):
        return cls(item.id, item.artifact_id, item.asset_kind, item.pattern_type, item.semantic_module,
                   list(item.target_keywords or []), item.source_task_id, item.source_execution_id,
                   item.source_artifact_id, list(item.source_memory_ids or []), dict(item.implementation_pattern),
                   dict(item.verification_pattern), list(item.reuse_conditions or []),
                   list(item.invalidation_conditions or []), float(item.confidence), item.status,
                   item.fingerprint, item.superseded_by, item.created_at.isoformat(), item.updated_at.isoformat())
