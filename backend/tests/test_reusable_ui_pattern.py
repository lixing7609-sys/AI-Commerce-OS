from dataclasses import replace
from datetime import datetime, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.artifact.model import ArtifactAssetDB
from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.base import Base
from app.founder_ai.learning_extractor import extract_anchored_portal_popover_learning
from app.founder_ai.reusable_asset_service import candidate_fingerprint, save_reusable_asset
from app.founder_ai.reuse_retrieval import PASS, REJECT, assess_reuse_compatibility, inject_reuse_context, lookup_reusable_assets
from app.founder_ai.reuse_applicability import (
    infer_applicability_profile, source_file_leakage, source_module_rank,
)
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.task_package import TaskPackageBuilder
import app.founder_ai.asset_memory_center as asset_center


def _factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[ArtifactAssetDB.__table__, ReusableAssetDB.__table__, ReuseEvidenceDB.__table__])
    return sessionmaker(bind=engine, expire_on_commit=False)


def _scope(module="Founder Conversation"):
    return {"scope_source": "semantic_module", "confidence": "HIGH", "allowed_modules": [module],
            "allowed_file_patterns": ["frontend/src/sino-founder/ConversationThread.jsx"]}


def _candidate(**overrides):
    data = dict(
        task_id="task-source", execution_id="execution-source",
        goal="将更多操作弹出框改成 anchored portal popover", task_status="completed",
        task_result={"status": "completed", "verification": {"status": "PASS", "command_evidence": [{"verifier": "build", "status": "PASS"}]}},
        semantic_scope=_scope(), changed_files=["frontend/src/sino-founder/ConversationThread.jsx", "frontend/src/sino-founder/ConversationThread.test.jsx"],
        source_artifact_id="artifact-source", source_memory_ids=["memory-source"], execution_events=[{"event_name": "verification_completed"}],
    )
    data.update(overrides)
    return extract_anchored_portal_popover_learning(**data)


def test_completed_verified_task_is_eligible_for_structured_learning():
    candidate = _candidate()
    assert candidate and candidate.pattern_type == "anchored_portal_popover"
    assert candidate.asset_kind == "ui_interaction_pattern"


def test_incomplete_task_does_not_create_learning_candidate():
    assert _candidate(task_status="in_progress") is None


def test_failed_verification_does_not_create_learning_candidate():
    assert _candidate(task_result={"status": "completed", "verification": {"status": "FAIL"}}) is None


def test_test_only_patch_is_not_eligible_for_ui_learning():
    assert _candidate(changed_files=["frontend/src/sino-founder/ConversationThread.test.jsx"]) is None


def test_reusable_asset_persists_source_ids_and_payload_outside_content_ref():
    factory = _factory(); record = save_reusable_asset(_candidate(), session_factory=factory)
    with factory() as db:
        artifact = db.get(ArtifactAssetDB, record.artifact_id)
        assert record.source_task_id == "task-source" and record.source_execution_id == "execution-source"
        assert record.implementation_pattern["guidance"] and record.verification_pattern["guidance"]
        assert artifact.content_ref is None


def test_fingerprint_duplicate_reuses_one_canonical_asset():
    factory = _factory(); first = save_reusable_asset(_candidate(), session_factory=factory)
    duplicate = save_reusable_asset(replace(_candidate(), source_task_id="task-other", source_execution_id="execution-other"), session_factory=factory)
    with factory() as db:
        assert first.id == duplicate.id
        assert len(list(db.scalars(select(ReusableAssetDB)))) == 1
        assert len(db.get(ReusableAssetDB, first.id).source_evidence) == 2


def test_semantic_module_match_returns_candidate_and_persists_evidence():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    result = lookup_reusable_assets(goal="把通知菜单改成 Popover", semantic_scope=_scope(), task_id="task-current", session_factory=factory)
    assert result["reuse_applied"] is True
    assert result["reuse_context"]["reuse_asset_id"] == asset.id
    with factory() as db:
        evidence = db.scalar(select(ReuseEvidenceDB))
        assert evidence.reuse_lookup_performed and evidence.reuse_candidate_count == 1


def test_incompatible_module_is_not_returned():
    factory = _factory(); save_reusable_asset(_candidate(), session_factory=factory)
    result = lookup_reusable_assets(goal="把设置菜单改成 Popover", semantic_scope=_scope("Founder Settings / Model Center"), task_id="task-current", session_factory=factory)
    assert result["reuse_applied"] is False and result["reuse_candidate_count"] == 0


def test_invalidation_condition_rejects_full_screen_target():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    state, reason = assess_reuse_compatibility(asset=asset, goal="把菜单改成移动端全屏 Popover", semantic_scope=_scope())
    assert state == REJECT and "invalidation" in reason


def test_reuse_context_does_not_expand_allowed_scope():
    factory = _factory(); save_reusable_asset(_candidate(), session_factory=factory)
    contract = {"semantic_scope": _scope(), "implementation_scope": ["frontend/src/sino-founder/ConversationThread.jsx"]}
    result = inject_reuse_context(contract=contract, goal="把通知菜单改成 Popover", task_id="task-current", session_factory=factory)
    assert result["semantic_scope"] == contract["semantic_scope"]
    assert result["implementation_scope"] == contract["implementation_scope"]
    assert result["reuse_context"]["scope_authority"] is False


def test_reuse_context_is_advisory_and_requires_current_verification():
    factory = _factory(); save_reusable_asset(_candidate(), session_factory=factory)
    result = inject_reuse_context(contract={"semantic_scope": _scope()}, goal="把通知菜单改成 Popover", task_id="task-current", session_factory=factory)
    context = result["reuse_context"]
    assert context["advisory"] is True
    assert context["scope_authority"] is False
    assert context["risk_authority"] is False
    assert context["completion_authority"] is False
    assert "must_run_current_task_verification" in context["reuse_constraints"]
    assert context["verification_guidance"]["requires_own_evidence"] == ["scope", "targeted_tests", "build", "diff_check", "browser_or_artifact"]


def test_task_package_receives_advisory_reuse_context():
    reuse = {"advisory": True, "scope_authority": False, "reuse_asset_id": "reuse-asset-one",
             "implementation_guidance": {"guidance": ["portal to document.body"]}}
    contract = {"semantic_scope": _scope(), "implementation_scope": ["frontend/src/sino-founder/ConversationThread.jsx"],
                "reuse_context": reuse}
    draft = TaskAssetDraft(title="Popover", description="Popover", scope={"context": {}}, constraints=[], risk="low", approval_required=False)
    package = ExecutionPackage(goal="Popover", context={"standard_task_contract": contract}, task_asset=draft,
                               constraints=[], verification=["tests", "build", "browser"], commit_requirement="none")
    rendered = TaskPackageBuilder().build(package)
    evidence = next(item for item in rendered.evidence if item["source"] == "reusable_asset:reuse-asset-one")
    assert evidence["fact"] == reuse
    assert contract["semantic_scope"]["allowed_file_patterns"] == ["frontend/src/sino-founder/ConversationThread.jsx"]


def test_reuse_lookup_is_idempotent_for_same_task():
    factory = _factory(); save_reusable_asset(_candidate(), session_factory=factory)
    first = lookup_reusable_assets(goal="把通知菜单改成 Popover", semantic_scope=_scope(), task_id="task-current", session_factory=factory)
    second = lookup_reusable_assets(goal="把通知菜单改成 Popover", semantic_scope=_scope(), task_id="task-current", session_factory=factory)
    assert first["reuse_evidence_id"] == second["reuse_evidence_id"]
    with factory() as db: assert len(list(db.scalars(select(ReuseEvidenceDB)))) == 1


def test_unresolved_scope_is_not_used_for_reuse_authority():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    state, _ = assess_reuse_compatibility(asset=asset, goal="Popover", semantic_scope={"scope_source": "approval_required", "confidence": "MEDIUM", "allowed_modules": ["Founder Conversation"]})
    assert state != PASS


def test_semantic_target_must_be_resolved_before_reuse_lookup():
    factory = _factory(); save_reusable_asset(_candidate(), session_factory=factory)
    contract = {
        "semantic_scope": {
            "scope_source": "approval_required", "confidence": "MEDIUM",
            "allowed_modules": ["Founder Conversation"],
            "allowed_file_patterns": [],
        },
    }
    result = inject_reuse_context(
        contract=contract, goal="把通知菜单改成 Popover", task_id="task-unresolved",
        session_factory=factory,
    )
    assert result == contract
    with factory() as db:
        assert list(db.scalars(select(ReuseEvidenceDB))) == []


def test_reuse_evidence_contains_source_lineage_and_injection_time():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    result = lookup_reusable_assets(goal="把通知菜单改成 Popover", semantic_scope=_scope(), task_id="task-current", execution_id="execution-current", session_factory=factory)
    with factory() as db:
        evidence = db.get(ReuseEvidenceDB, result["reuse_evidence_id"])
        assert evidence.reuse_asset_id == asset.id and evidence.execution_id == "execution-current"
        assert evidence.injected_at is not None and evidence.final_result["status"] == "planning_injected"
        assert evidence.telemetry_events == ["reuse_lookup_started", "reuse_lookup_completed", "reuse_applied"]


def test_asset_memory_center_projects_reusable_asset(monkeypatch):
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    monkeypatch.setattr(asset_center, "list_founder_task_assets", lambda: [])
    monkeypatch.setattr(asset_center, "list_founder_artifacts", lambda: [])
    monkeypatch.setattr(asset_center, "list_founder_memories", lambda: [])
    monkeypatch.setattr(asset_center, "list_execution_sessions", lambda: [])
    monkeypatch.setattr(asset_center, "list_reusable_assets", lambda: [asset])
    result = asset_center.build_asset_memory_center()
    assert result["reusable_assets"][0]["reuse_asset_id"] == asset.id
    assert result["reusable_assets"][0]["pattern_type"] == "anchored_portal_popover"


def test_cross_module_pattern_is_compatible_with_decision_selected_surface():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    sidebar = _scope("Founder Sidebar / Navigation")
    state, reason = assess_reuse_compatibility(
        asset=asset, goal="点击左侧栏搜索框按钮后显示一组操作供我选择搜索范围",
        semantic_scope=sidebar, recommended_strategy="anchored_popover", risk_level="low",
    )
    assert state == PASS and "cross-module" in reason


def test_cross_module_pattern_lookup_preserves_scope_and_projects_provenance_not_source_files():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    scope = _scope("Founder Sidebar / Navigation")
    contract = {
        "semantic_scope": scope,
        "constraints": ["preserve current search behavior"],
        "decision_context": {"applicability": "APPLICABLE", "recommended_strategy": "anchored_popover"},
    }
    result = inject_reuse_context(
        contract=contract, goal="点击左侧栏搜索框按钮后显示一组操作供我选择搜索范围",
        task_id="task-cross-pattern", session_factory=factory,
    )
    context = result["reuse_context"]
    assert result["semantic_scope"] == scope
    assert context["reuse_asset_id"] == asset.id and context["cross_module_reuse"] is True
    assert context["source_semantic_module"] == "Founder Conversation"
    assert context["current_semantic_module"] == "Founder Sidebar / Navigation"
    assert context["source_file_leakage"] is False and context["scope_before"] == context["scope_after"]
    assert "production_artifacts" not in context["implementation_guidance"]
    draft = TaskAssetDraft(title="Search", description="Search", scope={"context": {}}, constraints=[], risk="low", approval_required=False)
    package = ExecutionPackage(
        goal="Search", context={"standard_task_contract": result}, task_asset=draft,
        constraints=[], verification=["tests", "build", "browser"], commit_requirement="none",
    )
    assert TaskPackageBuilder().build(package).relevant_files == []


def test_cross_module_pattern_wrong_intent_risk_and_invalidation_are_rejected():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    sidebar = _scope("Founder Sidebar / Navigation")
    cases = [
        ("调整左侧栏字号", "low"),
        ("点击左侧栏按钮后显示一组操作", "high"),
        ("点击左侧栏按钮后必须全屏多步骤编辑", "low"),
    ]
    for goal, risk in cases:
        state, _ = assess_reuse_compatibility(
            asset=asset, goal=goal, semantic_scope=sidebar,
            recommended_strategy="anchored_popover", risk_level=risk,
        )
        assert state == REJECT


def test_legacy_pattern_profile_is_inferred_without_asset_migration():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    profile = infer_applicability_profile(asset)
    assert profile["profile_version"] == "capability-1.1-legacy-inferred"
    assert profile["cross_module_allowed"] is True
    assert set(profile["supported_semantic_modules"]) == {"Founder Conversation", "Founder Sidebar / Navigation"}


def test_source_module_exact_match_is_only_a_rank_signal():
    factory = _factory(); asset = save_reusable_asset(_candidate(), session_factory=factory)
    same = _scope("Founder Conversation"); cross = _scope("Founder Sidebar / Navigation")
    assert source_module_rank(asset, same) == 1 and source_module_rank(asset, cross) == 0
    assert assess_reuse_compatibility(
        asset=asset, goal="点击按钮后显示一组操作", semantic_scope=same,
        recommended_strategy="anchored_popover",
    )[0] == PASS
    assert assess_reuse_compatibility(
        asset=asset, goal="点击按钮后显示一组操作", semantic_scope=cross,
        recommended_strategy="anchored_popover",
    )[0] == PASS


def test_deliberate_historical_source_file_leakage_is_rejected():
    scope = _scope("Founder Sidebar / Navigation")
    historical_path = "frontend/src/sino-founder/LegacySource.jsx"
    widened = {**scope, "allowed_file_patterns": [
        *scope["allowed_file_patterns"], historical_path,
    ]}
    result = source_file_leakage(
        source_files=[historical_path],
        scope_before=scope, scope_after=widened,
    )
    assert result["check"] == REJECT
    assert result["leaked_source_files"] == [historical_path]
