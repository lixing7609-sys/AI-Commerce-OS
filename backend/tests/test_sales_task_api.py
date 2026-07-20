"""
Task API 对销售 Agent 结果的安全返回测试（阶段 8C）。

覆盖：structured sales_analysis 经 GET /api/v1/tasks/{id} 安全
返回；text fallback 安全返回；委派场景下父子字段
（parent_task_id/root_task_id/delegation_depth/created_by_agent/
parent_summary）依然正确，不因为换成真实销售 Agent 而破坏。
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database.db import SessionLocal
from app.main import app
from app.models.task_db import TaskDB

TEST_MARKER = "SALES_TASK_API_TEST"


def _client():
    return TestClient(app)


def _make_task_id():
    return f"SALESAPITEST{uuid.uuid4().hex[:8].upper()}"


def _insert_task(*, task_id=None, parent_task_id=None, root_task_id=None, **extra):
    task_id = task_id or _make_task_id()
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER}_task",
            assigned_agent=extra.pop("assigned_agent", "销售 Agent"),
            priority="normal",
            status=extra.pop("status", "completed"),
            payload=extra.pop("payload", {"task": "分析当前可执行的销售机会"}),
            result=extra.pop("result", None),
            created_at=datetime.now(timezone.utc),
            parent_task_id=parent_task_id,
            root_task_id=root_task_id if root_task_id is not None else task_id,
            delegation_depth=extra.pop("delegation_depth", 0),
            created_by_agent=extra.pop("created_by_agent", None),
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return task_id


@pytest.fixture
def cleanup_task_ids():
    task_ids = []
    yield task_ids
    if not task_ids:
        return
    db = SessionLocal()
    try:
        db.query(TaskDB).filter(TaskDB.id.in_(task_ids)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def test_structured_sales_result_returned_safely(cleanup_task_ids):
    task_id = _insert_task(
        result={
            "success": True,
            "agent": "销售 Agent",
            "result": {
                "agent": "销售 Agent",
                "analysis_type": "sales_strategy",
                "provider": "deepseek",
                "model": "deepseek-chat",
                "format": "structured",
                "sales_analysis": {
                    "summary": "s",
                    "known_facts": [],
                    "data_gaps": ["尚未接入真实订单数据"],
                    "opportunities": [],
                    "strategy": {},
                    "actions_today": [],
                    "seven_day_plan": [],
                    "required_inputs": [],
                    "warnings": [],
                },
                "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2},
            },
        }
    )
    cleanup_task_ids.append(task_id)

    with _client() as client:
        response = client.get(f"/api/v1/tasks/{task_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["result"]["result"]["format"] == "structured"
    assert (
        "尚未接入真实订单数据"
        in body["result"]["result"]["sales_analysis"]["data_gaps"]
    )


def test_text_fallback_sales_result_returned_safely(cleanup_task_ids):
    task_id = _insert_task(
        result={
            "success": True,
            "agent": "销售 Agent",
            "result": {
                "agent": "销售 Agent",
                "analysis_type": "sales_strategy",
                "provider": "deepseek",
                "model": "deepseek-chat",
                "format": "text",
                "sales_analysis": {"text": "纯文本销售分析降级结果"},
                "usage": None,
            },
        }
    )
    cleanup_task_ids.append(task_id)

    with _client() as client:
        response = client.get(f"/api/v1/tasks/{task_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["result"]["result"]["format"] == "text"
    assert (
        body["result"]["result"]["sales_analysis"]["text"]
        == "纯文本销售分析降级结果"
    )


def test_delegated_sales_task_parent_child_fields_correct(cleanup_task_ids):
    parent_id = _insert_task(
        assigned_agent="AI CEO",
        payload={"task": "生成今日经营分析"},
        result={
            "success": True,
            "result": {
                "analysis": {
                    "summary": "系统正常",
                    "findings": [],
                    "risks": [],
                    "actions": [],
                },
                "delegation": {
                    "items": [
                        {
                            "assigned_agent": "销售 Agent",
                            "task": "分析销售机会",
                            "reason": "销售活跃度低",
                            "child_task_id": None,
                            "status": "created",
                        }
                    ]
                },
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    child_id = _insert_task(
        assigned_agent="销售 Agent",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
        created_by_agent="AI CEO",
        payload={"task": "分析销售机会"},
        result={
            "success": True,
            "result": {
                "agent": "销售 Agent",
                "format": "structured",
                "sales_analysis": {"summary": "s"},
            },
        },
    )
    cleanup_task_ids.append(child_id)

    with _client() as client:
        parent_response = client.get(f"/api/v1/tasks/{parent_id}")
        child_response = client.get(f"/api/v1/tasks/{child_id}")

    parent_body = parent_response.json()
    child_body = child_response.json()

    assert parent_body["child_task_count"] == 1
    assert parent_body["children"][0]["id"] == child_id
    assert parent_body["children"][0]["assigned_agent"] == "销售 Agent"

    assert child_body["parent_task_id"] == parent_id
    assert child_body["root_task_id"] == parent_id
    assert child_body["delegation_depth"] == 1
    assert child_body["created_by_agent"] == "AI CEO"
    assert child_body["parent_summary"]["id"] == parent_id
