from types import SimpleNamespace
import pytest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.asset_lifecycle.model import AssetCatalogDB, AssetLearningDB
from app.core.conversation.model import ConversationDB
from app.core.reference.model import IntelligenceReferenceDB
from app.core.asset_lifecycle import service as lifecycle


def _factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(lifecycle, "SessionLocal", factory)
    return factory


def _asset(factory, conversation_id=None, status="committed", domain_id="general"):
    with factory() as session:
        item = lifecycle.upsert_catalog_record(
            session, asset_id="asset-skill", asset_type="skill", native_type="founder_object", native_id="asset-skill",
            name="AI 短剧 Skill", purpose="生成可复用短剧能力", content={"logic": "真实资产内容"}, status=status, version=1,
            source_conversation_id=conversation_id, source_package_id="package-short-drama", project_id=None,
            domain_id=domain_id,
        )
        session.commit()
        return item.id


def test_catalog_keeps_native_identity_and_excludes_execution_result(monkeypatch):
    factory = _factory(monkeypatch)
    _asset(factory)
    with factory() as session:
        lifecycle.upsert_catalog_record(session, asset_id="legacy-artifact", asset_type="legacy", native_type="artifact", native_id="legacy-artifact", name="历史文档", purpose="兼容", content={}, status="committed", version=1, source_conversation_id=None, source_package_id=None, project_id=None, legacy_category="document")
        session.commit()
    official = lifecycle.list_assets(include_legacy=False)
    assert [item["asset_id"] for item in official] == ["asset-skill"]
    assert official[0]["native_id"] == "asset-skill"


def test_asset_execution_is_idempotent_and_learning_refs_result(monkeypatch):
    factory = _factory(monkeypatch)
    _asset(factory)
    task = SimpleNamespace(id="task-1", title="执行 AI 短剧 Skill", description="执行")
    execution = SimpleNamespace(id="execution-1", status="completed", created_at="2026-08-14T00:00:00+00:00", result={"exit_code": 0, "tests": ["pass"]}, error_message=None, failure_reason=None)
    monkeypatch.setattr(lifecycle, "create_task_asset", lambda **_: task)
    monkeypatch.setattr(lifecycle, "build_execution_package", lambda draft: {"draft": draft.title})
    monkeypatch.setattr(lifecycle, "create_execution_session", lambda *_: execution)
    monkeypatch.setattr(lifecycle, "get_execution_session", lambda _: (execution, SimpleNamespace(task_asset=SimpleNamespace(conversation_id=None))))
    first = lifecycle.create_asset_execution("asset-skill")
    second = lifecycle.create_asset_execution("asset-skill")
    assert first["execution_id"] == second["execution_id"] == "execution-1"
    learning = lifecycle.create_learning("execution-1")
    assert learning["outcome"] == "no_update"
    with factory() as session:
        assert session.scalar(select(AssetLearningDB)).asset_id == "asset-skill"


def test_reuse_creates_reference_once(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as session:
        conversation = ConversationDB(system_id="founder_ai", title="AI 广告短片")
        session.add(conversation); session.commit(); conversation_id = conversation.id
    _asset(factory, conversation_id, status="ready")
    first = lifecycle.reuse_asset("asset-skill", target_type="conversation", target_id=conversation_id)
    second = lifecycle.reuse_asset("asset-skill", target_type="conversation", target_id=conversation_id)
    assert first["reference_id"] == second["reference_id"]
    with factory() as session:
        assert len(list(session.scalars(select(IntelligenceReferenceDB)))) == 1
        assert session.get(AssetCatalogDB, "asset-skill").reference_count == 1


def test_commerce_conversation_discovers_ready_asset_before_reuse(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as session:
        conversation = ConversationDB(system_id="founder_ai", title="抖音商品带货短视频")
        session.add(conversation); session.commit(); conversation_id = conversation.id
    _asset(factory, conversation_id, status="ready", domain_id="commerce")
    suggestions = lifecycle.suggest_reuse(conversation_id)
    assert suggestions[0]["asset_id"] == "asset-skill"
    assert suggestions[0]["can_reuse"] is True
    assert suggestions[0]["domain_id"] == "commerce"


def test_skill_golden_path_requires_real_test_and_founder_ready_approval(monkeypatch):
    factory = _factory(monkeypatch)
    _asset(factory, status="candidate", domain_id="commerce")
    monkeypatch.setattr(lifecycle, "create_task_asset", lambda **_: SimpleNamespace(id="task-development-1"))
    developing = lifecycle.start_development("asset-skill")
    assert developing["status"] == "developing"
    assert developing["development_run_refs"][0]["status"] == "developing"
    assert developing["development_run_refs"][0]["task_asset_id"] == "task-development-1"
    testing = lifecycle.complete_development("asset-skill")
    assert testing["status"] == "testing"
    assert testing["content"]["runtime_spec"]["implementation"] == "commerce_storyboard_v1"
    with pytest.raises(ValueError):
        lifecycle.approve_ready("asset-skill")
    test = lifecycle.run_capability_test("asset-skill")
    assert test["status"] == "passed"
    assert test["actual"]["shots"][0]["sequence"] == 1
    ready = lifecycle.approve_ready("asset-skill")
    assert ready["status"] == "ready"
    assert ready["ready_approval"]["test_run_id"] == test["test_run_id"]
