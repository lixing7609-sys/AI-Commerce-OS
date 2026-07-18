"""
阶段 4C-1：Task Consumer 运行状态 API 测试。

覆盖：

- GET /api/v1/runtime/consumer-status 的 200 响应、字段完整性、
  无副作用（不 start/stop/wake consumer，不访问数据库，不触发
  TaskExecutionService）
- healthy = running 的语义（含"临时错误后仍运行"与"意外退出"两种
  对照场景）
- current_task_id 的安全边界（不返回 payload/result/原始异常）
- GET/POST/PUT 四个 Runtime endpoint 响应体都包含结构一致的
  consumer 字段
- OpenAPI 中新增路由与新增模型字段的存在性
- system_runtime_state 与 tasks 表均不受影响

测试全程不真实执行 Agent、不创建 pending 任务、不等待真实轮询；
需要特定 running/healthy/last_error_type 组合时用 monkeypatch 让
task_consumer_service.get_status() 返回受控的合成字典，不依赖也
不改变共享单例消费者的真实内部状态，避免影响同一进程内其它测试
文件的执行顺序或残留状态。
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.task_consumer_service import task_consumer_service

CONSUMER_STATUS_KEYS = {
    "running",
    "healthy",
    "stop_requested",
    "current_task_id",
    "processed_count",
    "completed_count",
    "failed_count",
    "conflict_count",
    "last_outcome",
    "last_error_type",
    "started_at",
    "stopped_at",
}


def _snapshot_runtime_state_row():
    db = SessionLocal()

    try:
        row = db.query(RuntimeStateDB).filter(RuntimeStateDB.id == 1).first()

        if row is None:
            return None

        return {
            column.name: getattr(row, column.name)
            for column in RuntimeStateDB.__table__.columns
        }

    finally:
        db.close()


def _restore_runtime_state_row(snapshot):
    db = SessionLocal()

    try:
        row = db.query(RuntimeStateDB).filter(RuntimeStateDB.id == 1).first()

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

        db.commit()

    finally:
        db.close()


def _task_counts():
    db = SessionLocal()

    try:
        rows = db.query(TaskDB.status, TaskDB.id).all()
        counts = {}
        for status, _ in rows:
            counts[status] = counts.get(status, 0) + 1
        return counts

    finally:
        db.close()


def _fake_status(
    running,
    healthy=None,
    stop_requested=False,
    current_task_id=None,
    processed_count=0,
    completed_count=0,
    failed_count=0,
    conflict_count=0,
    last_outcome=None,
    last_error_type=None,
    started_at=None,
    stopped_at=None,
):
    """构造一个符合 TaskConsumerService.get_status() 真实字典结构
    的合成返回值（get_status() 本身没有 healthy 字段，healthy 由
    API 层根据 running 计算，这里的 healthy 参数只是方便调用方
    表达意图，实际不会被 _build_consumer_status_response 读取）。
    """

    del healthy  # 仅用于测试可读性，API 层自己按 running 计算

    return {
        "running": running,
        "stop_requested": stop_requested,
        "current_task_id": current_task_id,
        "processed_count": processed_count,
        "completed_count": completed_count,
        "failed_count": failed_count,
        "conflict_count": conflict_count,
        "last_outcome": last_outcome,
        "last_error_type": last_error_type,
        "started_at": started_at,
        "stopped_at": stopped_at,
    }


@pytest.fixture(scope="module", autouse=True)
def _preserve_runtime_and_db_state():
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

    _restore_runtime_state_row(db_snapshot)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _restore_runtime_running_flag():
    """
    部分测试会直接设置 runtime_engine.running 来观察
    RuntimeStatusResponse.running 字段；每个测试后恢复原值，避免
    影响后续测试。
    """

    original = runtime_engine.running
    yield
    runtime_engine.running = original


# ---------------------------------------------------------------------------
# 1 / 2 / 3. GET consumer-status 基本行为与无副作用
# ---------------------------------------------------------------------------


def test_consumer_status_returns_200_with_full_schema(client):
    response = client.get("/api/v1/runtime/consumer-status")

    assert response.status_code == 200

    body = response.json()
    assert set(body.keys()) == CONSUMER_STATUS_KEYS
    assert isinstance(body["running"], bool)
    assert isinstance(body["healthy"], bool)
    assert isinstance(body["stop_requested"], bool)
    assert isinstance(body["processed_count"], int)
    assert isinstance(body["completed_count"], int)
    assert isinstance(body["failed_count"], int)
    assert isinstance(body["conflict_count"], int)


def test_consumer_status_has_no_side_effects(client, monkeypatch):
    calls = []

    monkeypatch.setattr(
        task_consumer_service,
        "start",
        lambda: calls.append("start"),
    )
    monkeypatch.setattr(
        task_consumer_service,
        "wake",
        lambda: calls.append("wake"),
    )

    async def _fail_stop(*args, **kwargs):
        calls.append("stop")

    monkeypatch.setattr(task_consumer_service, "stop", _fail_stop)

    from app.services.task_execution_service import TaskExecutionService

    def _fail_execute(*args, **kwargs):
        calls.append("process_next_pending_task")
        raise AssertionError("不应调用 TaskExecutionService")

    monkeypatch.setattr(
        TaskExecutionService,
        "process_next_pending_task",
        staticmethod(_fail_execute),
    )

    before = task_consumer_service.get_status()

    for _ in range(3):
        response = client.get("/api/v1/runtime/consumer-status")
        assert response.status_code == 200

    after = task_consumer_service.get_status()

    assert calls == []
    assert before == after


def test_consumer_status_does_not_touch_database(client):
    db_before = _snapshot_runtime_state_row()
    tasks_before = _task_counts()

    client.get("/api/v1/runtime/consumer-status")
    client.get("/api/v1/runtime/consumer-status")

    db_after = _snapshot_runtime_state_row()
    tasks_after = _task_counts()

    assert db_before == db_after
    assert tasks_before == tasks_after


# ---------------------------------------------------------------------------
# 4 / 5 / 6 / 7. healthy 语义与安全边界
# ---------------------------------------------------------------------------


def test_consumer_running_reports_healthy_true(client, monkeypatch):
    monkeypatch.setattr(
        task_consumer_service,
        "get_status",
        lambda: _fake_status(
            running=True,
            started_at=datetime.now(timezone.utc),
        ),
    )

    body = client.get("/api/v1/runtime/consumer-status").json()

    assert body["running"] is True
    assert body["healthy"] is True


def test_consumer_stopped_or_unstarted_reports_healthy_false(
    client, monkeypatch
):
    monkeypatch.setattr(
        task_consumer_service,
        "get_status",
        lambda: _fake_status(running=False),
    )

    body = client.get("/api/v1/runtime/consumer-status").json()

    assert body["running"] is False
    assert body["healthy"] is False


def test_consumer_unexpected_exit_reports_not_running_with_error_type(
    client, monkeypatch
):
    monkeypatch.setattr(
        task_consumer_service,
        "get_status",
        lambda: _fake_status(
            running=False,
            last_error_type="RuntimeError",
            stopped_at=datetime.now(timezone.utc),
        ),
    )

    body = client.get("/api/v1/runtime/consumer-status").json()

    assert body["running"] is False
    assert body["healthy"] is False
    assert body["last_error_type"] == "RuntimeError"


def test_consumer_recovered_from_transient_error_still_healthy(
    client, monkeypatch
):
    """
    对应场景 15：一次可恢复的 iteration 错误之后 consumer 仍在
    运行——last_error_type 保留最近一次错误记录，但 healthy 仍是
    true，因为 healthy 只反映 running，不代表"从未出过错"。
    """

    monkeypatch.setattr(
        task_consumer_service,
        "get_status",
        lambda: _fake_status(
            running=True,
            last_error_type="OperationalError",
            processed_count=5,
            completed_count=4,
            failed_count=1,
        ),
    )

    body = client.get("/api/v1/runtime/consumer-status").json()

    assert body["running"] is True
    assert body["healthy"] is True
    assert body["last_error_type"] == "OperationalError"


def test_consumer_status_does_not_leak_unsafe_content(client, monkeypatch):
    monkeypatch.setattr(
        task_consumer_service,
        "get_status",
        lambda: _fake_status(
            running=True,
            current_task_id="TASK-ABC123",
            last_error_type="RuntimeError",
        ),
    )

    body = client.get("/api/v1/runtime/consumer-status").json()

    serialized = str(body)
    assert "payload" not in serialized.lower()
    assert "postgresql://" not in serialized
    assert "traceback" not in serialized.lower()
    # current_task_id 只应该是一个纯 ID 字符串，不是字典/嵌套结构
    assert isinstance(body["current_task_id"], str)


# ---------------------------------------------------------------------------
# 8 / 9 / 10 / 11 / 12. 四个 Runtime endpoint 都包含一致的 consumer 字段
# ---------------------------------------------------------------------------


def test_get_runtime_status_includes_consumer(client):
    body = client.get("/api/v1/runtime/status").json()

    assert "consumer" in body
    assert set(body["consumer"].keys()) == CONSUMER_STATUS_KEYS


def test_post_runtime_start_includes_consumer(client):
    db_snapshot = _snapshot_runtime_state_row()

    try:
        body = client.post("/api/v1/runtime/start").json()
        assert "consumer" in body
        assert set(body["consumer"].keys()) == CONSUMER_STATUS_KEYS
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_post_runtime_stop_includes_consumer(client):
    db_snapshot = _snapshot_runtime_state_row()

    try:
        client.post("/api/v1/runtime/start")
        body = client.post("/api/v1/runtime/stop").json()
        assert "consumer" in body
        assert set(body["consumer"].keys()) == CONSUMER_STATUS_KEYS
    finally:
        _restore_runtime_state_row(db_snapshot)


def test_put_auto_resume_includes_consumer(client):
    db_snapshot = _snapshot_runtime_state_row()

    try:
        body = client.put(
            "/api/v1/runtime/auto-resume", json={"enabled": True}
        ).json()
        assert "consumer" in body
        assert set(body["consumer"].keys()) == CONSUMER_STATUS_KEYS
    finally:
        _restore_runtime_state_row(db_snapshot)


def test_four_endpoints_consumer_schema_is_identical(client):
    db_snapshot = _snapshot_runtime_state_row()

    try:
        status_body = client.get("/api/v1/runtime/status").json()
        start_body = client.post("/api/v1/runtime/start").json()
        stop_body = client.post("/api/v1/runtime/stop").json()
        auto_resume_body = client.put(
            "/api/v1/runtime/auto-resume", json={"enabled": False}
        ).json()

        keys = set(status_body["consumer"].keys())
        assert set(start_body["consumer"].keys()) == keys
        assert set(stop_body["consumer"].keys()) == keys
        assert set(auto_resume_body["consumer"].keys()) == keys
        assert keys == CONSUMER_STATUS_KEYS
    finally:
        _restore_runtime_state_row(db_snapshot)


# ---------------------------------------------------------------------------
# 13. Runtime stopped 但 consumer loop 仍运行
# ---------------------------------------------------------------------------


def test_runtime_stopped_with_consumer_still_running(client, monkeypatch):
    runtime_engine.running = False

    monkeypatch.setattr(
        task_consumer_service,
        "get_status",
        lambda: _fake_status(
            running=True, started_at=datetime.now(timezone.utc)
        ),
    )

    body = client.get("/api/v1/runtime/status").json()

    assert body["running"] is False
    assert body["consumer"]["running"] is True
    assert body["consumer"]["healthy"] is True


# ---------------------------------------------------------------------------
# 16 / 17. OpenAPI
# ---------------------------------------------------------------------------


def test_openapi_includes_consumer_status_route(client):
    schema = client.get("/openapi.json").json()

    assert "/api/v1/runtime/consumer-status" in schema["paths"]

    get_op = schema["paths"]["/api/v1/runtime/consumer-status"]["get"]
    response_schema = get_op["responses"]["200"]["content"][
        "application/json"
    ]["schema"]

    ref = response_schema.get("$ref", "")
    assert "TaskConsumerStatusResponse" in ref


def test_openapi_runtime_status_response_includes_consumer_field(client):
    schema = client.get("/openapi.json").json()

    components = schema["components"]["schemas"]
    assert "TaskConsumerStatusResponse" in components
    assert "RuntimeStatusResponse" in components

    runtime_status_schema = components["RuntimeStatusResponse"]
    assert "consumer" in runtime_status_schema["properties"]

    consumer_prop = runtime_status_schema["properties"]["consumer"]
    ref = consumer_prop.get("$ref") or consumer_prop.get(
        "allOf", [{}]
    )[0].get("$ref", "")
    assert "TaskConsumerStatusResponse" in ref

    consumer_schema = components["TaskConsumerStatusResponse"]
    for field in CONSUMER_STATUS_KEYS:
        assert field in consumer_schema["properties"]

    # description 不应把 current_task_id 描述成严格实时
    current_task_id_desc = consumer_schema["properties"][
        "current_task_id"
    ].get("description", "")
    assert "不保证" in current_task_id_desc or "not guarantee" in (
        current_task_id_desc.lower()
    )

    healthy_desc = consumer_schema["properties"]["healthy"].get(
        "description", ""
    )
    assert len(healthy_desc) > 0
