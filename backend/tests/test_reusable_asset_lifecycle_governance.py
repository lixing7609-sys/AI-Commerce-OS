from dataclasses import replace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.artifact.model import ArtifactAssetDB
from app.core.reusable_asset.model import (
    ReusableAssetDB,
    ReusableAssetLifecycleEventDB,
    ReuseEvidenceDB,
)
from app.database.base import Base
from app.founder_ai.learning_extractor import LearningCandidate
from app.founder_ai.reusable_asset_lifecycle import (
    ACTIVE,
    INVALIDATED,
    SUPERSEDED,
    ReusableAssetLifecycleConflict,
    invalidate_reusable_asset,
    invalidate_reusable_asset_from_reuse_failure,
    list_reusable_asset_lifecycle_events,
    reusable_asset_governance_boundary,
    supersede_reusable_asset,
    transition_reusable_asset,
)
from app.founder_ai.reusable_asset_service import save_reusable_asset
from app.founder_ai.reuse_retrieval import lookup_reusable_assets


def _factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[
        ArtifactAssetDB.__table__, ReusableAssetDB.__table__, ReuseEvidenceDB.__table__,
        ReusableAssetLifecycleEventDB.__table__,
    ])
    return sessionmaker(bind=engine, expire_on_commit=False)


def _candidate(*, task="task-source", execution="execution-source", variant="v1"):
    return LearningCandidate(
        asset_kind="ui_interaction_pattern", pattern_type="anchored_portal_popover",
        semantic_module="Founder Conversation", target_keywords=["popover", "menu"],
        source_task_id=task, source_execution_id=execution,
        source_artifact_id=f"source-artifact-{variant}", source_memory_ids=[],
        source_evidence={"verification": "PASS", "variant": variant},
        implementation_pattern={"guidance": [f"portal-{variant}"]},
        verification_pattern={"requires_own_evidence": ["scope", "tests"]},
        reuse_conditions=["compact contextual interaction"],
        invalidation_conditions=["modal required"], confidence=1.0,
    )


def _scope():
    return {"scope_source": "semantic_module", "confidence": "HIGH",
            "allowed_modules": ["Founder Conversation"], "allowed_file_patterns": ["frontend/current.jsx"]}


def _save_pair(factory):
    old = save_reusable_asset(_candidate(), session_factory=factory)
    new = save_reusable_asset(_candidate(task="task-new", execution="execution-new", variant="v2"), session_factory=factory)
    return old, new


def test_formal_invalidation_persists_provenance_is_idempotent_and_survives_restore():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    first = invalidate_reusable_asset(
        asset.id, reason="verified failure requires retirement", actor="founder",
        source="reuse_governance", evidence_ref="reuse-evidence-negative", session_factory=factory,
    )
    second = invalidate_reusable_asset(
        asset.id, reason="verified failure requires retirement", actor="founder",
        source="reuse_governance", evidence_ref="reuse-evidence-negative", session_factory=factory,
    )
    assert first.id == second.id
    with factory() as restored:
        record = restored.get(ReusableAssetDB, asset.id)
        assert record.status == INVALIDATED and record.superseded_by is None
        events = list(restored.scalars(select(ReusableAssetLifecycleEventDB)))
        assert len(events) == 1
        event = events[0]
        assert (event.from_status, event.to_status) == (ACTIVE, INVALIDATED)
        assert event.reason == "verified failure requires retirement"
        assert event.actor == "founder" and event.source == "reuse_governance"
        assert event.evidence_ref == "reuse-evidence-negative"
    result = lookup_reusable_assets(
        goal="把入口菜单改成 anchored popover", semantic_scope=_scope(),
        task_id="future-task", session_factory=factory,
    )
    assert result["reuse_applied"] is False and result["reuse_candidate_count"] == 0


def test_formal_supersession_selects_successor_and_is_idempotent():
    factory = _factory(); old, new = _save_pair(factory)
    first = supersede_reusable_asset(
        old.id, new.id, reason="new verified implementation", actor="governance-review",
        evidence_ref="reuse-evidence-successor", session_factory=factory,
    )
    second = supersede_reusable_asset(
        old.id, new.id, reason="new verified implementation", actor="governance-review",
        evidence_ref="reuse-evidence-successor", session_factory=factory,
    )
    assert first.id == second.id
    with factory() as restored:
        prior = restored.get(ReusableAssetDB, old.id)
        assert prior.status == SUPERSEDED and prior.superseded_by == new.id
        assert len(list(restored.scalars(select(ReusableAssetLifecycleEventDB)))) == 1
    result = lookup_reusable_assets(
        goal="把入口菜单改成 anchored popover", semantic_scope=_scope(),
        task_id="future-task", session_factory=factory,
    )
    assert result["reuse_applied"] is True
    assert result["reuse_context"]["reuse_asset_id"] == new.id


def test_terminal_states_cannot_return_to_active_or_cross_transition():
    factory = _factory(); invalidated, successor = _save_pair(factory)
    invalidate_reusable_asset(invalidated.id, reason="unsafe", actor="founder", session_factory=factory)
    with pytest.raises(ReusableAssetLifecycleConflict):
        transition_reusable_asset(
            invalidated.id, ACTIVE, reason="reactivate", actor="founder", session_factory=factory,
        )
    with pytest.raises(ReusableAssetLifecycleConflict):
        supersede_reusable_asset(
            invalidated.id, successor.id, reason="cross terminal", actor="founder", session_factory=factory,
        )


def test_database_rejects_unknown_lifecycle_status():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    with factory() as db:
        db.get(ReusableAssetDB, asset.id).status = "arbitrary_free_string"
        with pytest.raises(IntegrityError):
            db.commit()


def test_cross_semantic_module_successor_is_rejected_without_side_effects_after_restore():
    factory = _factory()
    old = save_reusable_asset(_candidate(), session_factory=factory)
    unrelated = save_reusable_asset(replace(
        _candidate(task="task-unrelated", execution="execution-unrelated", variant="unrelated"),
        semantic_module="Unrelated Private Module",
    ), session_factory=factory)
    with pytest.raises(ReusableAssetLifecycleConflict):
        supersede_reusable_asset(
            old.id, unrelated.id, reason="invalid cross-scope successor", actor="founder",
            session_factory=factory,
        )
    with factory() as db:
        restored_old = db.get(ReusableAssetDB, old.id)
        restored_new = db.get(ReusableAssetDB, unrelated.id)
        assert restored_old.status == ACTIVE and restored_old.superseded_by is None
        assert restored_new.status == ACTIVE and restored_new.superseded_by is None
        assert len(list(db.scalars(select(ReusableAssetLifecycleEventDB)))) == 0


@pytest.mark.parametrize("incompatibility", ["system_id", "asset_kind", "pattern_type", "inactive"])
def test_successor_authority_dimensions_are_enforced_without_side_effects(incompatibility):
    factory = _factory(); old, successor = _save_pair(factory)
    if incompatibility == "inactive":
        invalidate_reusable_asset(
            successor.id, reason="successor retired", actor="founder", session_factory=factory,
        )
        expected_events = 1
    else:
        with factory() as db:
            record = db.get(ReusableAssetDB, successor.id)
            setattr(record, incompatibility, f"different-{incompatibility}")
            db.commit()
        expected_events = 0
    with pytest.raises(ReusableAssetLifecycleConflict):
        supersede_reusable_asset(
            old.id, successor.id, reason="incompatible successor", actor="founder",
            session_factory=factory,
        )
    with factory() as db:
        restored = db.get(ReusableAssetDB, old.id)
        assert restored.status == ACTIVE and restored.superseded_by is None
        assert len(list(db.scalars(select(ReusableAssetLifecycleEventDB)))) == expected_events


@pytest.mark.parametrize("changed", ["reason", "actor", "source", "evidence_ref"])
def test_invalidation_conflicting_provenance_replay_is_rejected(changed):
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    original = dict(
        reason="verified failure", actor="governance-review", source="reuse_governance",
        evidence_ref="reuse-evidence-original",
    )
    first = invalidate_reusable_asset(asset.id, session_factory=factory, **original)
    conflict = dict(original)
    conflict[changed] = f"conflicting-{changed}"
    with pytest.raises(
        ReusableAssetLifecycleConflict,
        match="reusable_asset_lifecycle_provenance_conflict",
    ):
        invalidate_reusable_asset(asset.id, session_factory=factory, **conflict)
    with factory() as db:
        restored = db.get(ReusableAssetDB, asset.id)
        events = list(db.scalars(select(ReusableAssetLifecycleEventDB)))
        assert restored.status == INVALIDATED and restored.superseded_by is None
        assert len(events) == 1 and events[0].id == first.id
        assert events[0].reason == original["reason"]
        assert events[0].actor == original["actor"]
        assert events[0].source == original["source"]
        assert events[0].evidence_ref == original["evidence_ref"]


@pytest.mark.parametrize("changed", ["reason", "actor", "evidence_ref"])
def test_supersession_conflicting_provenance_replay_is_rejected_after_restore(changed):
    factory = _factory(); old, new = _save_pair(factory)
    original = dict(
        reason="verified successor", actor="governance-review",
        evidence_ref="reuse-evidence-successor",
    )
    first = supersede_reusable_asset(old.id, new.id, session_factory=factory, **original)
    conflict = dict(original)
    conflict[changed] = f"conflicting-{changed}"
    with pytest.raises(
        ReusableAssetLifecycleConflict,
        match="reusable_asset_lifecycle_provenance_conflict",
    ):
        supersede_reusable_asset(old.id, new.id, session_factory=factory, **conflict)
    with factory() as restored:
        record = restored.get(ReusableAssetDB, old.id)
        events = list(restored.scalars(select(ReusableAssetLifecycleEventDB)))
        assert record.status == SUPERSEDED and record.superseded_by == new.id
        assert len(events) == 1 and events[0].id == first.id
        assert events[0].reason == original["reason"]
        assert events[0].actor == original["actor"]
        assert events[0].evidence_ref == original["evidence_ref"]


def test_negative_reuse_evidence_is_a_formal_governance_input():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    with factory() as db:
        evidence = ReuseEvidenceDB(
            id="reuse-evidence-failed", system_id="founder_ai", task_asset_id="future-task",
            execution_id="future-execution", reuse_asset_id=asset.id,
            reuse_lookup_performed=True, reuse_candidate_count=1, reuse_compatibility="PASS",
            reuse_applied=True, final_result={"status": "failed"},
        )
        db.add(evidence); db.commit()
    event = invalidate_reusable_asset_from_reuse_failure(
        asset.id, "reuse-evidence-failed", reason="verified reuse failure", actor="founder",
        session_factory=factory,
    )
    retry = invalidate_reusable_asset_from_reuse_failure(
        asset.id, "reuse-evidence-failed", reason="verified reuse failure", actor="founder",
        session_factory=factory,
    )
    assert retry.id == event.id
    with pytest.raises(
        ReusableAssetLifecycleConflict,
        match="reusable_asset_lifecycle_provenance_conflict",
    ):
        invalidate_reusable_asset_from_reuse_failure(
            asset.id, "reuse-evidence-failed", reason="conflicting review reason",
            actor="different-reviewer", session_factory=factory,
        )
    assert event.evidence_ref == "reuse-evidence-failed"
    assert event.source == "reuse_failure_governance"
    assert len(list_reusable_asset_lifecycle_events(asset.id, session_factory=factory)) == 1


def test_positive_or_wrong_asset_evidence_cannot_invalidate():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    with factory() as db:
        db.add(ReuseEvidenceDB(
            id="reuse-evidence-pass", system_id="founder_ai", task_asset_id="future-task",
            execution_id="future-execution", reuse_asset_id=asset.id,
            reuse_lookup_performed=True, reuse_candidate_count=1, reuse_compatibility="PASS",
            reuse_applied=True, final_result={"status": "completed"},
        )); db.commit()
    with pytest.raises(ReusableAssetLifecycleConflict):
        invalidate_reusable_asset_from_reuse_failure(
            asset.id, "reuse-evidence-pass", reason="not negative", actor="founder",
            session_factory=factory,
        )


def test_transition_targets_exact_asset_not_similar_fingerprint_scope():
    factory = _factory(); first, second = _save_pair(factory)
    invalidate_reusable_asset(first.id, reason="retire only first", actor="founder", session_factory=factory)
    with factory() as db:
        assert db.get(ReusableAssetDB, first.id).status == INVALIDATED
        assert db.get(ReusableAssetDB, second.id).status == ACTIVE


def test_history_reader_restores_ordered_auditable_events():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    invalidate_reusable_asset(asset.id, reason="evidence reviewed", actor="founder", session_factory=factory)
    events = list_reusable_asset_lifecycle_events(asset.id, session_factory=factory)
    assert len(events) == 1 and events[0].created_at is not None
    assert events[0].reusable_asset_id == asset.id


def test_reusable_asset_and_asset_catalog_authorities_are_explicitly_independent():
    boundary = reusable_asset_governance_boundary()
    assert boundary == {
        "reusable_asset_authority": "ReusableAssetDB + reusable_asset_lifecycle",
        "capability_catalog_authority": "AssetCatalogDB + asset_lifecycle.service",
        "promotion_bridge": False,
        "selectable_states": ["active"],
    }
