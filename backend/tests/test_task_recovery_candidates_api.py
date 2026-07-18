"""
GET /api/v1/tasks/recovery-candidates 测试。

覆盖：只读诊断响应结构、pending/running 候选任务的正确返回、
stale running 判定（含缺少可判断时间的防御分支）、status/
assigned_agent 过滤、limit/offset 分页、排序稳定性、非法参数
422、completed/failed 不返回、API 不修改任务数据、不调用
RuntimeEngine 或 RuntimeRecoveryService、查询失败时的安全 500。

测试通过直接构造 TaskDB 行来精确控制 status/created_at/
started_at，而不是通过真实 Agent 执行（避免真实等待 30 分钟，
也避免依赖不确定的执行时序）；所有测试创建的行都在测试结束后
显式删除，不污染开发数据库；不修改 system_runtime_state 之外
的任何数据，不真实启动 Agent。

"缺少可用于判断的时间"分支单独用内存中未持久化的 TaskDB 对象
直接测试 TaskRecoveryService.determine_stale_state()：tasks.
created_at 是 NOT NULL 列，真实持久化的行不可能同时缺失
started_at 和 created_at，因此这个防御分支只能在服务层单测中
触发，无法通过真实 API 请求触发。
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.runtime_recovery_service import RuntimeRecoveryService
from app.services.task_recovery_service import TaskRecoveryService

TEST_MARKER = "RECOVERY_CANDIDATES_TEST_MARKER"
TEST_TASK_TYPE = f"{TEST_MARKER}_task_type"
TEST_AGENT = "RECOVERY_CANDIDATES_TEST_AGENT"


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


@pytest.fixture(scope="module", autouse=True)
def _preserve_runtime_and_db_state():
    """
    TestClient(app) 的 lifespan 会读写 system_runtime_state
    （readiness/heartbeat/graceful shutdown），这里在整个模块的
    测试前后快照/恢复该行和 RuntimeEngine 内存状态。
    """

    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    yield

    runtime_engine.running = memory_snapshot["running"]
    runtime_engine.started_at = memory_snapshot["started_at"]
    runtime_engine.stopped_at = memory_snapshot["stopped_at"]

    if memory_snapshot["running"]:
        AgentRegistry.start_all()
    else:
        AgentRegistry.stop_all()

    _restore_runtime_state_row(db_snapshot)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def cleanup_task_ids():
    """
    收集本测试内创建的任务 id，测试结束后逐个删除，
    不在开发数据库中遗留虚构的 pending/running 任务。
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


def _make_task_id():
    return f"TASK-RCT{uuid.uuid4().hex[:10].upper()}"


def _insert_task(
    status,
    assigned_agent=TEST_AGENT,
    created_at=None,
    started_at=None,
    error=None,
    task_type=TEST_TASK_TYPE,
):
    db = SessionLocal()

    try:
        task_id = _make_task_id()

        row = TaskDB(
            id=task_id,
            task_type=task_type,
            assigned_agent=assigned_agent,
            priority="normal",
            status=status,
            payload={"source": TEST_MARKER},
            result=None,
            error=error,
            created_at=created_at or datetime.now(timezone.utc),
            started_at=started_at,
            completed_at=None,
        )

        db.add(row)
        db.commit()

        return task_id

    finally:
        db.close()


def _get_task_row(task_id):
    db = SessionLocal()

    try:
        return db.query(TaskDB).filter(TaskDB.id == task_id).first()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 1. 无 pending/running 时的空响应
# ---------------------------------------------------------------------------


def test_no_pending_or_running_tasks_returns_empty_summary(client):
    """
    本文件内其余测试均使用独立的 cleanup_task_ids fixture 在测试
    结束后立刻删除自己创建的任务，项目内其它测试也都通过同步执行
    的 Agent 流程创建任务（不会遗留 pending/running），因此在本
    测试执行时，全局理应没有任何未完成任务。
    """

    response = client.get("/api/v1/tasks/recovery-candidates")

    assert response.status_code == 200

    body = response.json()
    assert body["items"] == []
    assert body["summary"]["total_candidates"] == 0
    assert body["summary"]["pending_count"] == 0
    assert body["summary"]["running_count"] == 0
    assert body["summary"]["blocks_runtime_recovery"] is False
    assert body["summary"]["blocking_reason"] == "没有未完成任务"


# ---------------------------------------------------------------------------
# 2-3. pending / running 任务正确返回
# ---------------------------------------------------------------------------


def test_pending_task_returned_with_recommended_actions(
    client, cleanup_task_ids
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT},
    )

    assert response.status_code == 200

    body = response.json()
    matched = [item for item in body["items"] if item["id"] == task_id]

    assert len(matched) == 1
    assert matched[0]["status"] == "pending"
    assert matched[0]["recommended_actions"] == [
        "inspect",
        "retry_later",
        "mark_failed",
    ]
    assert body["summary"]["blocks_runtime_recovery"] is True


def test_running_task_returned_with_recommended_actions(
    client, cleanup_task_ids
):
    started_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    task_id = _insert_task(status="running", started_at=started_at)
    cleanup_task_ids.append(task_id)

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT},
    )

    assert response.status_code == 200

    body = response.json()
    matched = [item for item in body["items"] if item["id"] == task_id]

    assert len(matched) == 1
    assert matched[0]["status"] == "running"
    assert matched[0]["recommended_actions"] == [
        "inspect",
        "requeue",
        "mark_failed",
    ]
    assert body["summary"]["blocks_runtime_recovery"] is True


def test_response_never_exposes_raw_task_error(client, cleanup_task_ids):
    """
    tasks.error 至少有一条写入路径（agents.py 的
    mark_failed(str(error))）直接写入原始异常文本，无法保证安全，
    因此 TaskRecoveryCandidate 不应包含 error 字段——即使某条候选
    任务的 DB 行已经写入了看起来敏感的 error 内容，也不能出现在
    响应里。
    """

    sensitive_error = (
        "connection failed: postgresql://n8n:password123@host/db "
        "api_key=sk-fake-secret-token"
    )
    task_id = _insert_task(status="pending", error=sensitive_error)
    cleanup_task_ids.append(task_id)

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT},
    )

    assert response.status_code == 200

    body = response.json()
    matched = [item for item in body["items"] if item["id"] == task_id]
    assert len(matched) == 1

    assert "error" not in matched[0]
    assert "password123" not in response.text
    assert "sk-fake-secret-token" not in response.text


# ---------------------------------------------------------------------------
# 4-6. stale running 判定
# ---------------------------------------------------------------------------


def test_stale_running_task_is_flagged(client, cleanup_task_ids):
    old_time = datetime.now(timezone.utc) - timedelta(minutes=45)
    task_id = _insert_task(
        status="running", started_at=old_time, created_at=old_time
    )
    cleanup_task_ids.append(task_id)

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "stale_after_minutes": 30},
    )

    assert response.status_code == 200

    item = next(
        i for i in response.json()["items"] if i["id"] == task_id
    )
    assert item["is_stale"] is True
    assert "30" in item["stale_reason"]


def test_running_task_not_stale_within_threshold(client, cleanup_task_ids):
    recent_time = datetime.now(timezone.utc) - timedelta(minutes=5)
    task_id = _insert_task(status="running", started_at=recent_time)
    cleanup_task_ids.append(task_id)

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "stale_after_minutes": 30},
    )

    assert response.status_code == 200

    item = next(
        i for i in response.json()["items"] if i["id"] == task_id
    )
    assert item["is_stale"] is False


def test_determine_stale_state_missing_time_returns_reason():
    """
    tasks.created_at 是 NOT NULL 列，真实持久化的行不可能同时
    缺失 started_at 和 created_at；这里直接构造未提交的内存对象
    单测该防御分支。
    """

    task = TaskDB(
        id="TASK-RCT-UNPERSISTED",
        task_type=TEST_TASK_TYPE,
        assigned_agent=TEST_AGENT,
        status="running",
        started_at=None,
        created_at=None,
    )

    is_stale, reason = TaskRecoveryService.determine_stale_state(
        task, stale_after_minutes=30
    )

    assert is_stale is False
    assert reason == "缺少可用于判断的时间"


# ---------------------------------------------------------------------------
# 7-11. 过滤、分页、排序
# ---------------------------------------------------------------------------


def test_filter_by_status_pending(client, cleanup_task_ids):
    pending_id = _insert_task(status="pending")
    running_id = _insert_task(status="running")
    cleanup_task_ids.extend([pending_id, running_id])

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "status": "pending"},
    )

    assert response.status_code == 200

    body = response.json()
    ids = [item["id"] for item in body["items"]]
    assert pending_id in ids
    assert running_id not in ids
    assert all(item["status"] == "pending" for item in body["items"])


def test_filter_by_status_running(client, cleanup_task_ids):
    pending_id = _insert_task(status="pending")
    running_id = _insert_task(status="running")
    cleanup_task_ids.extend([pending_id, running_id])

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "status": "running"},
    )

    assert response.status_code == 200

    body = response.json()
    ids = [item["id"] for item in body["items"]]
    assert running_id in ids
    assert pending_id not in ids
    assert all(item["status"] == "running" for item in body["items"])


def test_filter_by_assigned_agent(client, cleanup_task_ids):
    matching_id = _insert_task(status="pending", assigned_agent=TEST_AGENT)
    other_id = _insert_task(
        status="pending", assigned_agent="OTHER_" + TEST_AGENT
    )
    cleanup_task_ids.extend([matching_id, other_id])

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT},
    )

    assert response.status_code == 200

    ids = [item["id"] for item in response.json()["items"]]
    assert matching_id in ids
    assert other_id not in ids


def test_pagination_limit_and_offset(client, cleanup_task_ids):
    base_time = datetime.now(timezone.utc) - timedelta(minutes=10)

    task_ids = [
        _insert_task(
            status="pending",
            created_at=base_time + timedelta(seconds=index),
        )
        for index in range(3)
    ]
    cleanup_task_ids.extend(task_ids)

    first_page = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "limit": 2, "offset": 0},
    ).json()

    second_page = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "limit": 2, "offset": 2},
    ).json()

    assert first_page["limit"] == 2
    assert first_page["offset"] == 0
    assert first_page["returned_count"] == 2

    assert second_page["offset"] == 2
    assert second_page["returned_count"] == 1

    first_ids = [item["id"] for item in first_page["items"]]
    second_ids = [item["id"] for item in second_page["items"]]
    assert set(first_ids).isdisjoint(second_ids)
    assert set(first_ids + second_ids) == set(task_ids)


def test_returned_order_running_before_pending_then_created_at(
    client, cleanup_task_ids
):
    base_time = datetime.now(timezone.utc) - timedelta(minutes=20)

    pending_first = _insert_task(
        status="pending", created_at=base_time
    )
    pending_second = _insert_task(
        status="pending", created_at=base_time + timedelta(seconds=10)
    )
    running_first = _insert_task(
        status="running",
        created_at=base_time + timedelta(seconds=1),
        started_at=base_time + timedelta(seconds=1),
    )
    running_second = _insert_task(
        status="running",
        created_at=base_time + timedelta(seconds=11),
        started_at=base_time + timedelta(seconds=11),
    )
    cleanup_task_ids.extend(
        [pending_first, pending_second, running_first, running_second]
    )

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "limit": 500},
    )

    ids = [item["id"] for item in response.json()["items"]]

    assert ids.index(running_first) < ids.index(running_second)
    assert ids.index(running_second) < ids.index(pending_first)
    assert ids.index(pending_first) < ids.index(pending_second)


# ---------------------------------------------------------------------------
# 12-14. 非法参数
# ---------------------------------------------------------------------------


def test_invalid_status_returns_422(client):
    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"status": "completed"},
    )

    assert response.status_code == 422


def test_invalid_stale_after_minutes_too_low_returns_422(client):
    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"stale_after_minutes": 0},
    )

    assert response.status_code == 422


def test_invalid_stale_after_minutes_too_high_returns_422(client):
    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"stale_after_minutes": 10081},
    )

    assert response.status_code == 422


def test_invalid_limit_returns_422(client):
    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"limit": 0},
    )

    assert response.status_code == 422

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"limit": 501},
    )

    assert response.status_code == 422


def test_invalid_offset_returns_422(client):
    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"offset": -1},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 15. completed/failed 不返回
# ---------------------------------------------------------------------------


def test_completed_and_failed_tasks_not_returned(client, cleanup_task_ids):
    completed_id = _insert_task(status="completed")
    failed_id = _insert_task(status="failed")
    cleanup_task_ids.extend([completed_id, failed_id])

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "limit": 500},
    )

    ids = [item["id"] for item in response.json()["items"]]
    assert completed_id not in ids
    assert failed_id not in ids


# ---------------------------------------------------------------------------
# 16-18. 只读、不触发 RuntimeEngine / RuntimeRecoveryService
# ---------------------------------------------------------------------------


def test_api_does_not_modify_task_data(client, cleanup_task_ids):
    task_id = _insert_task(status="pending", error=None)
    cleanup_task_ids.append(task_id)

    before = _get_task_row(task_id)
    before_snapshot = (
        before.status,
        before.error,
        before.started_at,
        before.completed_at,
    )

    response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT},
    )
    assert response.status_code == 200

    after = _get_task_row(task_id)
    after_snapshot = (
        after.status,
        after.error,
        after.started_at,
        after.completed_at,
    )

    assert before_snapshot == after_snapshot


def test_api_does_not_call_runtime_engine(client, monkeypatch):
    calls = {"start": False, "stop": False}

    monkeypatch.setattr(
        runtime_engine, "start", lambda: calls.__setitem__("start", True)
    )
    monkeypatch.setattr(
        runtime_engine, "stop", lambda: calls.__setitem__("stop", True)
    )

    response = client.get("/api/v1/tasks/recovery-candidates")

    assert response.status_code == 200
    assert calls == {"start": False, "stop": False}


def test_api_does_not_call_runtime_recovery_service(client, monkeypatch):
    called = {"value": False}

    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(lambda: called.__setitem__("value", True)),
    )

    response = client.get("/api/v1/tasks/recovery-candidates")

    assert response.status_code == 200
    assert called["value"] is False


# ---------------------------------------------------------------------------
# 19. 查询失败返回安全的 500
# ---------------------------------------------------------------------------


def test_query_failure_returns_safe_500(client, monkeypatch):
    def failing_count(stale_after_minutes):
        raise RuntimeError(
            "模拟数据库查询失败，包含敏感连接串 "
            "postgresql://user:secret@host/db"
        )

    monkeypatch.setattr(
        TaskRecoveryService,
        "count_recovery_candidates",
        staticmethod(failing_count),
    )

    response = client.get("/api/v1/tasks/recovery-candidates")

    assert response.status_code == 500

    detail = response.json()["detail"]
    assert "postgresql://" not in detail
    assert "secret" not in detail
    assert "RuntimeError" in detail
