from fastapi.testclient import TestClient

from app.core.context.model import ConversationContextDB
from app.core.conversation.model import ConversationDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.main import app


def test_workspace_goal_reaches_execution_session_without_validation_error():
    conversation_id = None
    task_asset_id = None
    try:
        with TestClient(app) as client:
            conversation = client.post("/api/v1/conversations", json={"title": "继续推进 AI Commerce OS"})
            assert conversation.status_code == 201
            conversation_id = conversation.json()["id"]

            brain = client.post(
                f"/api/v1/founder-ai/brain/conversations/{conversation_id}/analyze",
                json={"user_goal": "继续推进 AI Commerce OS"},
            )
            assert brain.status_code == 200, brain.json()
            brain_result = brain.json()

            draft = brain_result["task_asset_draft"]
            task_asset = client.post("/api/v1/task-assets", json={
                "title": draft["title"],
                "description": draft["description"],
                "scope": draft["scope"],
                "conversation_id": conversation_id,
            })
            assert task_asset.status_code == 201, task_asset.json()
            task_asset_id = task_asset.json()["id"]

            execution_payload = {
                "task_asset_id": task_asset_id,
                "execution_package": brain_result["execution_package"],
            }
            execution = client.post("/api/v1/founder-ai/executions", json=execution_payload)
            assert execution.status_code == 200, {"payload": execution_payload, "detail": execution.json()}

        assert brain_result["goal_analysis"]
        assert brain_result["task_plan"]
        assert brain_result["recommended_action"]
        assert execution.json()["status"] == "draft"
        assert execution.json()["task_asset_id"] == task_asset_id
    finally:
        if conversation_id:
            with SessionLocal() as session:
                if task_asset_id:
                    session.query(TaskAssetDB).filter_by(id=task_asset_id).delete()
                session.query(ConversationContextDB).filter_by(conversation_id=conversation_id).delete()
                session.query(ConversationDB).filter_by(id=conversation_id).delete()
                session.commit()
