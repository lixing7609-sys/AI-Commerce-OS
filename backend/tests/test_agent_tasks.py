"""
Agent 任务系统集成测试。

覆盖：

- RuntimeEngine 未启动时，Agent run 返回 409
- RuntimeEngine 启动后，Agent 可以成功执行任务
- 任务写入 PostgreSQL
- Tasks API 能查询
- 任务通过独立数据库连接可读（验证持久化，等价于后端重启后任务仍存在）
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.agents.agent_registry import AgentRegistry
from app.database.db import DATABASE_URL, SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine

AGENT_NAME = "AI CEO"


def _snapshot_runtime_state_row():
    db = SessionLocal()

    try:
        row = (
            db.query(RuntimeStateDB)
            .filter(RuntimeStateDB.id == 1)
            .first()
        )

        if row is None:
            return None

        return {
            "desired_state": row.desired_state,
            "actual_state": row.actual_state,
            "auto_resume_enabled": row.auto_resume_enabled,
            "last_started_at": row.last_started_at,
            "last_stopped_at": row.last_stopped_at,
            "last_heartbeat_at": row.last_heartbeat_at,
            "last_shutdown_type": row.last_shutdown_type,
            "last_error": row.last_error,
            "recovery_failure_count": row.recovery_failure_count,
        }

    finally:
        db.close()


def _restore_runtime_state_row(snapshot):
    db = SessionLocal()

    try:
        row = (
            db.query(RuntimeStateDB)
            .filter(RuntimeStateDB.id == 1)
            .first()
        )

        if snapshot is None:
            if row is not None:
                db.delete(row)
                db.commit()
            return

        if row is None:
            row = RuntimeStateDB(id=1, **snapshot)
            db.add(row)
            db.commit()
            return

        for key, value in snapshot.items():
            setattr(row, key, value)

        row.updated_at = datetime.now(timezone.utc)

        db.commit()

    finally:
        db.close()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def cleanup_task_ids():
    """
    记录测试过程中真实创建（写入 PostgreSQL）的任务 id，测试结束
    后（无论断言是否失败）按精确 id 删除，避免每次运行本文件都
    向开发库永久新增 completed 任务。只按调用方显式记录的 id
    删除，不按 status、assigned_agent 做任何批量删除。
    """

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


@pytest.fixture(autouse=True)
def _stopped_runtime(client):
    """
    确保每个测试用例开始前 RuntimeEngine 处于停止状态，
    并在用例结束后把 system_runtime_state 和 RuntimeEngine
    内存状态恢复为用例开始前的原值，避免本文件的调用
    （现在会写入 system_runtime_state）污染开发数据库。
    """

    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    client.post("/api/v1/runtime/stop")

    yield

    runtime_engine.running = memory_snapshot["running"]
    runtime_engine.started_at = memory_snapshot["started_at"]
    runtime_engine.stopped_at = memory_snapshot["stopped_at"]

    if memory_snapshot["running"]:
        AgentRegistry.start_all()
    else:
        AgentRegistry.stop_all()

    _restore_runtime_state_row(db_snapshot)


def test_agent_run_without_runtime_returns_409(client):
    response = client.post(
        f"/api/v1/agents/{AGENT_NAME}/run",
        json={"task": "生成经营建议"},
    )

    assert response.status_code == 409


def test_agent_run_persists_task_and_is_queryable(client, cleanup_task_ids):
    start_response = client.post("/api/v1/runtime/start")
    assert start_response.status_code == 200
    assert start_response.json()["running"] is True

    # 本测试只验证任务持久化管道（写库/可查询/独立连接可读），不
    # 验证 AI CEO 的经营分析业务逻辑（阶段 8A 起需要真实配置的
    # LLM Provider，见 test_ai_ceo_agent.py）；task 文本特意选用
    # AICEOAgent 不识别的关键词，走 unsupported_task 安全成功路径
    # （status=completed），不依赖任何 LLM 网络调用。
    run_response = client.post(
        f"/api/v1/agents/{AGENT_NAME}/run",
        json={"task": "回归测试任务", "priority": "high"},
    )
    assert run_response.status_code == 200

    body = run_response.json()
    assert body["success"] is True

    task = body["task"]
    assert task["status"] == "completed"
    assert task["assigned_agent"] == AGENT_NAME

    task_id = task["id"]
    cleanup_task_ids.append(task_id)

    # Tasks API 能查询到刚执行的任务
    detail_response = client.get(f"/api/v1/tasks/{task_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "completed"

    list_response = client.get("/api/v1/tasks")
    assert list_response.status_code == 200
    task_ids = [item["id"] for item in list_response.json()["items"]]
    assert task_id in task_ids

    # 通过一条独立于应用进程的数据库连接直接读取任务，
    # 验证任务已经真正提交到 PostgreSQL（而非仅存在于内存中），
    # 这等价于后端进程重启后任务记录依然存在。
    independent_engine = create_engine(DATABASE_URL)

    with independent_engine.connect() as connection:
        row = connection.execute(
            text("SELECT status FROM tasks WHERE id = :id"),
            {"id": task_id},
        ).fetchone()

    independent_engine.dispose()

    assert row is not None
    assert row[0] == "completed"
