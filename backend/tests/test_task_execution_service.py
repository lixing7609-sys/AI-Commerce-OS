"""
TaskExecutionService（阶段 4A：单次原子领取并执行一条 pending
任务）测试。

覆盖：Runtime 前置条件、SELECT ... FOR UPDATE SKIP LOCKED 原子
领取、priority 排序、Agent 成功/失败/不存在时的写回与安全错误
摘要、写回阶段的状态冲突保护、领取/写回阶段的数据库异常处理、
真实并发下的互斥领取、Agent 执行期间不持有数据库事务、以及
不调用 RuntimeRecoveryService、不修改 system_runtime_state、
每次最多处理一条任务等安全边界。

测试直接构造 TaskDB 行以精确控制初始状态；Agent 执行全部使用
本文件定义的测试专用 Agent（通过 AgentRegistry 注册/注销），不
调用真实业务 Agent、不调用外部模型或 API；所有测试创建的任务
在测试结束后显式删除，不污染开发数据库；不真实启动 Runtime
（只操作 runtime_engine.running 内存标志，测试结束后恢复原值）。
"""

import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import OperationalError

from app.agents.agent_registry import AgentRegistry
from app.agents.base_agent import BaseAgent
from app.database.db import SessionLocal
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services import task_execution_service as module
from app.services.runtime_recovery_service import RuntimeRecoveryService
from app.services.task_execution_service import TaskExecutionService

TEST_MARKER = "TASK_EXEC_TEST_MARKER"
TEST_TASK_TYPE = f"{TEST_MARKER}_task_type"


class _SuccessAgent(BaseAgent):
    """think/execute 均正常返回，用于验证成功写回路径。"""

    def think(self, context):
        return {"ok": True, "context_task": context.get("task")}

    def execute(self, decision):
        return {
            "executed": True,
            "echo": decision.get("context_task"),
        }


class _InternalFailureAgent(BaseAgent):
    """
    execute 抛出含敏感文本的异常；BaseAgent.run() 会在内部捕获并
    转成 {"success": False, "error": str(原始异常)}——用于验证
    execute_claimed_task 不会把这段原始文本写入 TaskDB.error。
    """

    def think(self, context):
        return {"ok": True}

    def execute(self, decision):
        raise RuntimeError(
            "内部失败，敏感串 postgresql://u:p@h/db token=SECRET123"
        )


class _SafeCategorizedFailureAgent(BaseAgent):
    """
    execute 抛出 app.llm.exceptions 定义的安全分类异常（例如
    ProviderUnavailableError）——用于验证 execute_claimed_task 会
    把这一小组固定安全标签原样传递为 error_type，而不是收敛成
    通用的 "AgentReportedFailure"。
    """

    def think(self, context):
        return {"ok": True}

    def execute(self, decision):
        from app.llm.exceptions import ProviderUnavailableError

        raise ProviderUnavailableError()


class _RawRaisingAgent(BaseAgent):
    """
    run() 本身直接抛出异常，不符合 BaseAgent 正常"永不外抛"的
    契约（模拟一个实现有缺陷的 Agent）——用于验证
    execute_claimed_task 对直接异常也有兜底，且只保留
    type(error).__name__。
    """

    def think(self, context):
        return {}

    def execute(self, decision):
        return {}

    def run(self, context, task_name=None, **kwargs):
        raise ValueError("raw exception bypassing run(), secret=XYZ789")


class _NonJsonSerializableResultAgent(BaseAgent):
    """
    execute 正常返回，但 result 里嵌了一个 JSON 不可序列化的
    Python 对象（set）——用于验证 complete_task 写回 TaskDB.result
    （JSON 列）失败时的安全处理。
    """

    def __init__(self, *args, call_counter, **kwargs):
        super().__init__(*args, **kwargs)
        self.call_counter = call_counter

    def think(self, context):
        self.call_counter.append(1)
        return {"ok": True}

    def execute(self, decision):
        return {"bad_field": {1, 2, 3}}


def _unique_agent_name(suffix):
    return f"{TEST_MARKER}_AGENT_{suffix}_{uuid.uuid4().hex[:6].upper()}"


def _make_task_id():
    return f"TASKEXEC{uuid.uuid4().hex[:10].upper()}"


def _insert_task(
    status="pending",
    assigned_agent=None,
    priority="normal",
    payload=None,
    created_at=None,
    started_at=None,
    completed_at=None,
    result=None,
    error=None,
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
            result=result,
            error=error,
            created_at=created_at or datetime.now(timezone.utc),
            started_at=started_at,
            completed_at=completed_at,
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
    """
    注册一个测试专用 Agent，测试结束后注销，不影响 5 个默认
    业务 Agent。
    """

    created = []

    def _register(agent_cls, suffix="A", **extra_kwargs):
        name = _unique_agent_name(suffix)
        agent = agent_cls(
            name=name,
            role="task_execution_test",
            description="TaskExecutionService 测试专用 Agent",
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


# ---------------------------------------------------------------------------
# 1. Runtime 前置条件
# ---------------------------------------------------------------------------


def test_runtime_stopped_returns_runtime_stopped_and_does_not_claim(
    monkeypatch,
):
    runtime_engine.running = False

    def _fail_if_called():
        raise AssertionError("runtime stopped 时不应领取任务")

    monkeypatch.setattr(
        TaskExecutionService,
        "claim_next_pending_task",
        staticmethod(_fail_if_called),
    )

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "runtime_stopped"
    assert result.task_id is None


def test_runtime_running_no_pending_returns_no_task():
    runtime_engine.running = True

    pending_count = (
        SessionLocal()
        .query(TaskDB)
        .filter(TaskDB.status == "pending")
        .count()
    )
    assert pending_count == 0, "测试前提：数据库当前不应存在其它 pending 任务"

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "no_task"


# ---------------------------------------------------------------------------
# 3. 原子领取
# ---------------------------------------------------------------------------


def test_claim_marks_running_and_clears_stale_fields(cleanup_task_ids):
    task_id = _insert_task(
        status="pending",
        error="旧的失败原因",
        result={"stale": True},
        completed_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    cleanup_task_ids.append(task_id)

    snapshot = TaskExecutionService.claim_next_pending_task()

    assert snapshot is not None
    assert snapshot.task_id == task_id
    assert snapshot.started_at is not None

    row = _get_task_row(task_id)
    assert row.status == "running"
    assert row.started_at is not None
    assert row.completed_at is None
    assert row.result is None
    assert row.error is None


# ---------------------------------------------------------------------------
# 4. Agent 成功
# ---------------------------------------------------------------------------


def test_agent_success_writes_completed(cleanup_task_ids, registered_agent):
    runtime_engine.running = True
    agent_name = registered_agent(_SuccessAgent)

    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        payload={"task": "生成测试报告", "priority": "normal"},
    )
    cleanup_task_ids.append(task_id)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "completed"
    assert result.task_id == task_id
    assert result.error_type is None

    row = _get_task_row(task_id)
    assert row.status == "completed"
    assert row.error is None
    assert row.completed_at is not None
    assert row.started_at is not None
    assert row.result["success"] is True
    assert row.result["result"]["echo"] == "生成测试报告"


# ---------------------------------------------------------------------------
# 5. Agent 失败（内部异常被 BaseAgent.run() 捕获）
# ---------------------------------------------------------------------------


def test_agent_internal_failure_writes_failed_with_safe_error(
    cleanup_task_ids, registered_agent
):
    runtime_engine.running = True
    agent_name = registered_agent(_InternalFailureAgent)

    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        payload={"task": "触发内部失败"},
    )
    cleanup_task_ids.append(task_id)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "failed"
    assert result.error_type == "AgentReportedFailure"

    row = _get_task_row(task_id)
    assert row.status == "failed"
    assert row.result is None
    assert row.completed_at is not None
    assert row.error == "AgentExecutionError:AgentReportedFailure"
    assert "postgresql://" not in row.error
    assert "SECRET123" not in row.error


def test_agent_safe_categorized_failure_preserves_specific_error_type(
    cleanup_task_ids, registered_agent
):
    runtime_engine.running = True
    agent_name = registered_agent(_SafeCategorizedFailureAgent)

    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        payload={"task": "触发 Provider 不可用"},
    )
    cleanup_task_ids.append(task_id)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "failed"
    assert result.error_type == "provider_unavailable"

    row = _get_task_row(task_id)
    assert row.status == "failed"
    assert row.error == "AgentExecutionError:provider_unavailable"


def test_agent_raw_exception_captures_exception_type_only(
    cleanup_task_ids, registered_agent
):
    runtime_engine.running = True
    agent_name = registered_agent(_RawRaisingAgent)

    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
    )
    cleanup_task_ids.append(task_id)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "failed"
    assert result.error_type == "ValueError"

    row = _get_task_row(task_id)
    assert row.error == "AgentExecutionError:ValueError"
    assert "XYZ789" not in row.error


# ---------------------------------------------------------------------------
# 6. assigned_agent 不存在
# ---------------------------------------------------------------------------


def test_missing_agent_writes_failed_with_safe_error(cleanup_task_ids):
    runtime_engine.running = True

    task_id = _insert_task(
        status="pending",
        assigned_agent=f"{TEST_MARKER}_NONEXISTENT_AGENT",
    )
    cleanup_task_ids.append(task_id)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "failed"
    assert result.error_type == "AgentNotFoundError"

    row = _get_task_row(task_id)
    assert row.status == "failed"
    assert row.error == "AgentExecutionError:AgentNotFoundError"


# ---------------------------------------------------------------------------
# 7. priority 排序
# ---------------------------------------------------------------------------


def test_priority_ordering_high_then_normal_then_low(cleanup_task_ids):
    base_time = datetime.now(timezone.utc)

    low_id = _insert_task(
        status="pending", priority="low", created_at=base_time
    )
    normal_id = _insert_task(
        status="pending",
        priority="normal",
        created_at=base_time + timedelta(seconds=1),
    )
    high_id = _insert_task(
        status="pending",
        priority="high",
        created_at=base_time + timedelta(seconds=2),
    )
    cleanup_task_ids.extend([low_id, normal_id, high_id])

    first = TaskExecutionService.claim_next_pending_task()
    second = TaskExecutionService.claim_next_pending_task()
    third = TaskExecutionService.claim_next_pending_task()

    assert [first.task_id, second.task_id, third.task_id] == [
        high_id,
        normal_id,
        low_id,
    ]


def test_priority_tie_breaks_by_created_at_then_id(cleanup_task_ids):
    same_time = datetime.now(timezone.utc)

    id_b = _insert_task(
        status="pending",
        priority="normal",
        created_at=same_time,
        task_id="TASKEXECZZZLATER01",
    )
    id_a_earlier = _insert_task(
        status="pending",
        priority="normal",
        created_at=same_time - timedelta(seconds=5),
        task_id="TASKEXECAAAEARLY01",
    )
    # 与 id_a_earlier 完全相同的 created_at，只靠 id 升序兜底排序。
    id_a_tie_higher = _insert_task(
        status="pending",
        priority="normal",
        created_at=same_time - timedelta(seconds=5),
        task_id="TASKEXECBBBEARLY02",
    )
    cleanup_task_ids.extend([id_b, id_a_earlier, id_a_tie_higher])

    first = TaskExecutionService.claim_next_pending_task()
    second = TaskExecutionService.claim_next_pending_task()
    third = TaskExecutionService.claim_next_pending_task()

    assert [first.task_id, second.task_id, third.task_id] == [
        id_a_earlier,
        id_a_tie_higher,
        id_b,
    ]


# ---------------------------------------------------------------------------
# 8 / 9. 只领取 pending；requeue 后的 pending 可被领取
# ---------------------------------------------------------------------------


def test_only_pending_status_is_claimable(cleanup_task_ids):
    completed_id = _insert_task(status="completed")
    failed_id = _insert_task(status="failed")
    running_id = _insert_task(status="running")
    pending_id = _insert_task(status="pending")
    cleanup_task_ids.extend(
        [completed_id, failed_id, running_id, pending_id]
    )

    claimed = TaskExecutionService.claim_next_pending_task()
    assert claimed.task_id == pending_id

    none_left = TaskExecutionService.claim_next_pending_task()
    assert none_left is None

    for stale_id in (completed_id, failed_id, running_id):
        row = _get_task_row(stale_id)
        assert row.status in ("completed", "failed", "running")


def test_requeued_pending_task_is_claimable(cleanup_task_ids):
    task_id = _insert_task(status="running")
    cleanup_task_ids.append(task_id)

    from app.services.task_recovery_action_service import (
        TaskRecoveryActionService,
    )

    TaskRecoveryActionService.requeue_task(task_id)

    claimed = TaskExecutionService.claim_next_pending_task()
    assert claimed.task_id == task_id


# ---------------------------------------------------------------------------
# 10 / 11. 并发与事务隔离
# ---------------------------------------------------------------------------


def test_concurrent_claims_never_claim_same_task(cleanup_task_ids):
    task_id_1 = _insert_task(status="pending")
    task_id_2 = _insert_task(status="pending")
    cleanup_task_ids.extend([task_id_1, task_id_2])

    results = []
    lock = threading.Lock()

    def worker():
        claimed = TaskExecutionService.claim_next_pending_task()

        with lock:
            results.append(claimed.task_id if claimed else None)

    threads = [threading.Thread(target=worker) for _ in range(2)]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert sorted(results) == sorted([task_id_1, task_id_2])

    row_1 = _get_task_row(task_id_1)
    row_2 = _get_task_row(task_id_2)
    assert row_1.status == "running"
    assert row_2.status == "running"


def test_concurrent_claims_with_single_pending_only_one_succeeds(
    cleanup_task_ids,
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    results = []
    lock = threading.Lock()

    def worker():
        claimed = TaskExecutionService.claim_next_pending_task()

        with lock:
            results.append(claimed)

    threads = [threading.Thread(target=worker) for _ in range(2)]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    non_none = [item for item in results if item is not None]
    assert len(non_none) == 1
    assert non_none[0].task_id == task_id


def test_claim_does_not_hold_lock_during_agent_execution(cleanup_task_ids):
    """
    领取阶段（阶段 A）commit + close 之后，任务行必须立即可以被
    另一个独立 session 用 FOR UPDATE NOWAIT 锁定 —— 证明领取
    返回后不再持有任何事务或行锁，Agent 执行阶段完全在事务之外。
    """

    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    claimed = TaskExecutionService.claim_next_pending_task()
    assert claimed is not None

    probe_db = SessionLocal()

    try:
        row = (
            probe_db.query(TaskDB)
            .filter(TaskDB.id == task_id)
            .with_for_update(nowait=True)
            .first()
        )
        assert row is not None
        assert row.status == "running"
        probe_db.commit()
    except OperationalError:
        pytest.fail("领取阶段返回后仍持有行锁，阶段 A/B 未正确隔离")
    finally:
        probe_db.close()


# ---------------------------------------------------------------------------
# 12. 状态冲突
# ---------------------------------------------------------------------------


def test_finalization_conflict_when_manually_changed_during_execution(
    cleanup_task_ids,
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    claimed = TaskExecutionService.claim_next_pending_task()
    assert claimed is not None

    from app.services.task_recovery_action_service import (
        TaskRecoveryActionService,
    )

    TaskRecoveryActionService.mark_task_failed(
        task_id, "人工在 Agent 执行期间介入"
    )

    result = TaskExecutionService.complete_task(
        task_id, {"success": True, "result": {}}
    )

    assert result.outcome == "state_conflict"
    assert result.final_status == "failed"

    row = _get_task_row(task_id)
    assert row.status == "failed"
    assert row.error == "人工在 Agent 执行期间介入"


# ---------------------------------------------------------------------------
# 13 / 14 / 15. 数据库失败语义
# ---------------------------------------------------------------------------


class _QueryFailingSession:
    """领取阶段查询即失败，模拟连接中断等数据库故障。"""

    def __init__(self, *args, **kwargs):
        pass

    def query(self, *args, **kwargs):
        raise RuntimeError(
            "模拟领取查询失败，敏感串 postgresql://u:p@h/db"
        )

    def rollback(self):
        pass

    def close(self):
        pass

    def commit(self):
        pass


def test_claim_database_failure_rolls_back_and_skips_agent(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    agent_calls = []
    monkeypatch.setattr(
        AgentRegistry,
        "get",
        classmethod(
            lambda cls, name: agent_calls.append(name) or None
        ),
    )
    monkeypatch.setattr(module, "SessionLocal", _QueryFailingSession)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "failed"
    assert result.error_type == "RuntimeError"
    assert agent_calls == []

    row = _get_task_row(task_id)
    assert row.status == "pending"


def _make_commit_failing_session_cls(original_session_cls, message):
    class _CommitFailingSession:
        def __init__(self, *args, **kwargs):
            self._session = original_session_cls(*args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._session, name)

        def commit(self):
            raise RuntimeError(message)

    return _CommitFailingSession


def test_complete_writeback_database_failure_is_safe(
    monkeypatch, cleanup_task_ids
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    claimed = TaskExecutionService.claim_next_pending_task()
    assert claimed is not None

    original_session_cls = module.SessionLocal
    monkeypatch.setattr(
        module,
        "SessionLocal",
        _make_commit_failing_session_cls(
            original_session_cls,
            "模拟 completed 写回提交失败，敏感串 postgresql://u:p@h/db",
        ),
    )

    result = TaskExecutionService.complete_task(
        task_id, {"success": True, "result": {}}
    )

    assert result.outcome == "failed"
    assert result.error_type == "RuntimeError"
    assert "postgresql://" not in result.message
    assert "postgresql://" not in (result.error_type or "")

    monkeypatch.setattr(module, "SessionLocal", original_session_cls)
    row = _get_task_row(task_id)
    assert row.status == "running"


def test_fail_writeback_database_failure_is_safe(
    monkeypatch, cleanup_task_ids
):
    task_id = _insert_task(status="pending")
    cleanup_task_ids.append(task_id)

    claimed = TaskExecutionService.claim_next_pending_task()
    assert claimed is not None

    original_session_cls = module.SessionLocal
    monkeypatch.setattr(
        module,
        "SessionLocal",
        _make_commit_failing_session_cls(
            original_session_cls,
            "模拟 failed 写回提交失败，敏感串 postgresql://u:p@h/db",
        ),
    )

    result = TaskExecutionService.fail_task(task_id, "SomeAgentError")

    assert result.outcome == "failed"
    assert result.error_type == "RuntimeError"
    assert "postgresql://" not in result.message

    monkeypatch.setattr(module, "SessionLocal", original_session_cls)
    row = _get_task_row(task_id)
    assert row.status == "running"


# ---------------------------------------------------------------------------
# 16 / 17 / 18. 不触碰 Runtime 恢复与 system_runtime_state
# ---------------------------------------------------------------------------


def test_does_not_call_runtime_recovery_service(
    monkeypatch, cleanup_task_ids, registered_agent
):
    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不应调用 RuntimeRecoveryService")

    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(_fail_if_called),
    )

    runtime_engine.running = True
    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    TaskExecutionService.process_next_pending_task()

    runtime_engine.running = False
    TaskExecutionService.process_next_pending_task()

    runtime_engine.running = True
    TaskExecutionService.process_next_pending_task()


def test_does_not_modify_system_runtime_state(
    cleanup_task_ids, registered_agent
):
    before = _snapshot_runtime_state_row()

    runtime_engine.running = True
    agent_name = registered_agent(_SuccessAgent)
    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    TaskExecutionService.process_next_pending_task()

    after = _snapshot_runtime_state_row()

    assert before == after


# ---------------------------------------------------------------------------
# 19. 每次最多处理一条
# ---------------------------------------------------------------------------


def test_process_next_pending_task_handles_at_most_one(
    cleanup_task_ids, registered_agent
):
    runtime_engine.running = True
    agent_name = registered_agent(_SuccessAgent)

    task_id_1 = _insert_task(status="pending", assigned_agent=agent_name)
    task_id_2 = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.extend([task_id_1, task_id_2])

    result = TaskExecutionService.process_next_pending_task()
    assert result.outcome == "completed"

    row_1 = _get_task_row(task_id_1)
    row_2 = _get_task_row(task_id_2)

    statuses = sorted([row_1.status, row_2.status])
    assert statuses == ["completed", "pending"]


# ---------------------------------------------------------------------------
# Agent 结果持久化安全：result 必须真实可写入 TaskDB.result（JSON 列）
# ---------------------------------------------------------------------------


def test_non_json_serializable_result_fails_safely_without_retry(
    cleanup_task_ids, registered_agent
):
    """
    TaskDB.result 是 JSON 列；agent.run() 返回的 result 里包含一个
    Python set（JSON 不可序列化）时，complete_task 提交应该失败、
    rollback，任务保持 running，不二次调用 Agent，不自动 retry，
    返回的安全结果不包含原始 result 内容。
    """

    runtime_engine.running = True
    call_counter = []
    agent_name = registered_agent(
        _NonJsonSerializableResultAgent,
        suffix="B",
        call_counter=call_counter,
    )

    task_id = _insert_task(status="pending", assigned_agent=agent_name)
    cleanup_task_ids.append(task_id)

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "failed"
    assert result.error_type == "TypeError"
    assert result.message == (
        "写回完成结果时发生数据库错误，任务可能仍处于 running"
    )
    assert "1, 2, 3" not in result.message
    assert "bad_field" not in result.message

    # think() 只被调用一次，证明 Agent 没有被自动重试。
    assert call_counter == [1]

    row = _get_task_row(task_id)
    assert row.status == "running"
    assert row.result is None


# ---------------------------------------------------------------------------
# 日志安全：不泄露 payload / result / 原始异常文本
# ---------------------------------------------------------------------------


def test_logging_does_not_leak_payload_result_or_raw_error(
    cleanup_task_ids, registered_agent, caplog
):
    import logging

    caplog.set_level(logging.DEBUG, logger="app.task_execution")

    runtime_engine.running = True
    agent_name = registered_agent(_InternalFailureAgent, suffix="C")

    sensitive_payload = {
        "task": "含敏感 payload 的任务",
        "secret_token": "PAYLOAD-SECRET-TOKEN-999",
    }

    task_id = _insert_task(
        status="pending",
        assigned_agent=agent_name,
        payload=sensitive_payload,
    )
    cleanup_task_ids.append(task_id)

    TaskExecutionService.process_next_pending_task()

    # 只检查本服务自己的 logger（"app.task_execution"），不检查
    # SQLAlchemy echo=True 内置的 SQL 语句日志——那是项目级别的
    # 既有配置，与本轮新增服务的日志安全无关，其回显的 SQL 绑定
    # 参数本身就是这次特意构造的敏感 payload，混进来检查会产生
    # 误报。
    service_records = [
        record
        for record in caplog.records
        if record.name == "app.task_execution"
    ]

    assert len(service_records) > 0

    combined_log_text = "\n".join(
        record.getMessage() for record in service_records
    )

    assert "PAYLOAD-SECRET-TOKEN-999" not in combined_log_text
    assert "含敏感 payload 的任务" not in combined_log_text
    assert "postgresql://" not in combined_log_text
    assert "SECRET123" not in combined_log_text
    assert "secret_token" not in combined_log_text

    for record in service_records:
        assert record.exc_info is None
        assert not record.exc_text


# ---------------------------------------------------------------------------
# Runtime stopped 时不得创建数据库 session
# ---------------------------------------------------------------------------


def test_runtime_stopped_never_creates_database_session(monkeypatch):
    runtime_engine.running = False

    def _fail_if_called(*args, **kwargs):
        raise AssertionError(
            "Runtime stopped 时不应创建任何数据库 session"
        )

    monkeypatch.setattr(module, "SessionLocal", _fail_if_called)

    agent_calls = []
    monkeypatch.setattr(
        AgentRegistry,
        "get",
        classmethod(
            lambda cls, name: agent_calls.append(name) or None
        ),
    )

    result = TaskExecutionService.process_next_pending_task()

    assert result.outcome == "runtime_stopped"
    assert agent_calls == []
