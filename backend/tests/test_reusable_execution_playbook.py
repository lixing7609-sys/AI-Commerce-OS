from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.artifact.model import ArtifactAssetDB
from app.core.reusable_asset.model import ReusableAssetDB, ReuseEvidenceDB
from app.database.base import Base
from app.founder_ai.decision_retrieval import inject_decision_context
from app.founder_ai.decision_strategy_extractor import extract_interaction_surface_decision
from app.founder_ai.learning_extractor import extract_anchored_portal_popover_learning
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.playbook_composer import PASS, REJECT, UNCERTAIN, compose_execution_playbook
from app.founder_ai.reusable_asset_service import save_reusable_asset
from app.founder_ai.reuse_retrieval import inject_reuse_context
from app.founder_ai.task_package import TaskPackageBuilder


def _factory():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[
        ArtifactAssetDB.__table__, ReusableAssetDB.__table__, ReuseEvidenceDB.__table__,
    ])
    return sessionmaker(bind=engine, expire_on_commit=False)


def _scope(module="Founder Conversation"):
    file_name = (
        "frontend/src/sino-founder/FounderNavigationPanel.jsx"
        if module == "Founder Sidebar / Navigation"
        else "frontend/src/sino-founder/ConversationWorkspace.jsx"
    )
    return {
        "scope_source": "semantic_module", "confidence": "HIGH",
        "allowed_modules": [module], "allowed_file_patterns": [file_name],
    }


def _seed(factory, *, decision_module="Founder Conversation", pattern_module="Founder Conversation"):
    decision = extract_interaction_surface_decision(
        task_id="decision-source", execution_id="decision-execution", task_status="completed",
        verification_status="PASS", changed_files=["frontend/src/sino-founder/ConversationWorkspace.jsx"],
        semantic_module=decision_module, source_conversation_id="decision-conversation",
        source_commit_sha="decision-commit", conversation_messages=[{
            "message_id": "decision-message", "role": "founder",
            "content": "不要 Drawer，保留入口，只把弹层改成 Popover。",
        }],
    )
    pattern = extract_anchored_portal_popover_learning(
        task_id="pattern-source", execution_id="pattern-execution",
        goal="将更多操作弹出框改成 anchored portal popover", task_status="completed",
        task_result={"status": "completed", "verification": {"status": "PASS"}},
        semantic_scope=_scope(pattern_module), changed_files=["frontend/src/sino-founder/ConversationThread.jsx"],
        source_commit_sha="pattern-commit", execution_events=[{"event_name": "verification_completed"}],
    )
    return save_reusable_asset(decision, session_factory=factory), save_reusable_asset(pattern, session_factory=factory)


def _contract(factory, *, task_id="task-current", goal="点击通知入口后展示一组操作",
              module="Founder Conversation"):
    contract = {
        "task_id": task_id, "target_component": module,
        "semantic_scope": _scope(module), "constraints": ["semantic_module_only"],
        "acceptance_criteria": ["保留现有行为", "真实浏览器交互验证通过"],
    }
    contract = inject_decision_context(
        contract=contract, goal=goal, task_id=task_id, risk_level="low", session_factory=factory,
    )
    return inject_reuse_context(contract=contract, goal=goal, task_id=task_id, session_factory=factory)


def _compose(factory, **kwargs):
    goal = kwargs.pop("goal", "点击通知入口后展示一组操作")
    contract = kwargs.pop("contract", None)
    if contract is None:
        contract = _contract(factory, goal=goal)
    return compose_execution_playbook(
        contract=contract, task_id=contract["task_id"], goal=goal, risk="low",
        session_factory=factory, created_at="2026-08-28T00:00:00+00:00",
        runtime_revision_value="test-runtime", **kwargs,
    )


def test_decision_then_compatible_pattern_composes_ui_playbook():
    factory = _factory(); decision, pattern = _seed(factory)
    contract = _contract(factory)
    assert contract["decision_context"]["decision_asset_id"] == decision.id
    assert contract["reuse_context"]["reuse_asset_id"] == pattern.id
    playbook = _compose(factory, contract=contract)["playbook_context"]
    assert playbook["playbook_type"] == "ui_interaction_change"
    assert playbook["composed"] and playbook["applied"] and playbook["safety_gate"] == PASS
    assert playbook["decision_asset_ids"] == [decision.id]
    assert playbook["pattern_asset_ids"] == [pattern.id]


def test_decision_recommendation_enables_pattern_without_surface_name():
    factory = _factory(); _seed(factory)
    contract = _contract(factory, goal="点击通知入口后展示一组操作")
    assert contract["decision_context"]["recommended_strategy"] == "anchored_popover"
    assert contract["reuse_context"]["compatibility"] == PASS


def test_pattern_cannot_decide_interaction_surface():
    factory = _factory(); _seed(factory)
    contract = {"task_id": "pattern-only", "target_component": "Founder Conversation", "semantic_scope": _scope()}
    result = inject_reuse_context(contract=contract, goal="优化通知入口体验", task_id="pattern-only", session_factory=factory)
    assert "decision_context" not in result
    assert "reuse_context" not in result


def test_constraint_priority_is_current_authority_before_history():
    factory = _factory(); _seed(factory)
    playbook = _compose(factory, founder_constraints=["必须保留现有通知逻辑"])["playbook_context"]
    priorities = [item["priority"] for item in playbook["authoritative_constraints"]]
    assert priorities == sorted(priorities)
    assert any(item["priority"] == "P2" for item in playbook["authoritative_constraints"])
    assert all(item["priority"] in {"P6", "P7"} for item in playbook["advisory_constraints"])
    assert all(item["sources"] for item in [*playbook["authoritative_constraints"], *playbook["advisory_constraints"]])


def test_founder_conflict_rejects_historical_asset_and_records_reason():
    factory = _factory(); decision, _ = _seed(factory)
    playbook = _compose(factory, founder_constraints=["不要浮层，直接内联展开"])["playbook_context"]
    assert playbook["safety_gate"] == REJECT and playbook["applied"] is False
    rejected = next(item for item in playbook["rejected_assets"] if item["asset_id"] == decision.id)
    assert rejected["stage"] == "playbook_safety_gate" and rejected["reason"]


def test_verification_merge_is_additive_and_never_removes_required_evidence():
    factory = _factory(); _seed(factory)
    playbook = _compose(factory)["playbook_context"]
    assert set(playbook["required_evidence"]) >= {"scope", "targeted_tests", "build", "diff_check", "browser_or_artifact"}
    assert playbook["verification_guidance"]["current_acceptance"]
    assert "cannot remove" in playbook["verification_guidance"]["merge_rule"]


def test_playbook_preserves_scope_risk_and_all_authorities_are_false():
    factory = _factory(); _seed(factory); contract = _contract(factory)
    result = _compose(factory, contract=contract)
    assert result["semantic_scope"] == contract["semantic_scope"]
    playbook = result["playbook_context"]
    for key in ("scope_authority", "risk_authority", "approval_authority", "completion_authority", "verification_override_authority"):
        assert playbook[key] is False
    assert all(playbook["safety_checks"].values())


def test_incomplete_compatibility_is_uncertain_and_not_applied():
    factory = _factory(); _seed(factory); contract = _contract(factory)
    contract.pop("reuse_context")
    playbook = _compose(factory, contract=contract)["playbook_context"]
    assert playbook["safety_gate"] == UNCERTAIN and playbook["applied"] is False


def test_playbook_identity_and_fingerprint_are_stable_on_retry():
    factory = _factory(); _seed(factory); contract = _contract(factory)
    first = _compose(factory, contract=contract)["playbook_context"]
    second = _compose(factory, contract=contract)["playbook_context"]
    assert first["playbook_id"] == second["playbook_id"]
    assert first["composition_fingerprint"] == second["composition_fingerprint"]


def test_playbook_evidence_is_persisted_idempotently_without_new_table():
    factory = _factory(); _seed(factory); contract = _contract(factory)
    result = _compose(factory, contract=contract)
    _compose(factory, contract=contract)
    evidence_id = result["decision_lookup"]["decision_evidence_id"]
    with factory() as db:
        evidence = db.get(ReuseEvidenceDB, evidence_id)
        assert evidence.final_result["playbook_evidence"]["playbook_applied"] is True
        assert evidence.telemetry_events.count("playbook_composed") == 1
        assert len(list(db.scalars(select(ReuseEvidenceDB)))) == 2


def test_cycle_guard_rejects_recursive_lineage_and_persists_rejection():
    factory = _factory(); _seed(factory); contract = _contract(factory)
    source_task = contract["decision_context"]["source_lineage"][0]["task_id"]
    playbook = _compose(factory, contract=contract, ancestor_lineage_ids=[source_task])["playbook_context"]
    assert playbook["safety_gate"] == REJECT
    assert any(item["conflict_type"] == "recursive_lineage" for item in playbook["conflicts"])
    with factory() as db:
        evidence = db.get(ReuseEvidenceDB, contract["decision_lookup"]["decision_evidence_id"])
        assert evidence.final_result["playbook_evidence"]["safety_gate"] == REJECT


def test_source_lineage_references_both_assets_and_their_sources():
    factory = _factory(); decision, pattern = _seed(factory)
    lineage = _compose(factory)["playbook_context"]["source_lineage"]
    assert {item["asset_id"] for item in lineage} == {decision.id, pattern.id}
    assert {"decision-source", "pattern-source"} <= {task for item in lineage for task in item["source_task_ids"]}


def test_task_package_receives_structured_playbook_context():
    factory = _factory(); _seed(factory); contract = _compose(factory)
    draft = TaskAssetDraft(title="Interaction", description="Interaction", scope={"context": {}}, constraints=[], risk="low", approval_required=False)
    package = ExecutionPackage(
        goal="Interaction", context={"standard_task_contract": contract}, task_asset=draft,
        constraints=[], verification=["tests", "build", "browser"], commit_requirement="none",
    )
    evidence = TaskPackageBuilder().build(package).evidence
    item = next(row for row in evidence if row["source"].startswith("execution_playbook:"))
    assert item["fact"]["playbook_id"] == contract["playbook_context"]["playbook_id"]
    assert item["fact"]["verification_override_authority"] is False


def test_current_task_still_requires_independent_frozen_verification():
    factory = _factory(); _seed(factory)
    playbook = _compose(factory)["playbook_context"]
    assert playbook["verification_guidance"]["frozen_required"]
    assert playbook["completion_authority"] is False
    assert playbook["verification_override_authority"] is False


def test_conversation_task_composes_cross_module_decision_with_same_module_pattern():
    factory = _factory()
    decision, pattern = _seed(factory, decision_module="Founder Sidebar / Navigation")
    goal = "点击 Conversation 输入框底部的＋文件/文档按钮后显示一组操作：上传文件、选择已有文档"
    contract = _contract(factory, task_id="task-file-docs", goal=goal, module="Founder Conversation")
    playbook = _compose(
        factory, contract=contract, goal=goal,
        founder_constraints=["必须保留图片入口和发送逻辑", "不要在选择前上传或创建数据"],
    )["playbook_context"]
    assert contract["decision_context"]["decision_asset_id"] == decision.id
    assert contract["decision_context"]["cross_module_reuse"] is True
    assert contract["reuse_context"]["reuse_asset_id"] == pattern.id
    assert contract["reuse_context"]["cross_module_reuse"] is False
    assert playbook["safety_gate"] == PASS and playbook["applied"] is True
    assert playbook["cross_module_reuse"] is True
    assert playbook["source_file_leakage_check"] == PASS
    assert all(playbook["safety_checks"].values())


def test_sidebar_task_composes_same_module_decision_with_cross_module_pattern():
    factory = _factory()
    decision, pattern = _seed(factory, decision_module="Founder Sidebar / Navigation")
    goal = "点击左侧栏搜索框按钮后显示一组操作供我选择搜索范围"
    contract = _contract(factory, task_id="task-search", goal=goal, module="Founder Sidebar / Navigation")
    playbook = _compose(factory, contract=contract, goal=goal)["playbook_context"]
    assert contract["decision_context"]["decision_asset_id"] == decision.id
    assert contract["reuse_context"]["reuse_asset_id"] == pattern.id
    assert contract["reuse_context"]["cross_module_reuse"] is True
    assert playbook["safety_gate"] == PASS and playbook["applied"] is True
    assert playbook["current_semantic_module"] == "Founder Sidebar / Navigation"


def test_playbook_rejects_deliberate_historical_source_file_leakage():
    factory = _factory(); _seed(factory); contract = _contract(factory)
    contract["reuse_context"] = {
        **contract["reuse_context"],
        "source_file_leakage": True,
        "source_file_leakage_check": REJECT,
    }
    playbook = _compose(factory, contract=contract)["playbook_context"]
    assert playbook["safety_gate"] == REJECT and playbook["applied"] is False
    assert playbook["source_file_leakage_check"] == REJECT
    assert any(item["conflict_type"] == "historical_source_file_leakage" for item in playbook["conflicts"])


def test_cross_module_playbook_evidence_persists_provenance_and_applicability():
    factory = _factory(); _seed(factory, decision_module="Founder Sidebar / Navigation")
    goal = "点击 Conversation 输入框底部的＋文件/文档按钮后显示一组操作：上传文件、选择已有文档"
    contract = _contract(factory, task_id="task-cross-evidence", goal=goal)
    result = _compose(factory, contract=contract, goal=goal)
    with factory() as db:
        evidence = db.get(ReuseEvidenceDB, result["decision_lookup"]["decision_evidence_id"])
        playbook = evidence.final_result["playbook_evidence"]
        assert playbook["cross_module_reuse"] is True
        assert playbook["current_semantic_module"] == "Founder Conversation"
        assert playbook["source_file_leakage_check"] == PASS
        assert len(playbook["applicability_domains"]) == 2
