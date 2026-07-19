"""
阶段 6A：POST /api/v1/integrations/tasks/submit 测试。

覆盖：API Key 鉴权（缺失/错误/未配置/恒定时间比较/不泄露到
日志和响应）、首次提交的 202 语义、幂等去重（相同/不同
source+request_id 组合、completed/failed 任务重复提交不重新
执行/不 requeue、并发请求只创建一条任务且不返回 500）、字段
校验、响应字段安全（不含 payload/context/result/error）、
Runtime stopped/running 下的真实端到端行为，以及确认本轮新增
接口不影响 /tasks/submit、/agents/{name}/run、requeue/mark-failed
既有行为。

测试使用真实 TestClient（触发真实 lifespan），全部 Agent 均为
本文件定义的测试专用 Agent，不调用外部模型/API；EXTERNAL_TASK_API_KEY
通过 monkeypatch.setenv/delenv 在每个测试内设置和自动恢复，不
污染进程环境；所有测试创建的任务按精确 task_id 清理；不对共享的
consumer 单例调用 start/stop/reset_for_tests，只通过真实的
Runtime start/stop 路由和 wake() 与其交互。
"""

import threading
import time
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.agents.base_agent import BaseAgent
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services import task_consumer_service as consumer_module
from app.services.task_consumer_service import task_consumer_service

TEST_MARKER = "EXTERNAL_TASK_API_TEST"
TEST_API_KEY = "external-task-api-test-secret-6a"


class _SuccessAgent(BaseAgent):
    def __init__(self, *args, call_log=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.call_log = call_log if call_log is not None else []

    def think(self, context):
        self.call_log.append(context)
        return {"task": context.get("task")}

    def execute(self, decision):
        return {"executed": True, "task": decision.get("task")}


class _BlockingAgent(BaseAgent):
    def __init__(
        self, *args, started_event, release_event, call_count, **kwargs
    ):
        super().__init__(*args, **kwargs)
        self.started_event = started_event
        self.release_event = release_event
        self.call_count = call_count

    def think(self, context):
        return {"task": context.get("task")}

    def execute(self, decision):
        self.call_count.append(1)
        self.started_event.set()
        self.release_event.wait(timeout=10)
        return {"executed": True}


def _unique_agent_name(suffix):
    return f"{TEST_MARKER}_AGENT_{suffix}_{uuid.uuid4().hex[:6].upper()}"


def _unique_request_id(suffix):
    return f"{TEST_MARKER}-{suffix}-{uuid.uuid4().hex[:8]}"


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


def _get_task_row(task_id):
    db = SessionLocal()

    try:
        return db.query(TaskDB).filter(TaskDB.id == task_id).first()
    finally:
        db.close()


def _poll_until(predicate, timeout=3.0, interval=0.03):
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)

    return predicate()


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

    if memory_snapshot["running"]:
        AgentRegistry.start_all()
    else:
        AgentRegistry.stop_all()

    _restore_runtime_state_row(db_snapshot)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _restore_runtime_running_flag():
    original = runtime_engine.running
    yield
    runtime_engine.running = original


@pytest.fixture
def api_key(monkeypatch):
    """
    为测试设置一个已知的 EXTERNAL_TASK_API_KEY，测试结束后
    monkeypatch 自动恢复原有环境变量（未设置则删除）。
    """

    monkeypatch.setenv("EXTERNAL_TASK_API_KEY", TEST_API_KEY)
    return TEST_API_KEY


@pytest.fixture
def auth_headers(api_key):
    return {"X-Task-API-Key": api_key}


@pytest.fixture
def no_api_key(monkeypatch):
    monkeypatch.delenv("EXTERNAL_TASK_API_KEY", raising=False)


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


@pytest.fixture
def registered_agent():
    created = []

    def _register(agent_cls, suffix="A", **extra_kwargs):
        name = _unique_agent_name(suffix)
        agent = agent_cls(
            name=name,
            role="external_task_submit_test",
            description="external task submit 测试专用 Agent",
            **extra_kwargs,
        )
        AgentRegistry.register(agent)
        created.append(name)
        return name

    yield _register

    for name in created:
        AgentRegistry.unregister(name)


@pytest.fixture
def fast_intervals(monkeypatch):
    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 0.05)
    monkeypatch.setattr(consumer_module, "ERROR_BACKOFF_SECONDS", 0.05)


def _submit(client, body, headers=None):
    return client.post(
        "/api/v1/integrations/tasks/submit", json=body, headers=headers or {}
    )


def _base_body(agent_name, request_id, **overrides):
    body = {
        "request_id": request_id,
        "source": TEST_MARKER,
        "assigned_agent": agent_name,
        "task": f"{TEST_MARKER} task",
        "context": {},
        "priority": "normal",
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# A. 鉴权（1-6）
# ---------------------------------------------------------------------------


def test_auth_correct_key_succeeds(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("auth-ok"))

    response = _submit(client, body, auth_headers)

    assert response.status_code == 202
    cleanup_task_ids.append(response.json()["id"])


def test_auth_missing_key_returns_401(
    client, registered_agent, api_key
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("auth-missing"))

    response = _submit(client, body, headers=None)

    assert response.status_code == 401
    assert "detail" in response.json()


def test_auth_wrong_key_returns_401(
    client, registered_agent, api_key
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("auth-wrong"))

    response = _submit(
        client, body, headers={"X-Task-API-Key": "totally-wrong-key"}
    )

    assert response.status_code == 401


def test_auth_server_not_configured_returns_503(
    client, registered_agent, no_api_key
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("auth-unconfigured"))

    response = _submit(
        client, body, headers={"X-Task-API-Key": "anything"}
    )

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "anything" not in detail


def test_auth_key_not_leaked_in_response(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("auth-no-leak"))

    response = _submit(client, body, auth_headers)
    cleanup_task_ids.append(response.json()["id"])

    assert TEST_API_KEY not in response.text

    wrong_response = _submit(
        client, body, headers={"X-Task-API-Key": "wrong-secret-value"}
    )
    assert "wrong-secret-value" not in wrong_response.text
    assert TEST_API_KEY not in wrong_response.text


def test_auth_uses_constant_time_compare(
    client, registered_agent, auth_headers, monkeypatch
):
    from app.core import external_task_auth as auth_module

    calls = []
    original_compare = auth_module.hmac.compare_digest

    def _spy_compare(a, b):
        calls.append((a, b))
        return original_compare(a, b)

    monkeypatch.setattr(auth_module.hmac, "compare_digest", _spy_compare)

    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("auth-compare"))

    response = client.post(
        "/api/v1/integrations/tasks/submit",
        json=body,
        headers={"X-Task-API-Key": "wrong-value"},
    )

    assert response.status_code == 401
    assert len(calls) == 1
    assert calls[0] == ("wrong-value", TEST_API_KEY)


# ---------------------------------------------------------------------------
# B. 首次提交（7-14）
# ---------------------------------------------------------------------------


def test_first_submit_returns_202_duplicate_false(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("first")
    body = _base_body(agent_name, request_id)

    response = _submit(client, body, auth_headers)

    assert response.status_code == 202
    payload = response.json()
    cleanup_task_ids.append(payload["id"])

    assert payload["duplicate"] is False
    assert payload["status"] == "pending"
    assert payload["request_id"] == request_id
    assert payload["source"] == TEST_MARKER
    assert payload["message"] == "任务已进入执行队列"


def test_first_submit_persists_external_fields_and_payload_mapping(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("persist")
    body = _base_body(
        agent_name,
        request_id,
        task=f"{TEST_MARKER} mapping",
        context={"source": "extra", "note": "keep"},
    )

    response = _submit(client, body, auth_headers)
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)
    assert row.status == "pending"
    assert row.external_source == TEST_MARKER
    assert row.external_request_id == request_id
    assert row.task_type == f"{TEST_MARKER} mapping"
    assert row.payload["task"] == f"{TEST_MARKER} mapping"
    assert row.payload["note"] == "keep"


def test_first_submit_runtime_stopped_stays_pending(
    client, cleanup_task_ids, registered_agent, auth_headers, fast_intervals
):
    agent_name = registered_agent(_SuccessAgent)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/stop")

        body = _base_body(agent_name, _unique_request_id("stopped"))
        response = _submit(client, body, auth_headers)
        assert response.status_code == 202
        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        time.sleep(0.3)

        row = _get_task_row(task_id)
        assert row.status == "pending"

        status = client.get("/api/v1/runtime/status").json()
        assert status["running"] is False, "外部提交不应自动启动 Runtime"
    finally:
        _restore_runtime_state_row(db_snapshot)


def test_first_submit_runtime_running_completes_in_background(
    client, cleanup_task_ids, registered_agent, auth_headers, fast_intervals
):
    call_log = []
    agent_name = registered_agent(_SuccessAgent, call_log=call_log)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        body = _base_body(agent_name, _unique_request_id("running"))
        response = _submit(client, body, auth_headers)
        assert response.status_code == 202
        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        done = _poll_until(
            lambda: _get_task_row(task_id).status == "completed", timeout=3.0
        )
        assert done
        assert len(call_log) == 1
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_first_submit_does_not_call_agent_synchronously(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    agent = AgentRegistry.get(agent_name)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("外部提交不应调用 agent.run()")

    original_run = agent.run
    agent.run = _fail_if_called
    try:
        body = _base_body(agent_name, _unique_request_id("no-sync-run"))
        response = _submit(client, body, auth_headers)
        assert response.status_code == 202
        cleanup_task_ids.append(response.json()["id"])
    finally:
        agent.run = original_run


# ---------------------------------------------------------------------------
# C. 幂等（15-24）
# ---------------------------------------------------------------------------


def test_duplicate_same_source_request_id_returns_same_task(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("dup")
    body = _base_body(agent_name, request_id)

    first = _submit(client, body, auth_headers)
    task_id = first.json()["id"]
    cleanup_task_ids.append(task_id)

    second = _submit(client, body, auth_headers)

    assert second.status_code == 200
    payload = second.json()
    assert payload["duplicate"] is True
    assert payload["id"] == task_id

    row = _get_task_row(task_id)
    assert row is not None


def test_duplicate_does_not_increase_task_count(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("count")
    body = _base_body(agent_name, request_id)

    first = _submit(client, body, auth_headers)
    cleanup_task_ids.append(first.json()["id"])

    for _ in range(3):
        _submit(client, body, auth_headers)

    db = SessionLocal()
    try:
        count = (
            db.query(TaskDB)
            .filter(TaskDB.external_source == TEST_MARKER)
            .filter(TaskDB.external_request_id == request_id)
            .count()
        )
    finally:
        db.close()

    assert count == 1


def test_duplicate_completed_task_not_reexecuted(
    client, cleanup_task_ids, registered_agent, auth_headers, fast_intervals
):
    call_log = []
    agent_name = registered_agent(_SuccessAgent, call_log=call_log)
    request_id = _unique_request_id("completed-resubmit")
    body = _base_body(agent_name, request_id)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        first = _submit(client, body, auth_headers)
        task_id = first.json()["id"]
        cleanup_task_ids.append(task_id)

        done = _poll_until(
            lambda: _get_task_row(task_id).status == "completed", timeout=3.0
        )
        assert done
        assert len(call_log) == 1

        second = _submit(client, body, auth_headers)
        assert second.status_code == 200
        assert second.json()["duplicate"] is True
        assert second.json()["status"] == "completed"

        time.sleep(0.2)
        assert len(call_log) == 1, "重复提交不应重新执行 Agent"
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_duplicate_failed_task_not_requeued(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("failed-resubmit")
    body = _base_body(agent_name, request_id)

    first = _submit(client, body, auth_headers)
    task_id = first.json()["id"]
    cleanup_task_ids.append(task_id)

    db = SessionLocal()
    try:
        row = db.query(TaskDB).filter(TaskDB.id == task_id).first()
        row.status = "failed"
        row.error = "模拟失败"
        db.commit()
    finally:
        db.close()

    second = _submit(client, body, auth_headers)

    assert second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["status"] == "failed"

    row_after = _get_task_row(task_id)
    assert row_after.status == "failed", "重复提交不应把 failed 任务 requeue"


def test_same_request_id_different_source_creates_two_tasks(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("cross-source")

    first = _submit(
        client,
        _base_body(
            agent_name, request_id, source=f"{TEST_MARKER}_SRC_A"
        ),
        auth_headers,
    )
    second = _submit(
        client,
        _base_body(
            agent_name, request_id, source=f"{TEST_MARKER}_SRC_B"
        ),
        auth_headers,
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["id"] != second.json()["id"]
    cleanup_task_ids.extend([first.json()["id"], second.json()["id"]])


def test_different_request_id_same_source_creates_two_tasks(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    source = f"{TEST_MARKER}_SAME_SOURCE_HTTP"

    first = _submit(
        client,
        _base_body(agent_name, _unique_request_id("r1"), source=source),
        auth_headers,
    )
    second = _submit(
        client,
        _base_body(agent_name, _unique_request_id("r2"), source=source),
        auth_headers,
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["id"] != second.json()["id"]
    cleanup_task_ids.extend([first.json()["id"], second.json()["id"]])


def test_concurrent_identical_requests_create_only_one_task_no_500(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    """
    多线程通过真实 HTTP 请求并发提交完全相同的
    (source, request_id)：必须只产生一条任务，且没有任何请求
    返回 500（唯一约束冲突在服务层被捕获处理，不会冒泡成
    数据库异常）。"Agent 最多执行一次" 由这里的"只有一条任务"
    加上 test_task_submit_api.py 已经验证过的"单条任务无论收到
    多少次 wake() 信号都只会被消费者执行一次"共同保证，不在此处
    重复验证执行细节。
    """

    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("concurrent-http")
    body = _base_body(agent_name, request_id)

    responses = []
    errors = []
    lock = threading.Lock()

    def _fire():
        try:
            response = _submit(client, body, auth_headers)
            with lock:
                responses.append(response)
        except Exception as error:
            with lock:
                errors.append(error)

    threads = [threading.Thread(target=_fire) for _ in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert len(responses) == 6

    for response in responses:
        assert response.status_code in (200, 202)

    task_ids = {response.json()["id"] for response in responses}
    assert len(task_ids) == 1
    cleanup_task_ids.append(task_ids.pop())

    duplicate_flags = [response.json()["duplicate"] for response in responses]
    assert duplicate_flags.count(False) == 1
    assert duplicate_flags.count(True) == 5


# ---------------------------------------------------------------------------
# D. 校验与安全（25-34）
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_source", ["", "   ", "x" * 51])
def test_invalid_source_returns_422(
    client, registered_agent, auth_headers, bad_source
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(
        agent_name, _unique_request_id("bad-source"), source=bad_source
    )

    response = _submit(client, body, auth_headers)

    assert response.status_code == 422


@pytest.mark.parametrize("bad_request_id", ["", "   ", "x" * 129])
def test_invalid_request_id_returns_422(
    client, registered_agent, auth_headers, bad_request_id
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, bad_request_id)

    response = _submit(client, body, auth_headers)

    assert response.status_code == 422


def test_unknown_agent_returns_404(client, auth_headers):
    body = _base_body(
        f"{TEST_MARKER}_NONEXISTENT_AGENT", _unique_request_id("noagent")
    )

    response = _submit(client, body, auth_headers)

    assert response.status_code == 404


def test_invalid_priority_returns_422(
    client, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(
        agent_name, _unique_request_id("bad-priority"), priority="urgent"
    )

    response = _submit(client, body, auth_headers)

    assert response.status_code == 422


@pytest.mark.parametrize("bad_context", [["a", "b"], "not-an-object", None])
def test_non_object_context_returns_422(
    client, registered_agent, auth_headers, bad_context
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(
        agent_name, _unique_request_id("bad-context"), context=bad_context
    )

    response = _submit(client, body, auth_headers)

    assert response.status_code == 422


def test_top_level_task_overrides_context_task(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("override")
    body = _base_body(
        agent_name,
        request_id,
        task=f"{TEST_MARKER} real task",
        context={"task": "should be overridden"},
    )

    response = _submit(client, body, auth_headers)
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)
    assert row.payload["task"] == f"{TEST_MARKER} real task"
    assert row.task_type == f"{TEST_MARKER} real task"


def test_database_failure_returns_safe_500(
    client, registered_agent, auth_headers, monkeypatch
):
    from app.services import task_submission_service as service_module

    def _fail_create(*args, **kwargs):
        raise RuntimeError(
            "模拟数据库异常，敏感串 postgresql://n8n:password123@localhost/db"
        )

    monkeypatch.setattr(
        service_module.TaskService,
        "create_external_task",
        staticmethod(_fail_create),
    )

    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("dbfail"))

    response = _submit(client, body, auth_headers)

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert "postgresql://" not in detail
    assert "password123" not in detail
    assert "Traceback" not in detail
    assert "RuntimeError" in detail


def test_wake_failure_still_returns_success(
    client, cleanup_task_ids, registered_agent, auth_headers, monkeypatch
):
    from app.services import task_submission_service as service_module

    def _broken_wake():
        raise RuntimeError("模拟 wake 失败")

    monkeypatch.setattr(
        service_module.task_consumer_service, "wake", _broken_wake
    )

    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(agent_name, _unique_request_id("wakefail-api"))

    response = _submit(client, body, auth_headers)

    assert response.status_code == 202
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)
    assert row.status == "pending"


def test_response_excludes_sensitive_fields(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    body = _base_body(
        agent_name,
        _unique_request_id("safe-response"),
        context={"secret_note": "should not leak"},
    )

    response = _submit(client, body, auth_headers)
    payload = response.json()
    cleanup_task_ids.append(payload["id"])

    assert set(payload.keys()) == {
        "id",
        "request_id",
        "source",
        "status",
        "assigned_agent",
        "task_type",
        "priority",
        "created_at",
        "duplicate",
        "message",
    }
    assert "payload" not in payload
    assert "context" not in payload
    assert "result" not in payload
    assert "error" not in payload
    assert "started_at" not in payload
    assert "completed_at" not in payload


def test_logs_have_no_sensitive_info(
    client, cleanup_task_ids, registered_agent, auth_headers, caplog,
    monkeypatch,
):
    """
    SQLALCHEMY_ECHO 未设置时默认关闭，engine 不再打印完整 SQL 和
    绑定参数，因此这里检查全部捕获到的日志记录（不再需要像修复
    echo=True 泄露问题之前那样只抽查 app.* 命名空间），确认
    payload/context/task 内容、request_id 全文、API Key 均不出现
    在任何日志中。
    """

    monkeypatch.delenv("SQLALCHEMY_ECHO", raising=False)

    agent_name = registered_agent(_SuccessAgent)
    request_id = _unique_request_id("logsafe")
    body = _base_body(
        agent_name, request_id, context={"secret_note": "must not log"}
    )

    with caplog.at_level("DEBUG"):
        response = _submit(client, body, auth_headers)

    cleanup_task_ids.append(response.json()["id"])

    log_text = "\n".join(record.message for record in caplog.records)

    assert caplog.records, "预期至少捕获到一条日志"
    assert TEST_API_KEY not in log_text
    assert "must not log" not in log_text
    assert request_id not in log_text
    assert "postgresql://" not in log_text
    assert "password123" not in log_text


# ---------------------------------------------------------------------------
# E. 兼容性（35-40）
# ---------------------------------------------------------------------------


def test_internal_tasks_submit_still_works(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} internal regression",
        },
    )

    assert response.status_code == 202
    body = response.json()
    cleanup_task_ids.append(body["id"])
    assert body["status"] == "pending"
    assert "payload" not in body


def test_agents_run_endpoint_still_works(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        response = client.post(
            f"/api/v1/agents/{agent_name}/run",
            json={"task": f"{TEST_MARKER} regression check"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        cleanup_task_ids.append(body["task"]["id"])
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_requeue_and_mark_failed_still_work(client, cleanup_task_ids):
    from app.services.task_recovery_action_service import (
        TaskRecoveryActionService,
    )

    db = SessionLocal()
    try:
        task_id = f"EXTAPIREG{uuid.uuid4().hex[:6].upper()}"
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER}_regression",
            assigned_agent=None,
            priority="normal",
            status="running",
            payload={"source": TEST_MARKER},
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
    finally:
        db.close()

    cleanup_task_ids.append(task_id)

    requeue_response = client.post(f"/api/v1/tasks/{task_id}/requeue")
    assert requeue_response.status_code == 200
    assert requeue_response.json()["status"] == "pending"

    mark_failed_response = client.post(
        f"/api/v1/tasks/{task_id}/mark-failed",
        json={"reason": f"{TEST_MARKER} regression reason"},
    )
    assert mark_failed_response.status_code == 200
    assert mark_failed_response.json()["status"] == "failed"


def test_consumer_status_endpoint_still_works(client):
    response = client.get("/api/v1/runtime/status")
    assert response.status_code == 200
    assert "consumer" in response.json()


def test_external_submit_does_not_modify_system_runtime_state(
    client, cleanup_task_ids, registered_agent, auth_headers
):
    agent_name = registered_agent(_SuccessAgent)
    before = _snapshot_runtime_state_row()

    response = _submit(
        client, _base_body(agent_name, _unique_request_id("no-state-change")),
        auth_headers,
    )
    cleanup_task_ids.append(response.json()["id"])

    after = _snapshot_runtime_state_row()
    assert before == after


def test_openapi_external_submit_route_auth_and_models(client):
    schema = client.get("/openapi.json").json()

    assert "/api/v1/integrations/tasks/submit" in schema["paths"]
    post_op = schema["paths"]["/api/v1/integrations/tasks/submit"]["post"]

    # 鉴权用 FastAPI 的 APIKeyHeader 安全模型表达，OpenAPI 会把它
    # 放进 components.securitySchemes + 该操作的 security 字段，
    # 而不是普通的 parameters 列表。
    security_scheme_names = set()
    for requirement in post_op.get("security", []):
        security_scheme_names.update(requirement.keys())

    assert security_scheme_names, "预期该路由声明至少一个 security scheme"

    security_schemes = schema["components"]["securitySchemes"]
    matched_schemes = [
        security_schemes[name]
        for name in security_scheme_names
        if name in security_schemes
    ]
    assert any(
        scheme.get("type") == "apiKey"
        and scheme.get("in") == "header"
        and scheme.get("name") == "X-Task-API-Key"
        for scheme in matched_schemes
    )

    assert "202" in post_op["responses"]
    assert "200" in post_op["responses"]

    request_ref = post_op["requestBody"]["content"]["application/json"][
        "schema"
    ].get("$ref", "")
    assert "ExternalTaskSubmitRequest" in request_ref

    components = schema["components"]["schemas"]
    assert "ExternalTaskSubmitRequest" in components
    assert "ExternalTaskSubmitResponse" in components

    request_props = components["ExternalTaskSubmitRequest"]["properties"]
    for field in (
        "request_id",
        "source",
        "assigned_agent",
        "task",
        "context",
        "priority",
    ):
        assert field in request_props

    response_props = components["ExternalTaskSubmitResponse"]["properties"]
    for field in (
        "id",
        "request_id",
        "source",
        "status",
        "assigned_agent",
        "task_type",
        "priority",
        "created_at",
        "duplicate",
        "message",
    ):
        assert field in response_props

    schema_text = str(schema)
    assert TEST_API_KEY not in schema_text
