from fastapi.testclient import TestClient

from app.core.context.model import ConversationContextDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB
from app.database.db import SessionLocal
from app.main import app
from app.studio_ai import service


def test_image_capability_lookup_does_not_treat_storyboard_as_image_generation(monkeypatch):
    monkeypatch.setattr(service, "lookup_image_generation_compatibility", lambda: {"status": "CAPABILITY_MISSING", "selected": None, "related_but_incompatible": [{"asset_id": "skill-storyboard", "classification": "RELATED_BUT_INCOMPATIBLE"}]})
    result = service.lookup_image_capability()
    assert result["status"] == "capability_missing"
    assert result["temporary_binding"] is None


def test_image_capability_lookup_accepts_only_explicit_ready_image_generation_asset(monkeypatch):
    monkeypatch.setattr(service, "lookup_image_generation_compatibility", lambda: {"status": "EXACT_REUSE", "selected": {"asset_id": "cap-image", "name": "商品主图生成", "status": "ready"}})
    result = service.lookup_image_capability()
    assert result["status"] == "available"
    assert result["capability"]["asset_id"] == "cap-image"


def test_model_lookup_requires_verified_generation_capability_not_model_name(monkeypatch):
    monkeypatch.setattr(service, "get_model_center", lambda: {"models": [{"provider_id": "provider", "model_id": "image-model", "supports_text": True, "supports_image_generation": False, "enabled": True}]})
    assert service.lookup_image_generation_model()["status"] == "model_missing"


def test_model_lookup_uses_verified_image_generation_metadata(monkeypatch):
    monkeypatch.setattr(service, "get_model_center", lambda: {"models": [{"provider_id": "provider", "model_id": "model", "supports_text": True, "supports_image_generation": True, "enabled": True}]})
    result = service.lookup_image_generation_model()
    assert result == {"status": "available", "model": {"provider_id": "provider", "model_id": "model"}}


def test_real_studio_conversation_is_isolated_and_stops_at_missing_capability(monkeypatch):
    monkeypatch.setattr(service, "lookup_image_generation_compatibility", lambda: {"status": "CAPABILITY_MISSING", "selected": None, "related_but_incompatible": []})
    monkeypatch.setattr(service, "get_model_center", lambda: {"models": []})
    conversation_id = None
    try:
        with TestClient(app) as client:
            created = client.post("/api/v1/studio-ai/conversations", json={"title": "商品主图验证"})
            assert created.status_code == 201
            conversation_id = created.json()["conversation_id"]
            assert created.json()["system_id"] == "studio_ai"

            response = client.post(f"/api/v1/studio-ai/conversations/{conversation_id}/messages", json={"content": "生成一张商品主图"})
            assert response.status_code == 200
            snapshot = response.json()
            assert snapshot["task"]["status"] == "capability_missing"
            assert snapshot["task"]["execution_status"] == "not_started"
            assert snapshot["task"]["asset"] is None
            assert [item["role"] for item in snapshot["messages"]] == ["founder", "assistant"]
            assert all(message["conversation_id"] == conversation_id for message in _stored_messages(conversation_id))

            founder = client.get("/api/v1/conversations")
            assert founder.status_code == 200
            founder_ids = {item.get("conversation_id") or item.get("id") for item in founder.json()}
            assert conversation_id not in founder_ids
    finally:
        if conversation_id:
            with SessionLocal() as session:
                session.query(ConversationMessageDB).filter_by(conversation_id=conversation_id).delete()
                session.query(ConversationContextDB).filter_by(conversation_id=conversation_id).delete()
                session.query(ConversationDB).filter_by(id=conversation_id).delete()
                session.commit()


def _stored_messages(conversation_id):
    with SessionLocal() as session:
        return [{"conversation_id": item.conversation_id} for item in session.query(ConversationMessageDB).filter_by(conversation_id=conversation_id).all()]
