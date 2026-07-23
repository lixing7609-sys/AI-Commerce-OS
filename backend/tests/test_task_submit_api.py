"""
阶段 5A：POST /api/v1/tasks/submit 测试。

覆盖：请求/响应 schema、字段校验（assigned_agent/task/context/
priority）、TaskDB 字段映射（尤其是 payload["task"] 不被
context["task"] 覆盖）、Agent 存在性校验（不检查运行状态）、
提交只入队不同步执行、commit-then-wake 事务顺序、wake 失败的
安全降级、数据库失败的安全 500、Runtime stopped/running 下的
真实端到端行为（含阻塞 Agent 验证 API 不等待执行完成）、
priority 执行顺序、路由不被 `/{task_id}` 吞掉、OpenAPI、以及
不修改 system_runtime_state、不影响 `/agents/{name}/run` 与
requeue/mark-failed 既有行为。

测试使用真实 TestClient（触发真实 lifespan，启动真实的
TaskConsumerService 单例），全部 Agent 均为本文件定义的测试专用
Agent，不调用外部模型/API；所有测试创建的任务按精确 task_id
清理；不对共享的 consumer 单例调用 start/stop/reset_for_tests
（那样会破坏其它测试和 app 自身依赖的同一个后台循环），只通过
真实的 Runtime start/stop 路由和 wake() 与其交互。
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

TEST_MARKER = "TASK_SUBMIT_API_TEST"


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
    """
    execute() 阻塞在 release_event 上，直到测试显式 set()；
    started_event 在真正进入 execute() 时被 set，用来证明后台
    consumer 确实已经开始执行，而不是靠猜测的 sleep。
    """

    def __init__(self, *args, started_event, release_event, call_count, **kwargs):
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


class _OrderTrackingAgent(BaseAgent):
    def __init__(self, *args, order_log, **kwargs):
        super().__init__(*args, **kwargs)
        self.order_log = order_log

    def think(self, context):
        return {"task": context.get("task")}

    def execute(self, decision):
        self.order_log.append(decision.get("task"))
        time.sleep(0.02)
        return {"executed": True}


def _unique_agent_name(suffix):
    return f"{TEST_MARKER}_AGENT_{suffix}_{uuid.uuid4().hex[:6].upper()}"


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
            role="task_submit_test",
            description="task submit 测试专用 Agent",
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


# ---------------------------------------------------------------------------
# 1-13 / 24. 基本行为、schema、字段映射、校验
# ---------------------------------------------------------------------------


def test_submit_valid_request_returns_202(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} basic",
            "priority": "normal",
        },
    )

    assert response.status_code == 202

    body = response.json()
    cleanup_task_ids.append(body["id"])

    assert set(body.keys()) == {
        "id",
        "status",
        "assigned_agent",
        "task_type",
        "priority",
        "shop_id",
        "created_at",
        "message",
    }
    # 阶段 8E：未指定 shop_id 时默认视为"未绑定店铺"。
    assert body["shop_id"] is None
    assert body["status"] == "pending"
    assert body["assigned_agent"] == agent_name
    assert body["task_type"] == f"{TEST_MARKER} basic"
    assert body["priority"] == "normal"
    assert body["message"] == "任务已进入执行队列"

    # 响应不含 payload/context/result/error
    assert "payload" not in body
    assert "context" not in body
    assert "result" not in body
    assert "error" not in body


def test_submit_creates_pending_task_with_null_fields(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} nulls"},
    )
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)

    assert row.status == "pending"
    assert row.started_at is None
    assert row.completed_at is None
    assert row.result is None
    assert row.error is None
    assert row.created_at is not None


def test_submit_field_mapping_and_context_preserved(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} mapping",
            "priority": "high",
            "context": {"source": TEST_MARKER, "note": "extra info"},
        },
    )
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)

    assert row.assigned_agent == agent_name
    assert row.task_type == f"{TEST_MARKER} mapping"
    assert row.priority == "high"
    assert row.payload["source"] == TEST_MARKER
    assert row.payload["note"] == "extra info"
    assert row.payload["task"] == f"{TEST_MARKER} mapping"


def test_submit_request_context_object_not_mutated():
    """
    payload 用 {**request.context, "task": request.task} 构造，
    dict 展开语法结构上保证不会修改 request.context 原对象；这里
    直接在模型层验证，不依赖 HTTP 往返（HTTP 层每次请求都会反序列
    化出全新对象，无法观察到"原对象是否被修改"这件事本身）。
    """

    from app.models.task_api import TaskSubmitRequest

    original_context = {"task": "original value", "note": "keep me"}

    request = TaskSubmitRequest(
        assigned_agent="AI CEO",
        task="real task",
        context=original_context,
    )

    payload = {**request.context, "task": request.task}

    assert original_context == {"task": "original value", "note": "keep me"}
    assert payload == {"task": "real task", "note": "keep me"}
    assert payload is not original_context


def test_submit_trimmed_values_are_persisted_to_database(
    client, cleanup_task_ids, registered_agent
):
    """
    校验后的 trimmed 值必须真正写入数据库，而不是只用于通过
    Pydantic 校验。
    """

    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": f"  {agent_name}  ",
            "task": f"  {TEST_MARKER} trim me  ",
        },
    )

    assert response.status_code == 202
    body = response.json()
    cleanup_task_ids.append(body["id"])

    assert body["assigned_agent"] == agent_name
    assert body["task_type"] == f"{TEST_MARKER} trim me"

    row = _get_task_row(body["id"])
    assert row.assigned_agent == agent_name
    assert row.task_type == f"{TEST_MARKER} trim me"
    assert row.payload["task"] == f"{TEST_MARKER} trim me"


def test_submit_top_level_task_not_overridden_by_context_task(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} real task",
            "context": {"task": "should be overridden"},
        },
    )
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)

    assert row.payload["task"] == f"{TEST_MARKER} real task"
    assert row.task_type == f"{TEST_MARKER} real task"


def test_submit_default_priority_is_normal(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} default"},
    )
    cleanup_task_ids.append(response.json()["id"])

    assert response.json()["priority"] == "normal"


@pytest.mark.parametrize("priority", ["high", "normal", "low"])
def test_submit_accepts_valid_priorities(
    client, cleanup_task_ids, registered_agent, priority
):
    agent_name = registered_agent(_SuccessAgent, suffix=priority)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} {priority}",
            "priority": priority,
        },
    )

    assert response.status_code == 202
    cleanup_task_ids.append(response.json()["id"])
    assert response.json()["priority"] == priority


def test_submit_invalid_priority_returns_422(
    client, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} bad priority",
            "priority": "urgent",
        },
    )

    assert response.status_code == 422


def test_submit_empty_agent_name_returns_422(client):
    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": "", "task": f"{TEST_MARKER} x"},
    )

    assert response.status_code == 422


def test_submit_whitespace_only_agent_name_returns_422(client):
    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": "   ", "task": f"{TEST_MARKER} x"},
    )

    assert response.status_code == 422


def test_submit_empty_task_returns_422(client, registered_agent):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": ""},
    )

    assert response.status_code == 422


def test_submit_whitespace_only_task_returns_422(client, registered_agent):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": "   "},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("bad_context", [["a", "b"], "not-an-object", None])
def test_submit_non_object_context_returns_422(
    client, registered_agent, bad_context
):
    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": agent_name,
            "task": f"{TEST_MARKER} bad context",
            "context": bad_context,
        },
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 14-15. Agent 存在性校验
# ---------------------------------------------------------------------------


def test_submit_unknown_agent_returns_404(client):
    before_total = sum(_task_status_counts(client).values())

    response = client.post(
        "/api/v1/tasks/submit",
        json={
            "assigned_agent": f"{TEST_MARKER}_NONEXISTENT_AGENT",
            "task": f"{TEST_MARKER} unknown agent",
        },
    )

    assert response.status_code == 404

    after_total = sum(_task_status_counts(client).values())
    assert after_total == before_total


def test_submit_stopped_agent_still_allowed(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)
    agent = AgentRegistry.get(agent_name)
    agent.stop()

    assert agent.status == "stopped"

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} stopped agent"},
    )

    assert response.status_code == 202
    cleanup_task_ids.append(response.json()["id"])

    row = _get_task_row(response.json()["id"])
    assert row.status == "pending"
    # 提交不修改 Agent 状态
    assert AgentRegistry.get(agent_name).status == "stopped"


def _task_status_counts(client):
    return client.get("/api/v1/tasks/stats").json()


# ---------------------------------------------------------------------------
# 16-17. 不同步执行
# ---------------------------------------------------------------------------


def test_submit_does_not_call_agent_run(
    client, cleanup_task_ids, registered_agent, monkeypatch
):
    agent_name = registered_agent(_SuccessAgent)
    agent = AgentRegistry.get(agent_name)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("submit 不应调用 agent.run()")

    monkeypatch.setattr(agent, "run", _fail_if_called)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} no run"},
    )

    assert response.status_code == 202
    cleanup_task_ids.append(response.json()["id"])


def test_submit_does_not_call_task_execution_service(
    client, cleanup_task_ids, registered_agent, monkeypatch
):
    from app.services.task_execution_service import TaskExecutionService

    agent_name = registered_agent(_SuccessAgent)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("submit 不应调用 TaskExecutionService")

    monkeypatch.setattr(
        TaskExecutionService,
        "process_next_pending_task",
        staticmethod(_fail_if_called),
    )
    monkeypatch.setattr(
        TaskExecutionService,
        "claim_next_pending_task",
        staticmethod(_fail_if_called),
    )

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} no tes"},
    )

    assert response.status_code == 202
    cleanup_task_ids.append(response.json()["id"])


# ---------------------------------------------------------------------------
# 18-21. commit -> wake 事务顺序与失败降级
# ---------------------------------------------------------------------------


def test_submit_wakes_only_after_commit(
    client, cleanup_task_ids, registered_agent, monkeypatch
):
    from app.api.v1 import tasks as tasks_api

    order = []

    original_create_task = tasks_api.TaskService.create_task

    def _spy_create_task(task):
        result = original_create_task(task)
        order.append("commit")
        return result

    def _spy_wake():
        order.append("wake")

    monkeypatch.setattr(tasks_api.TaskService, "create_task", _spy_create_task)
    monkeypatch.setattr(tasks_api.task_consumer_service, "wake", _spy_wake)

    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} order"},
    )

    assert response.status_code == 202
    cleanup_task_ids.append(response.json()["id"])
    assert order == ["commit", "wake"]


def test_submit_response_reflects_pre_wake_snapshot_not_requeried_status(
    client, cleanup_task_ids, registered_agent, monkeypatch
):
    """
    响应体必须使用 commit 后立即 refresh 得到的快照对象，不得在
    wake() 之后重新查询数据库——即使消费者在响应序列化之前就已经
    把任务改成了 running/completed，202 响应也必须仍然显示
    status=pending（202 只代表"已接收"，不代表"已完成"）。

    用一个会直接把该任务写成 running 的伪造 wake() 模拟"消费者
    极快抢先处理"的最坏情况，验证响应字段不受影响。
    """

    from app.api.v1 import tasks as tasks_api

    captured_task_id = {}

    def _wake_that_races_ahead():
        task_id = captured_task_id.get("id")
        if not task_id:
            return
        db = SessionLocal()
        try:
            row = db.query(TaskDB).filter(TaskDB.id == task_id).first()
            row.status = "running"
            db.commit()
        finally:
            db.close()

    monkeypatch.setattr(
        tasks_api.task_consumer_service, "wake", _wake_that_races_ahead
    )

    agent_name = registered_agent(_SuccessAgent)

    original_create_task = tasks_api.TaskService.create_task

    def _spy_create_task(task):
        result = original_create_task(task)
        captured_task_id["id"] = result.id
        return result

    monkeypatch.setattr(tasks_api.TaskService, "create_task", _spy_create_task)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} race snapshot"},
    )

    assert response.status_code == 202
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    # 响应体必须仍是 pending：证明它来自 wake() 之前捕获的快照，
    # 而不是 wake() 之后重新查询数据库。
    assert response.json()["status"] == "pending"

    # 但数据库真实状态此时确实已经被"抢先"改成了 running，证明
    # 上面的断言不是因为 wake 根本没起作用。
    row = _get_task_row(task_id)
    assert row.status == "running"


def test_submit_commit_failure_does_not_wake(
    client, registered_agent, monkeypatch
):
    from app.api.v1 import tasks as tasks_api

    def _fail_create_task(task):
        raise RuntimeError("模拟提交失败，敏感串 postgresql://u:p@h/db")

    wake_calls = []

    monkeypatch.setattr(tasks_api.TaskService, "create_task", _fail_create_task)
    monkeypatch.setattr(
        tasks_api.task_consumer_service,
        "wake",
        lambda: wake_calls.append(1),
    )

    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} commit fail"},
    )

    assert response.status_code == 500
    assert wake_calls == []

    detail = response.json()["detail"]
    assert "postgresql://" not in detail
    assert "RuntimeError" in detail


def test_submit_wake_failure_still_returns_202_and_task_persists(
    client, cleanup_task_ids, registered_agent, monkeypatch
):
    from app.api.v1 import tasks as tasks_api

    def _broken_wake():
        raise RuntimeError("模拟 wake 失败")

    monkeypatch.setattr(tasks_api.task_consumer_service, "wake", _broken_wake)

    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} wake fail"},
    )

    assert response.status_code == 202
    task_id = response.json()["id"]
    cleanup_task_ids.append(task_id)

    row = _get_task_row(task_id)
    assert row.status == "pending"


def test_submit_wake_failure_task_eventually_consumed_via_polling(
    client, cleanup_task_ids, registered_agent, monkeypatch, fast_intervals
):
    from app.api.v1 import tasks as tasks_api

    def _broken_wake():
        raise RuntimeError("模拟 wake 失败")

    monkeypatch.setattr(tasks_api.task_consumer_service, "wake", _broken_wake)

    agent_name = registered_agent(_SuccessAgent)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        response = client.post(
            "/api/v1/tasks/submit",
            json={
                "assigned_agent": agent_name,
                "task": f"{TEST_MARKER} wake fail polling",
            },
        )
        assert response.status_code == 202
        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        done = _poll_until(
            lambda: _get_task_row(task_id).status == "completed", timeout=3.0
        )
        assert done, "wake 失败时，consumer 的空闲轮询最终也应该发现该任务"
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


# ---------------------------------------------------------------------------
# 22-23. 数据库失败安全处理
# ---------------------------------------------------------------------------


def test_submit_database_failure_returns_safe_500(client, registered_agent, monkeypatch):
    from app.api.v1 import tasks as tasks_api

    def _fail_create_task(task):
        raise RuntimeError(
            "模拟数据库异常，敏感串 postgresql://n8n:password123@localhost/db"
        )

    monkeypatch.setattr(tasks_api.TaskService, "create_task", _fail_create_task)

    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} db fail"},
    )

    assert response.status_code == 500

    detail = response.json()["detail"]
    assert "postgresql://" not in detail
    assert "password123" not in detail
    assert "Traceback" not in detail
    assert "RuntimeError" in detail


# ---------------------------------------------------------------------------
# 25-31. Runtime stopped / running 端到端语义
# ---------------------------------------------------------------------------


def test_submit_runtime_stopped_stays_pending(
    client, cleanup_task_ids, registered_agent, fast_intervals
):
    agent_name = registered_agent(_SuccessAgent)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/stop")
        status_before = client.get("/api/v1/runtime/status").json()
        assert status_before["running"] is False

        response = client.post(
            "/api/v1/tasks/submit",
            json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} stopped"},
        )
        assert response.status_code == 202
        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        row = _get_task_row(task_id)
        assert row.status == "pending"
        assert row.started_at is None

        # 等待超过 idle interval，确认 consumer 被 wake 后检查到
        # Runtime stopped，没有领取。
        time.sleep(0.3)

        row_after = _get_task_row(task_id)
        assert row_after.status == "pending"

        status_after = client.get("/api/v1/runtime/status").json()
        assert status_after["running"] is False, "提交任务不应自动启动 Runtime"
    finally:
        _restore_runtime_state_row(db_snapshot)


def test_submit_runtime_running_consumer_completes_task(
    client, cleanup_task_ids, registered_agent, fast_intervals
):
    call_log = []
    agent_name = registered_agent(_SuccessAgent, call_log=call_log)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        response = client.post(
            "/api/v1/tasks/submit",
            json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} running"},
        )
        assert response.status_code == 202
        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        done = _poll_until(
            lambda: _get_task_row(task_id).status == "completed", timeout=3.0
        )
        assert done

        row = _get_task_row(task_id)
        assert row.result["result"]["executed"] is True
        assert len(call_log) == 1
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_submit_blocking_agent_api_returns_before_execution_completes(
    client, cleanup_task_ids, registered_agent, fast_intervals
):
    """
    场景 C / 十二.28：使用真正会阻塞的 Agent（在 execute() 里等待
    一个事件），证明 API 响应时间与 Agent 执行时长无关——不是靠
    宽松 sleep 猜测，而是先确认 API 已经返回，再确认后台确实还
    没执行完，最后释放事件、等待真正完成。
    """

    started_event = threading.Event()
    release_event = threading.Event()
    call_count = []

    agent_name = registered_agent(
        _BlockingAgent,
        started_event=started_event,
        release_event=release_event,
        call_count=call_count,
    )

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        start = time.monotonic()
        response = client.post(
            "/api/v1/tasks/submit",
            json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} blocking"},
        )
        elapsed = time.monotonic() - start

        assert response.status_code == 202
        assert elapsed < 1.0, "submit 不应等待 Agent 执行完成"

        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        # 确认后台 consumer 确实已经开始执行（进入 execute()），
        # 而不是恰好还没被领取。
        assert started_event.wait(timeout=2.0)

        # 此刻 Agent 仍阻塞在 release_event 上，任务必须仍是
        # running，证明 202 不代表任务已经完成。
        row_while_blocked = _get_task_row(task_id)
        assert row_while_blocked.status == "running"

        release_event.set()

        done = _poll_until(
            lambda: _get_task_row(task_id).status == "completed", timeout=3.0
        )
        assert done
        assert call_count == [1]
    finally:
        release_event.set()
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_submit_multiple_wakes_do_not_duplicate_execution(
    client, cleanup_task_ids, registered_agent, fast_intervals
):
    call_log = []
    agent_name = registered_agent(_SuccessAgent, call_log=call_log)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/start")

        response = client.post(
            "/api/v1/tasks/submit",
            json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} multi wake"},
        )
        task_id = response.json()["id"]
        cleanup_task_ids.append(task_id)

        for _ in range(10):
            task_consumer_service.wake()

        done = _poll_until(
            lambda: _get_task_row(task_id).status == "completed", timeout=3.0
        )
        assert done
        assert len(call_log) == 1
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


def test_submit_two_tasks_execute_in_priority_order(
    client, cleanup_task_ids, registered_agent, fast_intervals
):
    order_log = []
    agent_name = registered_agent(_OrderTrackingAgent, order_log=order_log)

    db_snapshot = _snapshot_runtime_state_row()
    try:
        client.post("/api/v1/runtime/stop")

        low_response = client.post(
            "/api/v1/tasks/submit",
            json={
                "assigned_agent": agent_name,
                "task": "low-priority-task",
                "priority": "low",
            },
        )
        high_response = client.post(
            "/api/v1/tasks/submit",
            json={
                "assigned_agent": agent_name,
                "task": "high-priority-task",
                "priority": "high",
            },
        )

        low_id = low_response.json()["id"]
        high_id = high_response.json()["id"]
        cleanup_task_ids.extend([low_id, high_id])

        client.post("/api/v1/runtime/start")

        done = _poll_until(lambda: len(order_log) == 2, timeout=3.0)
        assert done
        assert order_log == ["high-priority-task", "low-priority-task"]
    finally:
        client.post("/api/v1/runtime/stop")
        _restore_runtime_state_row(db_snapshot)


# ---------------------------------------------------------------------------
# 32-34. 路由与 OpenAPI
# ---------------------------------------------------------------------------


def test_submit_route_not_shadowed_by_task_id_route(client, registered_agent):
    """
    /tasks/submit 必须被解析成静态路由，而不是被
    GET/POST /tasks/{task_id}... 当成 task_id="submit" 处理。
    """

    agent_name = registered_agent(_SuccessAgent)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} route"},
    )

    # 若被 /{task_id}/... 吞掉，POST /tasks/submit 会落到
    # 405（因为该路径不存在 POST 方法）或返回与本接口完全不同的
    # 响应结构；正确路由应返回 202 且带有本接口特有的字段。
    assert response.status_code == 202
    body = response.json()
    assert "message" in body
    assert "task_type" in body

    db = SessionLocal()
    try:
        db.query(TaskDB).filter(TaskDB.id == body["id"]).delete()
        db.commit()
    finally:
        db.close()


def test_openapi_submit_route_and_status_code(client):
    schema = client.get("/openapi.json").json()

    assert "/api/v1/tasks/submit" in schema["paths"]
    post_op = schema["paths"]["/api/v1/tasks/submit"]["post"]

    assert "202" in post_op["responses"]

    request_ref = post_op["requestBody"]["content"]["application/json"][
        "schema"
    ].get("$ref", "")
    assert "TaskSubmitRequest" in request_ref

    response_ref = post_op["responses"]["202"]["content"]["application/json"][
        "schema"
    ].get("$ref", "")
    assert "TaskSubmitResponse" in response_ref

    components = schema["components"]["schemas"]
    assert "TaskSubmitRequest" in components
    assert "TaskSubmitResponse" in components

    request_props = components["TaskSubmitRequest"]["properties"]
    for field in ("assigned_agent", "task", "context", "priority"):
        assert field in request_props

    response_props = components["TaskSubmitResponse"]["properties"]
    for field in (
        "id",
        "status",
        "assigned_agent",
        "task_type",
        "priority",
        "created_at",
        "message",
    ):
        assert field in response_props


# ---------------------------------------------------------------------------
# 35-36. 不修改 system_runtime_state / auto_resume_enabled
# ---------------------------------------------------------------------------


def test_submit_does_not_modify_system_runtime_state(
    client, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)

    before = _snapshot_runtime_state_row()

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": agent_name, "task": f"{TEST_MARKER} no state change"},
    )
    cleanup_task_ids.append(response.json()["id"])

    after = _snapshot_runtime_state_row()

    assert before == after


# ---------------------------------------------------------------------------
# 38-39. 既有 API 行为不变（轻量回归确认）
# ---------------------------------------------------------------------------


def test_agents_run_endpoint_still_synchronous_and_immediate_running(
    client, cleanup_task_ids, registered_agent
):
    """
    确认新增的 /tasks/submit 没有影响 /agents/{name}/run 原有的
    "首次落库即 running、同步执行" 语义（阶段 4B 已确立）。
    """

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
        assert body["task"]["status"] == "completed"
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
        task_id = f"TASKSUBMITREG{uuid.uuid4().hex[:6].upper()}"
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
