from dataclasses import replace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.artifact.model import ArtifactAssetDB
from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.base import Base
from app.founder_ai.decision_strategy_extractor import extract_interaction_surface_decision
from app.founder_ai.decision_retrieval import (
    APPLICABLE, NOT_APPLICABLE, UNCERTAIN, assess_decision_applicability,
    inject_decision_context, lookup_decision_strategies,
)
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.reusable_asset_service import candidate_fingerprint, classify_learning_candidate, save_reusable_asset, serialize_reusable_asset
from app.founder_ai.reuse_retrieval import lookup_reusable_assets
from app.founder_ai.reuse_applicability import infer_applicability_profile, source_module_rank
from app.founder_ai.task_package import TaskPackageBuilder


def _factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[ArtifactAssetDB.__table__, ReusableAssetDB.__table__, ReuseEvidenceDB.__table__])
    return sessionmaker(bind=engine, expire_on_commit=False)


def _scope(module="Founder Conversation"):
    return {"scope_source": "semantic_module", "confidence": "HIGH", "allowed_modules": [module],
            "allowed_file_patterns": ["frontend/src/sino-founder/ConversationThread.jsx"]}


def _messages():
    return [
        {"message_id": "msg-one", "role": "founder", "content": "不对，不要 Drawer。Launcher 保持原位，只把弹层改成 Popover。"},
        {"message_id": "msg-two", "role": "assistant", "content": "收到。"},
    ]


def _candidate(**overrides):
    data = dict(
        task_id="task-source", execution_id="execution-source", task_status="completed",
        verification_status="PASS", changed_files=["frontend/src/sino-founder/FounderNavigationPanel.jsx"],
        semantic_module="Founder Conversation", conversation_messages=_messages(),
        source_conversation_id="conv-source", source_artifact_id="artifact-source",
        source_memory_ids=["memory-source"], source_commit_sha="abc123",
    )
    data.update(overrides)
    return extract_interaction_surface_decision(**data)


def _save(factory=None):
    factory = factory or _factory()
    return factory, save_reusable_asset(_candidate(), session_factory=factory)


def test_verified_completed_task_with_explicit_correction_is_eligible():
    candidate = _candidate()
    assert candidate.asset_kind == "decision_strategy"
    assert candidate.pattern_type == "interaction_surface_choice"
    assert candidate.strategy_name == "anchored_overlay_choice"
    assert classify_learning_candidate(candidate) == "reusable_asset"


def test_no_decision_evidence_creates_no_strategy():
    assert _candidate(conversation_messages=[{"role": "founder", "content": "把字体改大一点"}]) is None


def test_failed_or_test_only_task_creates_no_strategy():
    assert _candidate(task_status="failed") is None
    assert _candidate(verification_status="FAIL") is None
    assert _candidate(changed_files=["frontend/src/sino-founder/FounderNavigationPanel.test.jsx"]) is None


def test_chosen_strategy_and_rejected_alternatives_are_structured():
    payload = _candidate().decision_payload
    assert payload["recommended_strategy"] == "anchored_popover"
    assert payload["alternative_strategies"] == ["drawer", "modal"]
    assert payload["rejection_conditions"]["drawer"] and payload["rejection_conditions"]["modal"]


def test_natural_language_rejection_of_full_sidebar_drawer_is_decision_evidence():
    candidate = _candidate(conversation_messages=[{
        "message_id": "msg-real", "role": "founder",
        "content": "弹出框要的是模型选择的弹出框形式，不是现在这样的充满左边栏。",
    }])
    assert candidate and candidate.decision_payload["recommended_strategy"] == "anchored_popover"


def test_source_lineage_is_persisted():
    factory, asset = _save()
    with factory() as db:
        source = db.get(ReusableAssetDB, asset.id).source_evidence[0]
        assert source["task_id"] == "task-source" and source["execution_id"] == "execution-source"
        assert source["evidence"]["conversation_id"] == "conv-source"
        assert source["evidence"]["messages"][0]["message_id"] == "msg-one"


def test_fingerprint_duplicate_keeps_one_canonical_strategy_and_dedups_source():
    factory = _factory(); first = save_reusable_asset(_candidate(), session_factory=factory)
    same = save_reusable_asset(_candidate(), session_factory=factory)
    extra = save_reusable_asset(replace(_candidate(), source_task_id="task-two", source_execution_id="execution-two"), session_factory=factory)
    with factory() as db:
        records = list(db.scalars(select(ReusableAssetDB)))
        assert first.id == same.id == extra.id and len(records) == 1
        assert len(records[0].source_evidence) == 2


def test_fingerprint_is_strategy_semantic_not_source_identity():
    assert candidate_fingerprint(_candidate()) == candidate_fingerprint(replace(
        _candidate(), source_task_id="task-other", source_execution_id="execution-other"
    ))


def test_applicable_context_returns_applicable():
    _, asset = _save()
    state, _ = assess_decision_applicability(
        asset=asset, goal="点击文件入口后显示一组操作", semantic_scope=_scope(), risk_level="low"
    )
    assert state == APPLICABLE


def test_clear_contextual_low_risk_choice_is_applicable_without_surface_name():
    factory, asset = _save()
    goal = "为左侧栏顶部新建讨论入口增加操作选择，可开始空白讨论或在当前项目中开始讨论。"
    state, _ = assess_decision_applicability(
        asset=asset, goal=goal, semantic_scope=_scope(), risk_level="low",
        constraints=["compact action set", "preserve current navigation context"],
    )
    assert state == APPLICABLE
    result = lookup_decision_strategies(
        goal=goal, semantic_scope=_scope(), task_id="task-surface-unspecified",
        constraints=["compact action set", "preserve current navigation context"],
        session_factory=factory,
    )
    context = result["decision_context"]
    assert context["recommended_strategy"] == "anchored_popover"
    assert set(context["rejected_strategies"]) >= {"drawer", "modal"}
    assert context["scope_authority"] is False and context["risk_authority"] is False
    assert context["approval_authority"] is False and context["completion_authority"] is False


def test_incompatible_context_returns_not_applicable():
    _, asset = _save()
    state, _ = assess_decision_applicability(
        asset=asset, goal="点击入口后必须全屏多步骤编辑", semantic_scope=_scope(), risk_level="low"
    )
    assert state == NOT_APPLICABLE


def test_explicit_modal_or_destructive_confirmation_is_not_applicable():
    _, asset = _save()
    for goal in ("点击入口后必须 modal 确认", "点击入口后执行 destructive 高风险确认"):
        state, _ = assess_decision_applicability(
            asset=asset, goal=goal, semantic_scope=_scope(), risk_level="low"
        )
        assert state == NOT_APPLICABLE


def test_large_multistep_editor_is_not_applicable():
    _, asset = _save()
    state, _ = assess_decision_applicability(
        asset=asset, goal="点击入口后进入大工作区进行多步骤编辑", semantic_scope=_scope(), risk_level="low"
    )
    assert state == NOT_APPLICABLE


def test_medium_risk_cannot_be_lowered_by_historical_strategy():
    _, asset = _save()
    state, _ = assess_decision_applicability(
        asset=asset, goal="点击文件入口后显示一组操作", semantic_scope=_scope(), risk_level="medium"
    )
    assert state == NOT_APPLICABLE


def test_incompatible_semantic_module_is_not_retrieved():
    factory, _ = _save()
    result = lookup_decision_strategies(
        goal="点击设置入口后显示一组操作", semantic_scope=_scope("Founder Settings / Model Center"),
        task_id="task-settings", session_factory=factory,
    )
    assert result["decision_candidate_count"] == 0 and result["decision_applied"] is False


def test_uncertain_context_is_not_auto_applied():
    _, asset = _save()
    state, _ = assess_decision_applicability(asset=asset, goal="优化体验", semantic_scope=_scope(), risk_level="low")
    assert state == UNCERTAIN


def test_unresolved_semantic_target_prevents_decision_lookup():
    factory, _ = _save()
    contract = {"semantic_scope": {"scope_source": "approval_required", "confidence": "MEDIUM", "allowed_modules": ["Founder Conversation"]}}
    assert inject_decision_context(contract=contract, goal="点击文件入口后显示一组操作", task_id="task-new", session_factory=factory) == contract
    with factory() as db: assert list(db.scalars(select(ReuseEvidenceDB))) == []


def test_decision_context_is_advisory_and_does_not_expand_scope():
    factory, _ = _save(); contract = {"semantic_scope": _scope(), "constraints": ["low risk"]}
    result = inject_decision_context(contract=contract, goal="点击文件入口后显示一组操作", task_id="task-new", session_factory=factory)
    context = result["decision_context"]
    assert result["semantic_scope"] == contract["semantic_scope"]
    assert context["scope_authority"] is False and context["risk_authority"] is False
    assert context["approval_authority"] is False and context["completion_authority"] is False


def test_decision_context_is_injected_into_task_package_separately():
    decision = {"decision_asset_id": "reuse-decision-one", "strategy_type": "interaction_surface_choice",
                "recommended_strategy": "anchored_popover", "scope_authority": False}
    contract = {"semantic_scope": _scope(), "decision_context": decision}
    draft = TaskAssetDraft(title="Surface", description="Surface", scope={"context": {}}, constraints=[], risk="low", approval_required=False)
    package = ExecutionPackage(goal="Surface", context={"standard_task_contract": contract}, task_asset=draft,
                               constraints=[], verification=["tests", "build", "browser"], commit_requirement="none")
    evidence = TaskPackageBuilder().build(package).evidence
    item = next(row for row in evidence if row["source"] == "decision_strategy:reuse-decision-one")
    assert item["fact"] == decision


def test_decision_reuse_evidence_is_persisted_with_authority_safety():
    factory, asset = _save()
    result = lookup_decision_strategies(
        goal="点击文件入口后显示一组操作", semantic_scope=_scope(), task_id="task-new",
        execution_id="execution-new", session_factory=factory,
    )
    with factory() as db:
        evidence = db.get(ReuseEvidenceDB, result["decision_evidence_id"])
        assert evidence.reuse_asset_id == asset.id and evidence.reuse_compatibility == APPLICABLE
        assert evidence.reuse_applied and evidence.injected_at is not None
        assert evidence.final_result["approval_authority"] is False
        assert evidence.final_result["source_task_ids"] == ["task-source"]


def test_decision_lookup_is_idempotent_for_same_task_and_execution():
    factory, _ = _save()
    params = dict(goal="点击文件入口后显示一组操作", semantic_scope=_scope(), task_id="task-new",
                  execution_id="execution-new", session_factory=factory)
    first = lookup_decision_strategies(**params); second = lookup_decision_strategies(**params)
    assert first["decision_evidence_id"] == second["decision_evidence_id"]
    with factory() as db: assert len(list(db.scalars(select(ReuseEvidenceDB)))) == 1


def test_pattern_and_decision_retrieval_are_separate():
    factory, _ = _save()
    pattern = lookup_reusable_assets(goal="把菜单改成 Popover", semantic_scope=_scope(), task_id="task-pattern", session_factory=factory)
    decision = lookup_decision_strategies(goal="点击文件入口后显示一组操作", semantic_scope=_scope(), task_id="task-decision", session_factory=factory)
    assert pattern["reuse_candidate_count"] == 0 and pattern["reuse_applied"] is False
    assert decision["decision_candidate_count"] == 1 and decision["decision_applied"] is True


def test_superseded_strategy_is_not_retrieved():
    factory, asset = _save()
    with factory() as db:
        record = db.get(ReusableAssetDB, asset.id); record.status = "superseded"; db.commit()
    result = lookup_decision_strategies(goal="点击文件入口后显示一组操作", semantic_scope=_scope(), task_id="task-new", session_factory=factory)
    assert result["decision_candidate_count"] == 0 and result["decision_applied"] is False


def test_asset_center_projection_exposes_strategy_name_and_source_count():
    _, asset = _save()
    projected = serialize_reusable_asset(asset)
    assert projected["asset_kind"] == "decision_strategy"
    assert projected["strategy_name"] == "anchored_overlay_choice"
    assert projected["source_count"] == 1
    assert projected["source_semantic_module"] == asset.semantic_module
    assert projected["applicability_profile"]["profile_version"] == "capability-2.1-legacy-inferred"


def test_decision_strategy_requires_independent_verification_guidance():
    _, asset = _save()
    assert asset.verification_pattern["requires_own_evidence"] == ["scope", "targeted_tests", "build", "diff_check", "browser_or_artifact"]


def test_cross_module_conversation_task_can_apply_sidebar_decision_strategy():
    factory = _factory()
    asset = save_reusable_asset(_candidate(semantic_module="Founder Sidebar / Navigation"), session_factory=factory)
    state, reason = assess_decision_applicability(
        asset=asset,
        goal="点击 Conversation 输入框底部的＋文件/文档按钮后显示一组操作",
        semantic_scope=_scope("Founder Conversation"), risk_level="low",
    )
    assert state == APPLICABLE and "cross-module" in reason


def test_cross_module_decision_lookup_persists_provenance_and_preserves_scope():
    factory = _factory()
    asset = save_reusable_asset(_candidate(semantic_module="Founder Sidebar / Navigation"), session_factory=factory)
    scope = _scope("Founder Conversation")
    contract = {"semantic_scope": scope, "constraints": ["必须保留发送逻辑"]}
    result = inject_decision_context(
        contract=contract,
        goal="点击 Conversation 输入框底部的＋文件/文档按钮后显示一组操作",
        task_id="task-cross-decision", risk_level="low", session_factory=factory,
    )
    context = result["decision_context"]
    assert result["semantic_scope"] == scope and context["decision_asset_id"] == asset.id
    assert context["source_semantic_module"] == "Founder Sidebar / Navigation"
    assert context["current_semantic_module"] == "Founder Conversation"
    assert context["cross_module_reuse"] is True
    assert context["scope_before"] == context["scope_after"]


def test_cross_module_decision_rejects_wrong_intent_and_protected_contexts():
    factory = _factory()
    asset = save_reusable_asset(_candidate(semantic_module="Founder Sidebar / Navigation"), session_factory=factory)
    assert assess_decision_applicability(
        asset=asset, goal="调整 Conversation 输入框字号",
        semantic_scope=_scope("Founder Conversation"), risk_level="low",
    )[0] == NOT_APPLICABLE
    assert assess_decision_applicability(
        asset=asset, goal="点击 Conversation 输入框按钮后执行 destructive 高风险确认",
        semantic_scope=_scope("Founder Conversation"), risk_level="low",
    )[0] == NOT_APPLICABLE
    assert assess_decision_applicability(
        asset=asset, goal="优化体验",
        semantic_scope=_scope("Founder Conversation"), risk_level="low",
    )[0] == UNCERTAIN


def test_legacy_decision_profile_is_inferred_without_asset_migration():
    factory = _factory()
    asset = save_reusable_asset(_candidate(semantic_module="Founder Sidebar / Navigation"), session_factory=factory)
    profile = infer_applicability_profile(asset)
    assert profile["profile_version"] == "capability-2.1-legacy-inferred"
    assert profile["cross_module_allowed"] is True
    assert "Founder Conversation" in profile["supported_semantic_modules"]


def test_decision_source_module_exact_match_is_only_a_rank_signal():
    factory = _factory()
    asset = save_reusable_asset(_candidate(semantic_module="Founder Sidebar / Navigation"), session_factory=factory)
    sidebar = _scope("Founder Sidebar / Navigation"); conversation = _scope("Founder Conversation")
    assert source_module_rank(asset, sidebar) == 1 and source_module_rank(asset, conversation) == 0
    for scope in (sidebar, conversation):
        assert assess_decision_applicability(
            asset=asset, goal="点击按钮后显示一组操作", semantic_scope=scope, risk_level="low",
        )[0] == APPLICABLE
