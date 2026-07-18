"""
TaskConsumerService（阶段 4B：随 Runtime 启停的后台 pending 任务
消费者循环）测试。

覆盖：单消费者幂等启停、Runtime 前置条件、串行处理与 priority
顺序继承、空闲等待与主动唤醒、requeue 唤醒、异常与数据库临时
故障的退避恢复、graceful stop（不强杀正在执行的同步任务）、
lifespan 集成（readiness 失败/startup recovery 成功与否/shutdown
无残留任务）、`/agents/{name}/run` 不被消费者抢任务的真实并发
验证、以及不重复调用 RuntimeRecoveryService、不写 heartbeat、
不额外修改 system_runtime_state、日志不泄露敏感内容等安全边界。

本项目未安装 pytest-asyncio，所有异步逻辑通过在同步测试函数内
用 asyncio.run() 包裹一个内部 async 函数驱动，确保消费者自身的
asyncio.Task 与其等待的事件循环全程绑定在同一个 asyncio.run()
调用内，避免跨 event loop 的 Task/Future 归属问题。

Agent 执行全部使用本文件定义的测试专用 Agent；所有测试创建的
任务在测试结束后按精确 task_id 删除；每个测试结束后都会强制
停止并重置 task_consumer_service，避免污染后续测试或真实业务
数据。
"""

import asyncio
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

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
from app.services.database_readiness_service import (
    DatabaseReadinessError,
    DatabaseReadinessService,
)
from app.services.runtime_recovery_service import RuntimeRecoveryService
from app.services.runtime_state_service import RuntimeStateService
from app.services.task_consumer_service import task_consumer_service
from app.services.task_execution_service import TaskExecutionService
from app.services.task_recovery_action_service import TaskRecoveryActionService

TEST_MARKER = "TASK_CONSUMER_TEST_MARKER"
TEST_TASK_TYPE = f"{TEST_MARKER}_task_type"


class _SuccessAgent(BaseAgent):
    def think(self, context):
        return {"ok": True, "task": context.get("task")}

    def execute(self, decision):
        return {"executed": True, "task": decision.get("task")}


class _OverlapDetectingAgent(BaseAgent):
    """
    用共享锁检测是否有两次 execute() 真正并发重叠执行——若消费者
    错误地并行调用了两个 Agent，这里会记录一次重叠。
    """

    def __init__(self, *args, lock, overlap_events, delay=0.05, **kwargs):
        super().__init__(*args, **kwargs)
        self.lock = lock
        self.overlap_events = overlap_events
        self.delay = delay

    def think(self, context):
        return {"task": context.get("task")}

    def execute(self, decision):
        acquired = self.lock.acquire(blocking=False)

        if not acquired:
            self.overlap_events.append(decision.get("task"))
            return {"executed": True, "overlap": True}

        try:
            time.sleep(self.delay)
        finally:
            self.lock.release()

        return {"executed": True, "overlap": False}


def _unique_agent_name(suffix):
    return f"{TEST_MARKER}_AGENT_{suffix}_{uuid.uuid4().hex[:6].upper()}"


def _make_task_id():
    return f"TASKCONSUME{uuid.uuid4().hex[:9].upper()}"


def _insert_task(
    status="pending",
    assigned_agent=None,
    priority="normal",
    payload=None,
    created_at=None,
    task_type=TEST_TASK_TYPE,
    task_id=None,
):
    db = SessionLocal()

    try:
        row = TaskDB(
            id=task_id or _make_task_id(),
            task_type=task_type,
            assigned_agent=assigned_agent,
            priority=priority,
            status=status,
            payload=payload if payload is not None else {"source": TEST_MARKER},
            created_at=created_at or datetime.now(timezone.utc),
        )

        db.add(row)
        db.commit()

        return row.id

    finally:
        db.close()


def _get_task_row(task_id):
    db = SessionLocal()

    try:
        return db.query(TaskDB).filter(TaskDB.id == task_id).first()

    finally:
        db.close()


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
            role="task_consumer_test",
            description="TaskConsumerService 测试专用 Agent",
            **extra_kwargs,
        )
        AgentRegistry.register(agent)
        created.append(name)
        return name

    yield _register

    for name in created:
        AgentRegistry.unregister(name)


@pytest.fixture(autouse=True)
def _preserve_runtime_memory_state():
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    yield

    runtime_engine.running = memory_snapshot["running"]
    runtime_engine.started_at = memory_snapshot["started_at"]
    runtime_engine.stopped_at = memory_snapshot["stopped_at"]


@pytest.fixture(autouse=True)
def _reset_consumer_after_test():
    yield
    # 只在消费者确实已经停止时才清空内部状态。若消费者当前仍在
    # 运行（例如由本文件末尾模块级 http_client fixture 通过真实
    # lifespan 启动、尚未到该 fixture 自己的 teardown 时机），
    # 这里绝不能强行清空 _task/_loop 引用——那样会让真正持有该
    # asyncio.Task 的 lifespan finally 块里的 stop() 变成静默
    # no-op（因为 self._task 已经被置空），导致那个任务真正泄漏、
    # 永远不会被 cancel/await。
    if not task_consumer_service.is_running():
        task_consumer_service.reset_for_tests()


@pytest.fixture
def fast_intervals(monkeypatch):
    """
    把空闲轮询、异常退避、shutdown 超时都调成很小的值，
    测试不需要真实等待 2/2/10 秒。
    """

    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 0.05)
    monkeypatch.setattr(consumer_module, "ERROR_BACKOFF_SECONDS", 0.05)
    monkeypatch.setattr(consumer_module, "SHUTDOWN_TIMEOUT_SECONDS", 1.0)


def run_with_consumer(async_body, timeout=2.0):
    """
    在同一个 asyncio.run() 调用（同一个事件循环）内启动消费者、
    执行测试体、再停止消费者——避免消费者的 asyncio.Task 跨
    event loop 归属问题。
    """

    async def _wrapper():
        task_consumer_service.start()
        try:
            await async_body()
        finally:
            await task_consumer_service.stop(timeout=timeout)

    asyncio.run(_wrapper())


async def _poll_until(predicate, timeout=2.0, interval=0.02):
    deadline = time.monotonic() + timeout

    while time.monotonic() < deadline:
        if predicate():
            return True
        await asyncio.sleep(interval)

    return predicate()


# ---------------------------------------------------------------------------
# 1 / 2 / 12. 生命周期幂等性
# ---------------------------------------------------------------------------


def test_start_is_idempotent_creates_only_one_task(fast_intervals):
    async def body():
        first_task = task_consumer_service._task

        task_consumer_service.start()
        task_consumer_service.start()

        assert task_consumer_service._task is first_task
        assert task_consumer_service.is_running() is True

    run_with_consumer(body)


def test_stop_is_idempotent(fast_intervals):
    async def _run():
        task_consumer_service.start()
        await task_consumer_service.stop(timeout=1.0)
        assert task_consumer_service.is_running() is False

        # 再次 stop：task 已经是 None，应直接安全返回，不抛异常。
        await task_consumer_service.stop(timeout=1.0)
        assert task_consumer_service.is_running() is False

    asyncio.run(_run())


def test_runtime_restart_reuses_same_consumer_task(fast_intervals):
    async def body():
        first_task = task_consumer_service._task

        runtime_engine.running = True
        task_consumer_service.wake()
        await asyncio.sleep(0.1)

        runtime_engine.running = False
        task_consumer_service.wake()
        await asyncio.sleep(0.1)

        runtime_engine.running = True
        task_consumer_service.start()  # 应为幂等 no-op
        task_consumer_service.wake()
        await asyncio.sleep(0.1)

        assert task_consumer_service._task is first_task

    run_with_consumer(body)


# ---------------------------------------------------------------------------
# 事件循环归属 / 线程安全 / 意外退出（本轮新增）
# ---------------------------------------------------------------------------


def test_wake_from_real_worker_thread_reaches_main_loop(
    monkeypatch, cleanup_task_ids, registered_agent
):
    """
    用真实 threading.Thread（不是同一个协程直接同步调用）调用
    wake()，模拟 FastAPI 把同步的 Runtime start/stop 路由放到
    线程池工作线程执行的真实场景，证明 call_soon_threadsafe 确实
    能从事件循环之外的线程唤醒主循环。

    idle 间隔调大（不用 fast_intervals 那组极小值），只有真正被
    唤醒才能在超时窗口内及时处理，避免误判为"碰巧下一次轮询也
    发现了"。
    """

    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 5.0)
    monkeypatch.setattr(consumer_module, "ERROR_BACKOFF_SECONDS", 0.05)

    agent_name = registered_agent(_SuccessAgent)

    async def body():
        runtime_engine.running = True

        task_id = _insert_task(status="pending", assigned_agent=agent_name)
        cleanup_task_ids.append(task_id)

        def _wake_from_thread():
            task_consumer_service.wake()

        thread = threading.Thread(target=_wake_from_thread)
        thread.start()
        thread.join(timeout=2)

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed",
            timeout=1.5,
        )
        assert done

    run_with_consumer(body)


def test_manual_runtime_start_never_calls_consumer_start(
    fast_intervals, monkeypatch
):
    """
    直接调用 runtime.py 的 start_runtime()（同步函数，代表 FastAPI
    线程池工作线程的真实执行环境），验证它只调用
    task_consumer_service.wake()，绝不调用 .start()——因为 .start()
    内部会用 asyncio.get_running_loop()，在没有运行中事件循环的
    线程里调用会直接抛出 RuntimeError。
    """

    from app.api.v1 import runtime as runtime_api

    start_calls = []
    wake_calls = []

    monkeypatch.setattr(
        task_consumer_service,
        "start",
        lambda: start_calls.append(1),
    )
    monkeypatch.setattr(
        task_consumer_service,
        "wake",
        lambda: wake_calls.append(1),
    )
    monkeypatch.setattr(task_consumer_service, "is_running", lambda: True)

    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    try:
        runtime_api.start_runtime()
    finally:
        runtime_engine.running = memory_snapshot["running"]
        runtime_engine.started_at = memory_snapshot["started_at"]
        runtime_engine.stopped_at = memory_snapshot["stopped_at"]
        _restore_runtime_state_row(db_snapshot)

    assert start_calls == []
    assert wake_calls == [1]


def test_start_called_without_running_loop_raises(fast_intervals):
    """
    直接在没有事件循环的普通同步上下文调用 start()，必须立即
    抛出 RuntimeError（而不是静默创建第二个事件循环，也不是
    静默失败），这是 runtime.py 明确不在线程池路由里调用它的
    原因。
    """

    task_consumer_service.reset_for_tests()

    with pytest.raises(RuntimeError):
        task_consumer_service.start()


def test_wake_before_any_start_is_safe_noop():
    task_consumer_service.reset_for_tests()
    task_consumer_service.wake()  # 不应抛出异常


def test_wake_after_loop_closed_does_not_raise(fast_intervals):
    async def _run():
        task_consumer_service.start()
        await task_consumer_service.stop(timeout=1.0)

    asyncio.run(_run())

    # asyncio.run() 已经关闭了它创建的事件循环；stop() 的 finally
    # 已经把 _loop 清空为 None，wake() 应该走"未绑定，安全返回"
    # 分支，不应该尝试对一个已关闭的 loop 调用
    # call_soon_threadsafe。
    assert task_consumer_service._loop is None
    task_consumer_service.wake()  # 不应抛出异常


def test_stop_clears_task_loop_wake_event_stop_requested(fast_intervals):
    async def _run():
        task_consumer_service.start()
        assert task_consumer_service._loop is not None
        assert task_consumer_service._wake_event is not None

        await task_consumer_service.stop(timeout=1.0)

        assert task_consumer_service._task is None
        assert task_consumer_service._loop is None
        assert task_consumer_service._wake_event is None
        assert task_consumer_service._stop_requested is False

    asyncio.run(_run())


def test_restart_in_new_asyncio_run_cycle_after_stop(
    fast_intervals, cleanup_task_ids, registered_agent
):
    """
    stop() 之后，在一次全新的 asyncio.run() 生命周期（全新事件
    循环）里重新 start()，必须能正常工作，不复用已经关闭的旧
    loop，不出现 "Event is bound to a different event loop"。
    """

    async def _first_cycle():
        task_consumer_service.start()
        await task_consumer_service.stop(timeout=1.0)

    asyncio.run(_first_cycle())

    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    async def _second_cycle():
        runtime_engine.running = True
        task_consumer_service.start()
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed"
        )
        assert done

        await task_consumer_service.stop(timeout=1.0)

    asyncio.run(_second_cycle())


def test_unexpected_loop_exit_marks_not_running_and_records_error_type(
    fast_intervals, monkeypatch
):
    """
    模拟循环体本身（而不是被内层 try/except 覆盖的单次迭代）抛出
    不可恢复异常：_apply_result 直接抛出。验证消费者协程能安全
    结束（不崩溃 event loop、不产生未处理异常噪音），
    is_running() 立即变为 False，last_error_type 可观察，且日志
    明确记录"意外退出"，不伪装成正常状态。
    """

    def _broken_apply_result(self, result):
        raise RuntimeError("模拟循环体不可恢复异常")

    monkeypatch.setattr(
        consumer_module.TaskConsumerService,
        "_apply_result",
        _broken_apply_result,
    )

    async def _run():
        runtime_engine.running = True
        task_consumer_service.start()
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: not task_consumer_service.is_running(), timeout=2.0
        )
        assert done
        assert task_consumer_service._last_error_type == "RuntimeError"

    asyncio.run(_run())


def test_manual_runtime_start_logs_when_consumer_not_running(
    fast_intervals, monkeypatch, caplog
):
    """
    consumer 已经意外退出（is_running() 为 False）时调用
    start_runtime()：RuntimeEngine 本身仍然正常启动、响应仍然是
    正常的运行状态（这两者语义独立），但日志必须明确记录
    "consumer 不在运行"，不能静默假装一切正常。
    """

    import logging

    from app.api.v1 import runtime as runtime_api

    task_consumer_service.reset_for_tests()  # 确保 is_running() 为 False

    caplog.set_level(logging.ERROR, logger="app.runtime_api")

    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    try:
        response = runtime_api.start_runtime()
    finally:
        runtime_engine.running = memory_snapshot["running"]
        runtime_engine.started_at = memory_snapshot["started_at"]
        runtime_engine.stopped_at = memory_snapshot["stopped_at"]
        _restore_runtime_state_row(db_snapshot)

    assert response.running is True

    warning_texts = "\n".join(
        record.getMessage()
        for record in caplog.records
        if record.name == "app.runtime_api"
    )
    assert "not running" in warning_texts


# ---------------------------------------------------------------------------
# 3 / 4 / 9. Runtime 前置条件
# ---------------------------------------------------------------------------


def test_runtime_stopped_does_not_claim_pending(
    fast_intervals, cleanup_task_ids
):
    runtime_engine.running = False
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    async def body():
        await asyncio.sleep(0.3)
        row = _get_task_row(task_id)
        assert row.status == "pending"

    run_with_consumer(body)


def test_runtime_running_executes_pending_to_completed(
    fast_intervals, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        payload={"task": "consumer success"},
    )
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed"
        )
        assert done

        row = _get_task_row(task_id)
        assert row.result["result"]["task"] == "consumer success"

    run_with_consumer(body)


def test_runtime_stop_does_not_claim_next_pending(
    fast_intervals, cleanup_task_ids, registered_agent
):
    """
    task_id_1 的 Agent 故意执行较慢，确保测试有机会在它还在
    执行阶段（尚未写回 completed）时就把 runtime_engine.running
    设为 False；消费者应当允许 task_id_1 自然完成写回，但完成后
    重新检查到 running=False，不再领取 task_id_2。
    """

    class _SlowAgent(BaseAgent):
        def think(self, context):
            return {"task": context.get("task")}

        def execute(self, decision):
            time.sleep(0.3)
            return {"executed": True}

    agent_name = registered_agent(_SlowAgent)
    task_id_1 = _insert_task(status="pending", assigned_agent=agent_name)
    task_id_2 = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.extend([task_id_1, task_id_2])

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        claimed = await _poll_until(
            lambda: _get_task_row(task_id_1).status == "running", timeout=1.0
        )
        assert claimed

        # task_id_1 仍在 Agent 执行阶段（同步线程里 sleep 中），
        # 此时请求停止。
        runtime_engine.running = False
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id_1).status == "completed",
            timeout=1.5,
        )
        assert done

        await asyncio.sleep(0.2)

        row_2 = _get_task_row(task_id_2)
        assert row_2.status == "pending"

    run_with_consumer(body)


# ---------------------------------------------------------------------------
# 5 / 6. 串行处理与 priority 顺序
# ---------------------------------------------------------------------------


def test_multiple_pending_processed_serially_no_overlap(
    fast_intervals, cleanup_task_ids, registered_agent
):
    lock = threading.Lock()
    overlap_events = []

    agent_name = registered_agent(
        _OverlapDetectingAgent,
        lock=lock,
        overlap_events=overlap_events,
        delay=0.05,
    )

    task_ids = [
        _insert_task(status="pending", assigned_agent=agent_name)
        for _ in range(4)
    ]
    cleanup_task_ids.extend(task_ids)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: all(
                _get_task_row(tid).status == "completed" for tid in task_ids
            ),
            timeout=3.0,
        )
        assert done
        assert overlap_events == []

    run_with_consumer(body)


def test_priority_ordering_inherited_from_task_execution_service(
    fast_intervals, cleanup_task_ids, registered_agent
):
    order_log = []

    class _OrderRecordingAgent(BaseAgent):
        def think(self, context):
            return {"task": context.get("task")}

        def execute(self, decision):
            order_log.append(decision.get("task"))
            return {"executed": True}

    agent_name = registered_agent(_OrderRecordingAgent)

    base_time = datetime.now(timezone.utc)
    low_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        priority="low",
        created_at=base_time,
        payload={"task": "low"},
    )
    normal_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        priority="normal",
        created_at=base_time + timedelta(seconds=1),
        payload={"task": "normal"},
    )
    high_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        priority="high",
        created_at=base_time + timedelta(seconds=2),
        payload={"task": "high"},
    )
    cleanup_task_ids.extend([low_id, normal_id, high_id])

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(lambda: len(order_log) == 3, timeout=3.0)
        assert done
        assert order_log == ["high", "normal", "low"]

    run_with_consumer(body)


# ---------------------------------------------------------------------------
# 7 / 8. 空闲等待与主动唤醒
# ---------------------------------------------------------------------------


def test_idle_does_not_busy_poll(fast_intervals, monkeypatch):
    call_times = []
    original = TaskExecutionService.process_next_pending_task

    def _tracking(*args, **kwargs):
        call_times.append(time.monotonic())
        return original(*args, **kwargs)

    monkeypatch.setattr(
        TaskExecutionService,
        "process_next_pending_task",
        staticmethod(_tracking),
    )

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()
        await asyncio.sleep(0.5)

        # IDLE_POLL_INTERVAL_SECONDS 已被 monkeypatch 成 0.05 秒，
        # 0.5 秒内理论上限约 10 次；不应出现成百上千次的忙轮询。
        assert 0 < len(call_times) < 60

    run_with_consumer(body)


def test_wake_triggers_immediate_recheck(
    fast_intervals, monkeypatch, cleanup_task_ids, registered_agent
):
    # 把 idle 间隔调大，只有主动 wake 才能让消费者及时发现新任务。
    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 5.0)

    agent_name = registered_agent(_SuccessAgent)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()
        await asyncio.sleep(0.1)  # 让消费者先进入一次空闲等待

        task_id = _insert_task(status="pending", assigned_agent=agent_name)
        cleanup_task_ids.append(task_id)

        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed",
            timeout=1.5,
        )
        assert done

    run_with_consumer(body)


# ---------------------------------------------------------------------------
# 10 / 11. graceful stop：不强杀正在执行的任务
# ---------------------------------------------------------------------------


def test_stop_does_not_force_terminate_in_flight_task(
    fast_intervals, cleanup_task_ids, registered_agent
):
    class _SlowAgent(BaseAgent):
        def think(self, context):
            return {"task": context.get("task")}

        def execute(self, decision):
            time.sleep(0.3)
            return {"executed": True}

    agent_name = registered_agent(_SlowAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        # 等到任务已经被领取（running），此时同步 Agent 正在线程
        # 中执行，尚未写回。
        claimed = await _poll_until(
            lambda: _get_task_row(task_id).status == "running", timeout=1.0
        )
        assert claimed

    run_with_consumer(body, timeout=2.0)

    # run_with_consumer 已经在其内部 await 了 stop(timeout=2.0)，
    # stop 不强制打断线程，会等到 in-flight 的 0.3 秒任务自然完成
    # 并写回，而不是把它标记成中断/失败。
    row = _get_task_row(task_id)
    assert row.status == "completed"


def test_manual_stop_route_does_not_block_on_in_flight_agent(
    fast_intervals, cleanup_task_ids, registered_agent
):
    """
    直接调用 runtime.py 的 stop_runtime()（同步函数），验证它在
    consumer 正在执行任务时几乎立即返回，不等待 Agent 执行完成。
    """

    from app.api.v1 import runtime as runtime_api

    class _SlowAgent(BaseAgent):
        def think(self, context):
            return {}

        def execute(self, decision):
            time.sleep(0.5)
            return {"executed": True}

    agent_name = registered_agent(_SlowAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    db_snapshot = _snapshot_runtime_state_row()

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        claimed = await _poll_until(
            lambda: _get_task_row(task_id).status == "running", timeout=1.0
        )
        assert claimed

        start = time.monotonic()
        runtime_api.stop_runtime()
        elapsed = time.monotonic() - start

        assert elapsed < 0.3

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed",
            timeout=2.0,
        )
        assert done

    try:
        run_with_consumer(body)
    finally:
        _restore_runtime_state_row(db_snapshot)


def test_graceful_drain_end_to_end_then_restart_processes_remaining(
    fast_intervals, cleanup_task_ids, registered_agent
):
    """
    完整的 graceful drain 场景（对应本轮复核要求的场景五）：

    task A 正在 Agent 执行 -> 调用 stop_runtime() 快速返回（不等待
    A） -> A 自然完成写回 -> task B（第二条 pending）在 stop 期间
    保持 pending，不被领取 -> Runtime 再次 start 后，consumer 才
    去处理 task B。
    """

    from app.api.v1 import runtime as runtime_api

    class _SlowAgent(BaseAgent):
        def think(self, context):
            return {}

        def execute(self, decision):
            time.sleep(0.4)
            return {"executed": True}

    agent_name = registered_agent(_SlowAgent)
    task_a = _insert_task(status="pending", assigned_agent=agent_name)
    task_b = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.extend([task_a, task_b])

    db_snapshot = _snapshot_runtime_state_row()

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        claimed = await _poll_until(
            lambda: _get_task_row(task_a).status == "running", timeout=1.0
        )
        assert claimed

        start = time.monotonic()
        runtime_api.stop_runtime()
        elapsed = time.monotonic() - start
        assert elapsed < 0.3, "stop 不应等待 task A 执行完成"

        done_a = await _poll_until(
            lambda: _get_task_row(task_a).status == "completed",
            timeout=2.0,
        )
        assert done_a, "task A 应被允许自然完成"

        await asyncio.sleep(0.2)
        assert _get_task_row(task_b).status == "pending", (
            "stop 后不应再领取 task B"
        )

        runtime_api.start_runtime()
        task_consumer_service.wake()

        done_b = await _poll_until(
            lambda: _get_task_row(task_b).status == "completed",
            timeout=2.0,
        )
        assert done_b, "重新 start 后 task B 才应被处理"

    try:
        run_with_consumer(body)
    finally:
        _restore_runtime_state_row(db_snapshot)


def test_shutdown_timeout_returns_promptly_with_warning(
    monkeypatch, cleanup_task_ids, registered_agent, caplog
):
    """
    验证 shutdown 超时路径本身（stop() 遇到很小的
    SHUTDOWN_TIMEOUT_SECONDS 且 Agent 执行远超该超时）：stop()
    必须在超时附近就返回（而不是等到 Agent 真正执行完成），并
    记录明确的 warning 日志；返回时数据库行仍是 running（证明
    没有等到完成才返回）。

    已知测试局限：本测试用 asyncio.run() 包裹整个用例，Python
    3.10+ 的 asyncio.run() 在关闭事件循环前会调用
    loop.shutdown_default_executor()，等待 asyncio.to_thread 背后
    的默认线程池排空——这意味着即使 stop() 自己提前"放弃等待"并
    返回，包裹它的 asyncio.run() 调用整体仍会在最后阻塞到那条
    同步 Agent 线程真正跑完为止。这是测试工具本身的限制，不是
    生产环境的行为：生产环境里 uvicorn 的事件循环在整个进程生命
    周期内持续运行，不会在每次 stop() 之后关闭，因此不会有这个
    "尾部等待"。本测试只验证 stop() 自身提前返回 + 记录 warning
    这两个可观察行为，不验证"进程立即整体退出"。
    """

    import logging

    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 0.05)

    class _VerySlowAgent(BaseAgent):
        def think(self, context):
            return {}

        def execute(self, decision):
            time.sleep(1.5)
            return {"executed": True}

    agent_name = registered_agent(_VerySlowAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    caplog.set_level(logging.WARNING, logger="app.task_consumer")

    async def _run():
        runtime_engine.running = True
        task_consumer_service.start()
        task_consumer_service.wake()

        claimed = await _poll_until(
            lambda: _get_task_row(task_id).status == "running", timeout=1.0
        )
        assert claimed

        start = time.monotonic()
        await task_consumer_service.stop(timeout=0.1)
        elapsed = time.monotonic() - start

        assert elapsed < 1.0, "stop 应该在接近超时值时返回，不等待 Agent"

        row = _get_task_row(task_id)
        assert row.status == "running", (
            "stop 返回时任务应仍处于 running（尚未完成写回）"
        )

    asyncio.run(_run())

    warning_texts = "\n".join(
        record.getMessage()
        for record in caplog.records
        if record.name == "app.task_consumer"
    )
    assert "timed out" in warning_texts


# ---------------------------------------------------------------------------
# 17 / 18. 异常处理与数据库临时失败退避
# ---------------------------------------------------------------------------


def test_iteration_exception_does_not_stop_loop(
    fast_intervals, monkeypatch, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    original = TaskExecutionService.process_next_pending_task
    call_count = {"n": 0}

    def _flaky(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] <= 2:
            raise RuntimeError("模拟一次性未预期异常")
        return original(*args, **kwargs)

    monkeypatch.setattr(
        TaskExecutionService,
        "process_next_pending_task",
        staticmethod(_flaky),
    )

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed",
            timeout=3.0,
        )
        assert done
        assert call_count["n"] > 2

    run_with_consumer(body)


def test_database_temporary_failure_recovers_after_backoff(
    fast_intervals, monkeypatch, cleanup_task_ids, registered_agent
):
    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    call_count = {"n": 0}
    original_claim = TaskExecutionService.claim_next_pending_task

    def _flaky_claim(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise RuntimeError(
                "模拟数据库暂时不可用，敏感串 postgresql://u:p@h/db"
            )
        return original_claim(*args, **kwargs)

    monkeypatch.setattr(
        TaskExecutionService,
        "claim_next_pending_task",
        staticmethod(_flaky_claim),
    )

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed",
            timeout=3.0,
        )
        assert done
        assert call_count["n"] >= 2

    run_with_consumer(body)


# ---------------------------------------------------------------------------
# 20 / 21. requeue 唤醒
# ---------------------------------------------------------------------------


def test_requeue_wakes_consumer_when_runtime_running(
    fast_intervals, monkeypatch, cleanup_task_ids, registered_agent
):
    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 5.0)

    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="running", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()
        await asyncio.sleep(0.1)

        TaskRecoveryActionService.requeue_task(task_id)

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed",
            timeout=1.5,
        )
        assert done

    run_with_consumer(body)


def test_requeue_while_runtime_stopped_stays_pending(
    fast_intervals, cleanup_task_ids
):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = False

        TaskRecoveryActionService.requeue_task(task_id)

        await asyncio.sleep(0.3)

        row = _get_task_row(task_id)
        assert row.status == "pending"

    run_with_consumer(body)


def test_requeue_commit_failure_does_not_wake_consumer(
    fast_intervals, monkeypatch, cleanup_task_ids
):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    from app.services import task_recovery_action_service as rca_module

    original_session_cls = rca_module.SessionLocal

    class _CommitFailingSession:
        def __init__(self, *args, **kwargs):
            self._session = original_session_cls(*args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._session, name)

        def commit(self):
            raise RuntimeError("模拟 requeue 提交失败")

    monkeypatch.setattr(rca_module, "SessionLocal", _CommitFailingSession)

    wake_calls = []
    monkeypatch.setattr(
        task_consumer_service, "wake", lambda: wake_calls.append(1)
    )

    with pytest.raises(RuntimeError):
        rca_module.TaskRecoveryActionService.requeue_task(task_id)

    assert wake_calls == []

    row = _get_task_row(task_id)
    assert row.status == "running"


def test_requeue_wake_failure_does_not_fail_requeue(
    fast_intervals, monkeypatch, cleanup_task_ids
):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    from app.services import task_recovery_action_service as rca_module

    def _broken_wake():
        raise RuntimeError("模拟 wake 失败")

    monkeypatch.setattr(task_consumer_service, "wake", _broken_wake)

    result = rca_module.TaskRecoveryActionService.requeue_task(task_id)
    assert result.status == "pending"

    row = _get_task_row(task_id)
    assert row.status == "pending"


# ---------------------------------------------------------------------------
# 22 / 23 / 24. 安全边界
# ---------------------------------------------------------------------------


def test_does_not_modify_system_runtime_state(
    fast_intervals, cleanup_task_ids, registered_agent
):
    before = _snapshot_runtime_state_row()

    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed"
        )
        assert done

    run_with_consumer(body)

    after = _snapshot_runtime_state_row()
    assert before == after


def test_does_not_call_runtime_recovery_service(
    fast_intervals, monkeypatch, cleanup_task_ids, registered_agent
):
    call_count = {"n": 0}

    def _track(*args, **kwargs):
        call_count["n"] += 1
        return {"attempted": False, "recovered": False, "reason": "test"}

    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(_track),
    )

    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed"
        )
        assert done

    run_with_consumer(body)

    assert call_count["n"] == 0


def test_does_not_create_heartbeat(
    fast_intervals, monkeypatch, cleanup_task_ids, registered_agent
):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("consumer 不应直接写 heartbeat")

    monkeypatch.setattr(
        RuntimeStateService,
        "record_heartbeat",
        staticmethod(_fail_if_called),
    )

    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "completed"
        )
        assert done

    run_with_consumer(body)


# ---------------------------------------------------------------------------
# 25. 日志安全
# ---------------------------------------------------------------------------


def test_logging_does_not_leak_sensitive_content(
    fast_intervals, cleanup_task_ids, registered_agent, caplog
):
    import logging

    class _SensitiveFailureAgent(BaseAgent):
        def think(self, context):
            return {"ok": True}

        def execute(self, decision):
            raise RuntimeError(
                "敏感串 postgresql://u:p@h/db token=SECRET999"
            )

    caplog.set_level(logging.DEBUG, logger="app.task_consumer")

    sensitive_payload = {
        "task": "含敏感内容的任务",
        "secret_token": "PAYLOAD-SECRET-777",
    }

    agent_name = registered_agent(_SensitiveFailureAgent)
    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        payload=sensitive_payload,
    )
    cleanup_task_ids.append(task_id)

    async def body():
        runtime_engine.running = True
        task_consumer_service.wake()

        done = await _poll_until(
            lambda: _get_task_row(task_id).status == "failed"
        )
        assert done

    run_with_consumer(body)

    service_records = [
        record
        for record in caplog.records
        if record.name == "app.task_consumer"
    ]

    assert len(service_records) > 0

    combined_log_text = "\n".join(
        record.getMessage() for record in service_records
    )

    assert "PAYLOAD-SECRET-777" not in combined_log_text
    assert "含敏感内容的任务" not in combined_log_text
    assert "postgresql://" not in combined_log_text
    assert "SECRET999" not in combined_log_text

    for record in service_records:
        assert record.exc_info is None


# ---------------------------------------------------------------------------
# 19. `/agents/{name}/run` 不会被消费者抢任务（真实并发）
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module", autouse=True)
def _preserve_runtime_and_db_state_module():
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
def http_client():
    with TestClient(app) as test_client:
        yield test_client


def test_agents_run_endpoint_not_stolen_by_consumer(
    http_client, cleanup_task_ids, registered_agent
):
    """
    真实并发验证：一个线程持续高频调用
    TaskExecutionService.claim_next_pending_task()（模拟消费者
    抢占式轮询），同时主线程通过 POST /agents/{name}/run 同步
    创建并执行一个任务。由于该接口现在直接以 running 状态创建
    任务，claim_next_pending_task 的 SELECT ... WHERE
    status='pending' 永远不可能命中它，因此抢占线程绝不应该
    声称拿到了这个 task_id。
    """

    class _SlightlySlowAgent(BaseAgent):
        def think(self, context):
            return {"task": context.get("task")}

        def execute(self, decision):
            time.sleep(0.05)
            return {"executed": True, "task": decision.get("task")}

    agent_name = registered_agent(_SlightlySlowAgent)

    http_client.post("/api/v1/runtime/start")

    stolen_ids = []
    stop_flag = threading.Event()

    def _hammer():
        while not stop_flag.is_set():
            claimed = TaskExecutionService.claim_next_pending_task()
            if claimed is not None:
                stolen_ids.append(claimed.task_id)

    hammer_thread = threading.Thread(target=_hammer)
    hammer_thread.start()

    try:
        response = http_client.post(
            f"/api/v1/agents/{agent_name}/run",
            json={
                "task": f"{TEST_MARKER} race check",
                "priority": "normal",
            },
        )
    finally:
        stop_flag.set()
        hammer_thread.join(timeout=5)

    assert response.status_code == 200

    body = response.json()
    task_id = body["task"]["id"]
    cleanup_task_ids.append(task_id)

    assert body["task"]["status"] == "completed"
    assert task_id not in stolen_ids

    row = _get_task_row(task_id)
    assert row.status == "completed"

    http_client.post("/api/v1/runtime/stop")


# ---------------------------------------------------------------------------
# 13 / 14 / 15 / 16. lifespan 集成
# ---------------------------------------------------------------------------


def test_readiness_failure_prevents_consumer_start(monkeypatch):
    def _fail(*args, **kwargs):
        raise DatabaseReadinessError("模拟数据库未就绪")

    monkeypatch.setattr(
        DatabaseReadinessService,
        "check_ready",
        staticmethod(_fail),
    )

    task_consumer_service.reset_for_tests()

    with pytest.raises(DatabaseReadinessError):
        with TestClient(app):
            pass

    assert task_consumer_service.is_running() is False


def test_startup_recovery_success_allows_consumer_to_process_pending(
    monkeypatch, cleanup_task_ids, registered_agent
):
    """
    这里用 monkeypatch 直接伪造 attempt_startup_recovery() 的返回
    值和 runtime_engine.running 的副作用，而不是让真实
    RuntimeRecoveryService 逻辑跑一遍——因为真实的
    attempt_startup_recovery() 在存在 pending/running 任务时会
    拒绝恢复（reason="unfinished_tasks"），所以"recovery 真正成功
    + 表里已经有一条 pending"这两个条件在真实流程里互斥，不会
    同时出现。这个测试验证的是"如果 recovery 成功把 Runtime 设为
    running，consumer 会立刻开始处理当时表里能看到的 pending"这
    条独立的机制性保证，而不是在断言某个真实端到端场景。真实场景
    下，recovery 成功之后处理的 pending 只可能是恢复检查完成之后
    才新产生的任务。
    """

    monkeypatch.setattr(consumer_module, "IDLE_POLL_INTERVAL_SECONDS", 0.05)

    def _fake_recovered(*args, **kwargs):
        runtime_engine.running = True
        return {"attempted": True, "recovered": True, "reason": "success"}

    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(_fake_recovered),
    )

    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    try:
        with TestClient(app):
            deadline = time.monotonic() + 2.0
            while time.monotonic() < deadline:
                if _get_task_row(task_id).status == "completed":
                    break
                time.sleep(0.05)

        row = _get_task_row(task_id)
        assert row.status == "completed"
    finally:
        runtime_engine.running = memory_snapshot["running"]
        runtime_engine.started_at = memory_snapshot["started_at"]
        runtime_engine.stopped_at = memory_snapshot["stopped_at"]
        _restore_runtime_state_row(db_snapshot)


def test_startup_recovery_not_recovered_pending_stays_pending(
    monkeypatch, cleanup_task_ids
):
    def _fake_not_recovered(*args, **kwargs):
        return {
            "attempted": True,
            "recovered": False,
            "reason": "not_desired",
        }

    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(_fake_not_recovered),
    )

    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }
    runtime_engine.running = False

    try:
        with TestClient(app):
            time.sleep(0.3)

        row = _get_task_row(task_id)
        assert row.status == "pending"
    finally:
        runtime_engine.running = memory_snapshot["running"]
        runtime_engine.started_at = memory_snapshot["started_at"]
        runtime_engine.stopped_at = memory_snapshot["stopped_at"]
        _restore_runtime_state_row(db_snapshot)


def test_lifespan_shutdown_leaves_no_leftover_consumer_task():
    task_consumer_service.reset_for_tests()

    with TestClient(app):
        assert task_consumer_service.is_running() is True

    assert task_consumer_service.is_running() is False
    assert task_consumer_service._task is None
