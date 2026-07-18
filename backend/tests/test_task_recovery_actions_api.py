"""
POST /api/v1/tasks/{task_id}/requeue 与
POST /api/v1/tasks/{task_id}/mark-failed 测试。

覆盖：requeue（running→pending）与 mark-failed
（pending/running→failed）的状态转换、字段清空/保留规则、
非法状态转换的 409、任务不存在的 404、reason 校验的 422、
安全边界（不调用 RuntimeEngine/AgentRegistry/
RuntimeRecoveryService、不修改 system_runtime_state）、
数据库异常 rollback、真实并发下同一任务只有一次转换成功、
以及 recovery-candidates 在动作后正确反映新状态。

测试通过直接构造 TaskDB 行来精确控制初始状态，不依赖真实
Agent 执行；所有测试创建的任务都在测试结束后显式删除，
不污染开发数据库；不真实启动 Runtime，不真实执行 Agent。
"""

import threading
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.runtime_recovery_service import RuntimeRecoveryService
from app.services.task_recovery_action_service import (
    InvalidTaskTransitionError,
    TaskRecoveryActionService,
)

TEST_MARKER = "RECOVERY_ACTIONS_TEST_MARKER"
TEST_TASK_TYPE = f"{TEST_MARKER}_task_type"
TEST_AGENT = "RECOVERY_ACTIONS_TEST_AGENT"


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
    TestClient(app) 的 lifespan 会读写 system_runtime_state，
    这里在整个模块的测试前后快照/恢复该行和 RuntimeEngine
    内存状态。
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
    return f"TASK-RCA{uuid.uuid4().hex[:10].upper()}"


def _insert_task(
    status,
    assigned_agent=TEST_AGENT,
    priority="normal",
    payload=None,
    created_at=None,
    started_at=None,
    completed_at=None,
    result=None,
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
            priority=priority,
            status=status,
            payload=payload if payload is not None else {"source": TEST_MARKER},
            result=result,
            error=error,
            created_at=created_at or datetime.now(timezone.utc),
            started_at=started_at,
            completed_at=completed_at,
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
# A. requeue
# ---------------------------------------------------------------------------


def test_requeue_running_task_succeeds(client, cleanup_task_ids):
    started_at = datetime.now(timezone.utc)
    task_id = _insert_task(
        status="running",
        started_at=started_at,
        result=None,
        error=None,
    )
    cleanup_task_ids.append(task_id)

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")

    assert response.status_code == 200

    body = response.json()
    assert body["id"] == task_id
    assert body["status"] == "pending"
    assert body["started_at"] is None
    assert body["completed_at"] is None
    assert body["result"] is None
    assert body["error"] is None


def test_requeue_preserves_immutable_fields(client, cleanup_task_ids):
    created_at = datetime.now(timezone.utc)
    payload = {"source": TEST_MARKER, "note": "keep-me"}
    task_id = _insert_task(
        status="running",
        assigned_agent=TEST_AGENT,
        priority="high",
        payload=payload,
        created_at=created_at,
        started_at=created_at,
    )
    cleanup_task_ids.append(task_id)

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")
    assert response.status_code == 200

    body = response.json()
    assert body["task_type"] == TEST_TASK_TYPE
    assert body["assigned_agent"] == TEST_AGENT
    assert body["priority"] == "high"
    assert body["payload"] == payload

    row = _get_task_row(task_id)
    assert row.created_at == created_at


def test_requeue_pending_task_returns_409(client, cleanup_task_ids):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")

    assert response.status_code == 409
    assert "pending" in response.json()["detail"]


def test_requeue_completed_task_returns_409(client, cleanup_task_ids):
    task_id = _insert_task(
        status="completed",
        completed_at=datetime.now(timezone.utc),
        result={"ok": True},
    )
    cleanup_task_ids.append(task_id)

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")

    assert response.status_code == 409
    assert "completed" in response.json()["detail"]


def test_requeue_failed_task_returns_409(client, cleanup_task_ids):
    task_id = _insert_task(
        status="failed",
        completed_at=datetime.now(timezone.utc),
        error="之前失败的原因",
    )
    cleanup_task_ids.append(task_id)

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")

    assert response.status_code == 409
    assert "failed" in response.json()["detail"]


def test_requeue_nonexistent_task_returns_404(client):
    response = client.post(
        "/api/v1/tasks/TASK-DOES-NOT-EXIST-RCA/requeue"
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# B. mark-failed
# ---------------------------------------------------------------------------


def test_mark_failed_from_pending_succeeds(client, cleanup_task_ids):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "人工判断任务已无法恢复"},
    )

    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "failed"
    assert body["error"] == "人工判断任务已无法恢复"
    assert body["completed_at"] is not None
    assert body["result"] is None
    assert body["started_at"] is None


def test_mark_failed_from_running_succeeds(client, cleanup_task_ids):
    started_at = datetime.now(timezone.utc)
    task_id = _insert_task(status="running", started_at=started_at)
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "运行超时，人工标记失败"},
    )

    assert response.status_code == 200

    body = response.json()
    assert body["status"] == "failed"
    assert body["completed_at"] is not None
    assert body["result"] is None
    assert body["started_at"] is not None


def test_mark_failed_reason_is_trimmed(client, cleanup_task_ids):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "   人工原因带首尾空格   "},
    )

    assert response.status_code == 200
    assert response.json()["error"] == "人工原因带首尾空格"


def test_mark_failed_on_failed_task_returns_409(client, cleanup_task_ids):
    task_id = _insert_task(
        status="failed",
        completed_at=datetime.now(timezone.utc),
        error="已有失败原因",
    )
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "再次标记失败"},
    )

    assert response.status_code == 409
    assert "failed" in response.json()["detail"]


def test_mark_failed_on_completed_task_returns_409(client, cleanup_task_ids):
    task_id = _insert_task(
        status="completed",
        completed_at=datetime.now(timezone.utc),
        result={"ok": True},
    )
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "尝试标记已完成任务"},
    )

    assert response.status_code == 409
    assert "completed" in response.json()["detail"]


def test_mark_failed_nonexistent_task_returns_404(client):
    response = client.post(
        "/api/v1/tasks/TASK-DOES-NOT-EXIST-RCA/mark-failed",
        json={"reason": "无效任务编号"},
    )

    assert response.status_code == 404


def test_mark_failed_empty_reason_returns_422(client, cleanup_task_ids):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": ""},
    )

    assert response.status_code == 422


def test_mark_failed_whitespace_only_reason_returns_422(
    client, cleanup_task_ids
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "     "},
    )

    assert response.status_code == 422


def test_mark_failed_overlong_reason_returns_422(client, cleanup_task_ids):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "x" * 501},
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# C. 安全与边界
# ---------------------------------------------------------------------------


def test_requeue_does_not_call_runtime_engine_or_agent_registry(
    client, cleanup_task_ids, monkeypatch
):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    calls = {"engine_start": False, "engine_stop": False, "registry": False}

    monkeypatch.setattr(
        runtime_engine, "start", lambda: calls.__setitem__("engine_start", True)
    )
    monkeypatch.setattr(
        runtime_engine, "stop", lambda: calls.__setitem__("engine_stop", True)
    )
    monkeypatch.setattr(
        AgentRegistry, "start_all", staticmethod(lambda: calls.__setitem__("registry", True))
    )

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")

    assert response.status_code == 200
    assert calls == {
        "engine_start": False,
        "engine_stop": False,
        "registry": False,
    }


def test_mark_failed_does_not_call_runtime_recovery_service(
    client, cleanup_task_ids, monkeypatch
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    called = {"value": False}

    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(lambda: called.__setitem__("value", True)),
    )

    response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "安全边界测试"},
    )

    assert response.status_code == 200
    assert called["value"] is False


def test_actions_do_not_modify_system_runtime_state(
    client, cleanup_task_ids
):
    before = _snapshot_runtime_state_row()

    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    client.post(f"/api/v1/tasks/{task_id}/requeue")
    client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "确认不影响 system_runtime_state"},
    )

    after = _snapshot_runtime_state_row()

    assert before == after


def test_database_exception_triggers_rollback(
    client, cleanup_task_ids, monkeypatch
):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    from app.services import task_recovery_action_service as module

    original_commit_cls = module.SessionLocal

    class FailingSession:
        def __init__(self, *args, **kwargs):
            self._session = original_commit_cls(*args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._session, name)

        def commit(self):
            raise RuntimeError("模拟提交失败，包含敏感串 postgresql://u:p@h/db")

    monkeypatch.setattr(module, "SessionLocal", FailingSession)

    response = client.post(f"/api/v1/tasks/{task_id}/requeue")

    assert response.status_code == 500

    detail = response.json()["detail"]
    assert "postgresql://" not in detail
    assert "RuntimeError" in detail

    row = _get_task_row(task_id)
    assert row.status == "running"


def test_500_does_not_leak_connection_string(client, monkeypatch):
    def failing_requeue(task_id):
        raise RuntimeError(
            "模拟未预期错误，包含 postgresql://user:secret@host/db"
        )

    monkeypatch.setattr(
        TaskRecoveryActionService,
        "requeue_task",
        staticmethod(failing_requeue),
    )

    response = client.post("/api/v1/tasks/ANY-ID/requeue")

    assert response.status_code == 500

    detail = response.json()["detail"]
    assert "postgresql://" not in detail
    assert "secret" not in detail
    assert "RuntimeError" in detail


def test_concurrent_requeue_only_one_succeeds(cleanup_task_ids):
    """
    用两个真实线程各自创建独立的 SessionLocal()，模拟两个并发的
    人工操作同时对同一个 running 任务调用 requeue：依靠
    SELECT ... FOR UPDATE 行锁，同一时间只有一个事务能拿到锁，
    另一个必须等第一个 commit 后才能继续，此时重新读到的状态
    已经是 pending，因而只有一次成功、一次 409。
    """

    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    results = []
    lock = threading.Lock()

    def worker():
        try:
            TaskRecoveryActionService.requeue_task(task_id)
            outcome = "success"
        except InvalidTaskTransitionError:
            outcome = "conflict"

        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=worker) for _ in range(2)]

    for thread in threads:
        thread.start()

    for thread in threads:
        thread.join(timeout=10)

    assert results.count("success") == 1
    assert results.count("conflict") == 1

    row = _get_task_row(task_id)
    assert row.status == "pending"


def test_recovery_candidates_reflects_action_results(
    client, cleanup_task_ids
):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    before_response = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT},
    )
    before_ids = [
        item["id"] for item in before_response.json()["items"]
    ]
    assert task_id in before_ids

    requeue_response = client.post(f"/api/v1/tasks/{task_id}/requeue")
    assert requeue_response.status_code == 200

    after_requeue = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "status": "pending"},
    )
    after_requeue_ids = [
        item["id"] for item in after_requeue.json()["items"]
    ]
    assert task_id in after_requeue_ids

    mark_failed_response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": "确认 recovery-candidates 反映最新状态"},
    )
    assert mark_failed_response.status_code == 200

    after_mark_failed = client.get(
        "/api/v1/tasks/recovery-candidates",
        params={"assigned_agent": TEST_AGENT, "limit": 500},
    )
    after_mark_failed_ids = [
        item["id"] for item in after_mark_failed.json()["items"]
    ]
    assert task_id not in after_mark_failed_ids
