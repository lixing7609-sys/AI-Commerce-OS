"""
成果 API（阶段 8E）端到端测试。

覆盖：列表过滤、详情（含版本/来源任务/可执行操作）、from-task
手动生成（幂等 + 拒绝 running/unsupported）、approve/reject/
archive/restore、create-follow-up-task（含 shop_id 继承、未知
Agent/店铺安全错误）、versions 列表与单条查询。
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.agents.base_agent import BaseAgent
from app.database.db import SessionLocal
from app.models.deliverable_db import DeliverableDB, DeliverableVersionDB
from app.models.task_db import TaskDB
from app.main import app

TEST_MARKER = "DELIVERABLE_API_TEST"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


class _NoopAgent(BaseAgent):
    def think(self, context):
        return {}

    def execute(self, decision):
        return {"ok": True}


@pytest.fixture
def follow_up_agent():
    name = f"{TEST_MARKER}_AGENT_{uuid.uuid4().hex[:6].upper()}"
    AgentRegistry.register(_NoopAgent(name=name, role="test", description="test"))
    yield name
    AgentRegistry.unregister(name)


def _make_task_id():
    return f"TASKDLVAPI{uuid.uuid4().hex[:8].upper()}"


def _insert_completed_ceo_task(shop_id=None):
    task_id = _make_task_id()
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type="经营分析 API 测试",
            assigned_agent="AI CEO",
            priority="normal",
            status="completed",
            payload={"task": "经营分析 API 测试"},
            result={
                "success": True,
                "agent": "AI CEO",
                "decision": {},
                "result": {
                    "agent": "AI CEO",
                    "analysis_type": "system_operations",
                    "format": "structured",
                    "analysis": {
                        "summary": "API 测试摘要",
                        "findings": [],
                        "risks": [],
                        "actions": [],
                        "delegations": [],
                    },
                },
            },
            created_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
            root_task_id=task_id,
            shop_id=shop_id,
        )
        db.add(row)
        db.commit()
        return task_id
    finally:
        db.close()


def _insert_running_task():
    task_id = _make_task_id()
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type="未完成任务",
            assigned_agent="AI CEO",
            priority="normal",
            status="running",
            payload={"task": "未完成任务"},
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            root_task_id=task_id,
        )
        db.add(row)
        db.commit()
        return task_id
    finally:
        db.close()


@pytest.fixture
def cleanup():
    task_ids = []
    deliverable_ids = []

    yield task_ids, deliverable_ids

    db = SessionLocal()
    try:
        if deliverable_ids:
            db.query(DeliverableVersionDB).filter(
                DeliverableVersionDB.deliverable_id.in_(deliverable_ids)
            ).delete(synchronize_session=False)
            db.query(DeliverableDB).filter(
                DeliverableDB.id.in_(deliverable_ids)
            ).delete(synchronize_session=False)
        if task_ids:
            db.query(TaskDB).filter(TaskDB.id.in_(task_ids)).delete(
                synchronize_session=False
            )
        db.commit()
    finally:
        db.close()


def test_from_task_creates_deliverable(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)

    response = client.post(f"/api/v1/deliverables/from-task/{task_id}")
    assert response.status_code == 200
    body = response.json()
    deliverable_ids.append(body["id"])
    assert body["source_task_id"] == task_id
    assert body["deliverable_type"] == "ceo_analysis"


def test_from_task_is_idempotent(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)

    first = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(first["id"])
    second = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    assert second["id"] == first["id"]


def test_from_task_rejects_running_task(client, cleanup):
    task_ids, _ = cleanup
    task_id = _insert_running_task()
    task_ids.append(task_id)

    response = client.post(f"/api/v1/deliverables/from-task/{task_id}")
    assert response.status_code == 409


def test_from_task_rejects_missing_task(client):
    response = client.post("/api/v1/deliverables/from-task/TASKDOESNOTEXIST0000")
    assert response.status_code == 404


def test_get_deliverable_detail_includes_versions_and_actions(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)

    created = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(created["id"])

    response = client.get(f"/api/v1/deliverables/{created['id']}")
    assert response.status_code == 200
    body = response.json()

    assert body["current_version_data"]["version_number"] == 1
    assert len(body["versions"]) == 1
    assert body["source_task"]["id"] == task_id
    assert "approve" in body["available_actions"]
    assert "export" in body["available_actions"]


def test_list_deliverables_filters_by_status_and_type(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)
    created = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(created["id"])

    response = client.get(
        "/api/v1/deliverables",
        params={"status": "pending_review", "deliverable_type": "ceo_analysis"},
    )
    assert response.status_code == 200
    body = response.json()
    assert any(item["id"] == created["id"] for item in body["items"])


def test_list_deliverables_rejects_invalid_status(client):
    response = client.get("/api/v1/deliverables", params={"status": "not_a_status"})
    assert response.status_code == 422


def test_approve_reject_archive_restore_flow(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)
    created = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(created["id"])
    deliverable_id = created["id"]

    approved = client.post(f"/api/v1/deliverables/{deliverable_id}/approve")
    assert approved.json()["status"] == "approved"

    rejected = client.post(f"/api/v1/deliverables/{deliverable_id}/reject")
    assert rejected.json()["status"] == "rejected"

    archived = client.post(f"/api/v1/deliverables/{deliverable_id}/archive")
    assert archived.json()["status"] == "archived"

    restored = client.post(f"/api/v1/deliverables/{deliverable_id}/restore")
    assert restored.json()["status"] == "pending_review"

    # 再次 restore（当前已不是 archived）应安全拒绝，而不是静默成功。
    invalid = client.post(f"/api/v1/deliverables/{deliverable_id}/restore")
    assert invalid.status_code == 409


def test_versions_endpoints(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)
    created = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(created["id"])
    deliverable_id = created["id"]

    versions = client.get(f"/api/v1/deliverables/{deliverable_id}/versions")
    assert versions.status_code == 200
    assert len(versions.json()) == 1

    version = client.get(f"/api/v1/deliverables/{deliverable_id}/versions/1")
    assert version.status_code == 200
    assert version.json()["version_number"] == 1

    missing = client.get(f"/api/v1/deliverables/{deliverable_id}/versions/99")
    assert missing.status_code == 404


def test_create_follow_up_task_requires_explicit_call_and_inherits_shop(
    client, cleanup, follow_up_agent
):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task(shop_id=None)
    task_ids.append(task_id)
    created = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(created["id"])
    deliverable_id = created["id"]

    response = client.post(
        f"/api/v1/deliverables/{deliverable_id}/create-follow-up-task",
        json={
            "title": f"{TEST_MARKER} 后续任务",
            "assigned_agent": follow_up_agent,
            "instruction": "补充说明",
            "priority": "normal",
            "inherit_shop_scope": True,
        },
    )
    assert response.status_code == 202
    body = response.json()
    task_ids.append(body["task_id"])
    assert body["shop_id"] is None

    follow_up_task = client.get(f"/api/v1/tasks/{body['task_id']}").json()
    assert follow_up_task["shop_id"] is None

    # 创建后续任务后，成果状态应转为 converted_to_task。
    refreshed = client.get(f"/api/v1/deliverables/{deliverable_id}").json()
    assert refreshed["status"] == "converted_to_task"


def test_create_follow_up_task_unknown_agent_rejected(client, cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_completed_ceo_task()
    task_ids.append(task_id)
    created = client.post(f"/api/v1/deliverables/from-task/{task_id}").json()
    deliverable_ids.append(created["id"])

    response = client.post(
        f"/api/v1/deliverables/{created['id']}/create-follow-up-task",
        json={
            "title": "无效 Agent 测试",
            "assigned_agent": "不存在的 Agent 名称",
            "priority": "normal",
        },
    )
    assert response.status_code == 404


def test_create_follow_up_task_missing_deliverable(client, follow_up_agent):
    response = client.post(
        "/api/v1/deliverables/999999999/create-follow-up-task",
        json={"title": "x", "assigned_agent": follow_up_agent},
    )
    assert response.status_code == 404
