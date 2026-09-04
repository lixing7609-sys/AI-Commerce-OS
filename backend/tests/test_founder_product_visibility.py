from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.asset_lifecycle import service as asset_service
from app.core.conversation.model import ConversationDB
from app.core.conversation import service as conversation_service
from app.core.product_visibility.model import FounderProductVisibilityDB


def _database(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(asset_service, "SessionLocal", factory)
    return factory


def _hide(session, entity_type, entity_id):
    session.add(FounderProductVisibilityDB(
        id=f"visibility-{entity_type}-{entity_id}", entity_type=entity_type,
        entity_id=entity_id, hidden=True, reason="targeted test",
    ))


def test_product_visibility_hides_conversation_without_mutating_it(monkeypatch):
    factory = _database(monkeypatch)
    with factory() as session:
        visible = ConversationDB(id="conversation-visible", system_id="founder_ai", title="商品详情页")
        hidden = ConversationDB(id="conversation-hidden", system_id="founder_ai", title="Goal acceptance test")
        session.add_all([visible, hidden])
        _hide(session, "conversation", hidden.id)
        session.commit()
        visible_id, hidden_id = visible.id, hidden.id

    assert [item.id for item in conversation_service.list_conversations()] == [visible_id]
    with factory() as session:
        persisted = session.get(ConversationDB, hidden_id)
        assert persisted is not None
        assert persisted.status == "active"


def test_repository_visibility_preserves_ready_lifecycle_evidence(monkeypatch):
    factory = _database(monkeypatch)
    development = {"development_run_id": "development-protected", "status": "completed"}
    test_run = {"test_run_id": "test-protected", "status": "passed"}
    approval = {"approved_by": "founder", "test_run_id": "test-protected"}
    references = [{"reference_id": "reference-protected"}]
    with factory() as session:
        ready = AssetCatalogDB(
            id="skill-ready", asset_type="skill", native_type="founder_object", native_id="skill-ready",
            name="商品分镜生成 Skill", status="ready", domain_id="commerce", version=1,
            development_run_refs=[development], test_run_refs=[test_run], ready_approval=approval,
            used_by_refs=references, reference_count=2,
        )
        stale = AssetCatalogDB(
            id="agent-stale", asset_type="agent", native_type="founder_object", native_id="agent-stale",
            name="旧实验 Agent", status="testing", domain_id="commerce", version=1,
        )
        session.add_all([ready, stale])
        _hide(session, "asset", stale.id)
        session.commit()
        ready_id, stale_id = ready.id, stale.id

    visible = asset_service.list_assets(include_legacy=False, domain_id="commerce")
    assert [item["asset_id"] for item in visible] == [ready_id]
    assert visible[0]["status"] == "ready"
    assert visible[0]["development_run_refs"] == [development]
    assert visible[0]["test_run_refs"] == [test_run]
    assert visible[0]["ready_approval"] == approval
    assert visible[0]["used_by_refs"] == references
    assert visible[0]["reference_count"] == 2
    with factory() as session:
        persisted = session.scalar(select(AssetCatalogDB).where(AssetCatalogDB.id == stale_id))
        assert persisted.status == "testing"
