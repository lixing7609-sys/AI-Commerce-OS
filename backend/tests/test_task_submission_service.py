"""
阶段 6A：TaskSubmissionService 与 TaskService 外部幂等能力测试。

只在服务层直接调用（不经过 HTTP/FastAPI 层），覆盖：
validate_agent_exists 存在性校验、build_task 的 payload 映射
（顶层 task 覆盖 context['task']）、submit_internal_task 与阶段 5A
行为一致、submit_external_task 的幂等去重语义（相同/不同
source+request_id 组合、重复请求不重新执行/不 requeue）、
commit-then-wake 顺序与 wake 失败降级、以及真正的并发竞争（多线程
直接对同一个 (source, request_id) 调用 submit_external_task，
验证数据库唯一约束是并发安全的唯一保障，而不是"先查后插"本身）。

所有测试创建的任务按精确 task_id 清理；不修改 system_runtime_state
（本文件不涉及 Runtime start/stop）；测试专用 Agent 均在
fixture 中注册和注销，不污染 AgentRegistry。
"""

import threading
import uuid

import pytest

from app.agents.agent_registry import AgentRegistry
from app.agents.base_agent import BaseAgent
from app.database.db import SessionLocal
from app.models.task_api import ExternalTaskSubmitRequest, TaskSubmitRequest
from app.models.task_db import TaskDB
from app.runtime.task import Task
from app.services.task_service import TaskService
from app.services import task_submission_service as service_module
from app.services.task_submission_service import (
    AgentNotFoundError,
    TaskSubmissionService,
)

TEST_MARKER = "TASK_SUBMISSION_SERVICE_TEST"


class _NoOpAgent(BaseAgent):
    def think(self, context):
        return {"task": context.get("task")}

    def execute(self, decision):
        return {"executed": True}


def _unique_agent_name(suffix):
    return f"{TEST_MARKER}_AGENT_{suffix}_{uuid.uuid4().hex[:6].upper()}"


def _unique_request_id(suffix):
    return f"{TEST_MARKER}-{suffix}-{uuid.uuid4().hex[:8]}"


def _get_task_row(task_id):
    db = SessionLocal()

    try:
        return db.query(TaskDB).filter(TaskDB.id == task_id).first()
    finally:
        db.close()


def _count_by_external(source, request_id):
    db = SessionLocal()

    try:
        return (
            db.query(TaskDB)
            .filter(TaskDB.external_source == source)
            .filter(TaskDB.external_request_id == request_id)
            .count()
        )
    finally:
        db.close()


@pytest.fixture
def registered_agent():
    created = []

    def _register(suffix="A"):
        name = _unique_agent_name(suffix)
        agent = _NoOpAgent(
            name=name,
            role="task_submission_service_test",
            description="TaskSubmissionService 测试专用 Agent",
        )
        AgentRegistry.register(agent)
        created.append(name)
        return name

    yield _register

    for name in created:
        AgentRegistry.unregister(name)


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


# ---------------------------------------------------------------------------
# validate_agent_exists
# ---------------------------------------------------------------------------


def test_validate_agent_exists_raises_for_unknown_agent():
    with pytest.raises(AgentNotFoundError) as exc_info:
        TaskSubmissionService.validate_agent_exists(f"{TEST_MARKER}_NOPE")

    assert exc_info.value.agent_name == f"{TEST_MARKER}_NOPE"


def test_validate_agent_exists_passes_for_registered_agent(registered_agent):
    agent_name = registered_agent()

    TaskSubmissionService.validate_agent_exists(agent_name)


def test_validate_agent_exists_allows_stopped_agent(registered_agent):
    agent_name = registered_agent()
    AgentRegistry.get(agent_name).stop()

    TaskSubmissionService.validate_agent_exists(agent_name)


# ---------------------------------------------------------------------------
# build_task
# ---------------------------------------------------------------------------


def test_build_task_top_level_task_overrides_context_task():
    task = TaskSubmissionService.build_task(
        assigned_agent="X",
        task_text="real task",
        context={"task": "should be overridden", "note": "keep me"},
        priority="high",
    )

    assert task.payload == {"task": "real task", "note": "keep me"}
    assert task.task_type == "real task"
    assert task.assigned_agent == "X"
    assert task.priority == "high"
    assert task.status == "pending"


def test_build_task_does_not_mutate_original_context():
    original_context = {"task": "original", "note": "keep"}

    TaskSubmissionService.build_task(
        assigned_agent="X",
        task_text="real",
        context=original_context,
        priority="normal",
    )

    assert original_context == {"task": "original", "note": "keep"}


# ---------------------------------------------------------------------------
# submit_internal_task（阶段 5A 行为通过服务层直接验证）
# ---------------------------------------------------------------------------


def test_submit_internal_task_creates_pending_row_with_null_external_fields(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request = TaskSubmitRequest(
        assigned_agent=agent_name, task=f"{TEST_MARKER} internal"
    )

    task_db = TaskSubmissionService.submit_internal_task(request)
    cleanup_task_ids.append(task_db.id)

    assert task_db.status == "pending"
    assert task_db.external_source is None
    assert task_db.external_request_id is None


def test_submit_internal_task_unknown_agent_raises_before_insert():
    agent_name = f"{TEST_MARKER}_NOPE2"
    request = TaskSubmitRequest(assigned_agent=agent_name, task="x")

    with pytest.raises(AgentNotFoundError):
        TaskSubmissionService.submit_internal_task(request)


def test_two_internal_tasks_have_null_external_fields_and_coexist(
    registered_agent, cleanup_task_ids
):
    """
    两个内部任务的 external_source/external_request_id 均为
    NULL；数据库唯一约束允许多行 NULL/NULL 同时存在，不会互相
    冲突（对应 migration 要求：内部任务不受唯一约束影响）。
    """

    agent_name = registered_agent()

    task1 = TaskSubmissionService.submit_internal_task(
        TaskSubmitRequest(assigned_agent=agent_name, task=f"{TEST_MARKER} n1")
    )
    task2 = TaskSubmissionService.submit_internal_task(
        TaskSubmitRequest(assigned_agent=agent_name, task=f"{TEST_MARKER} n2")
    )
    cleanup_task_ids.extend([task1.id, task2.id])

    assert task1.id != task2.id
    assert task1.external_source is None
    assert task2.external_source is None


# ---------------------------------------------------------------------------
# submit_external_task：首次提交与幂等去重
# ---------------------------------------------------------------------------


def test_submit_external_task_first_call_not_duplicate(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request_id = _unique_request_id("first")
    request = ExternalTaskSubmitRequest(
        request_id=request_id,
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="ext task",
    )

    task_db, duplicate = TaskSubmissionService.submit_external_task(request)
    cleanup_task_ids.append(task_db.id)

    assert duplicate is False
    assert task_db.status == "pending"
    assert task_db.external_source == TEST_MARKER
    assert task_db.external_request_id == request_id


def test_submit_external_task_same_source_and_request_id_returns_same_task(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request_id = _unique_request_id("same")
    request = ExternalTaskSubmitRequest(
        request_id=request_id,
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="ext task",
    )

    first, first_duplicate = TaskSubmissionService.submit_external_task(
        request
    )
    cleanup_task_ids.append(first.id)

    second, second_duplicate = TaskSubmissionService.submit_external_task(
        request
    )

    assert first_duplicate is False
    assert second_duplicate is True
    assert second.id == first.id
    assert _count_by_external(TEST_MARKER, request_id) == 1


def test_submit_external_task_completed_task_resubmission_not_reexecuted(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request_id = _unique_request_id("completed")
    request = ExternalTaskSubmitRequest(
        request_id=request_id,
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="ext task",
    )

    first, _ = TaskSubmissionService.submit_external_task(request)
    cleanup_task_ids.append(first.id)

    # 直接把任务写成 completed，模拟已经执行完成的场景。
    db = SessionLocal()
    try:
        row = db.query(TaskDB).filter(TaskDB.id == first.id).first()
        row.status = "completed"
        row.result = {"executed": True}
        db.commit()
    finally:
        db.close()

    second, duplicate = TaskSubmissionService.submit_external_task(request)

    assert duplicate is True
    assert second.id == first.id
    assert second.status == "completed"
    assert _count_by_external(TEST_MARKER, request_id) == 1


def test_submit_external_task_failed_task_resubmission_not_requeued(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request_id = _unique_request_id("failed")
    request = ExternalTaskSubmitRequest(
        request_id=request_id,
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="ext task",
    )

    first, _ = TaskSubmissionService.submit_external_task(request)
    cleanup_task_ids.append(first.id)

    db = SessionLocal()
    try:
        row = db.query(TaskDB).filter(TaskDB.id == first.id).first()
        row.status = "failed"
        row.error = "模拟失败"
        db.commit()
    finally:
        db.close()

    second, duplicate = TaskSubmissionService.submit_external_task(request)

    assert duplicate is True
    assert second.id == first.id
    assert second.status == "failed"


def test_submit_external_task_same_request_id_different_source_creates_second_task(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request_id = _unique_request_id("cross-source")

    first, first_duplicate = TaskSubmissionService.submit_external_task(
        ExternalTaskSubmitRequest(
            request_id=request_id,
            source=f"{TEST_MARKER}_SRC_A",
            assigned_agent=agent_name,
            task="a",
        )
    )
    second, second_duplicate = TaskSubmissionService.submit_external_task(
        ExternalTaskSubmitRequest(
            request_id=request_id,
            source=f"{TEST_MARKER}_SRC_B",
            assigned_agent=agent_name,
            task="b",
        )
    )
    cleanup_task_ids.extend([first.id, second.id])

    assert first_duplicate is False
    assert second_duplicate is False
    assert first.id != second.id


def test_submit_external_task_different_request_id_same_source_creates_second_task(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    source = f"{TEST_MARKER}_SAME_SOURCE"

    first, first_duplicate = TaskSubmissionService.submit_external_task(
        ExternalTaskSubmitRequest(
            request_id=_unique_request_id("r1"),
            source=source,
            assigned_agent=agent_name,
            task="a",
        )
    )
    second, second_duplicate = TaskSubmissionService.submit_external_task(
        ExternalTaskSubmitRequest(
            request_id=_unique_request_id("r2"),
            source=source,
            assigned_agent=agent_name,
            task="b",
        )
    )
    cleanup_task_ids.extend([first.id, second.id])

    assert first_duplicate is False
    assert second_duplicate is False
    assert first.id != second.id


def test_submit_external_task_unknown_agent_raises_and_creates_no_row(
    registered_agent,
):
    request_id = _unique_request_id("noagent")
    request = ExternalTaskSubmitRequest(
        request_id=request_id,
        source=TEST_MARKER,
        assigned_agent=f"{TEST_MARKER}_NOPE3",
        task="x",
    )

    with pytest.raises(AgentNotFoundError):
        TaskSubmissionService.submit_external_task(request)

    assert TaskService.find_by_external_request(TEST_MARKER, request_id) is None


# ---------------------------------------------------------------------------
# commit -> wake 顺序与失败降级
# ---------------------------------------------------------------------------


def test_submit_external_task_wakes_only_after_commit(
    registered_agent, cleanup_task_ids, monkeypatch
):
    order = []
    original_create = TaskService.create_external_task

    def _spy_create(*args, **kwargs):
        result = original_create(*args, **kwargs)
        order.append("commit")
        return result

    def _spy_wake():
        order.append("wake")

    monkeypatch.setattr(
        service_module.TaskService,
        "create_external_task",
        staticmethod(_spy_create),
    )
    monkeypatch.setattr(service_module.task_consumer_service, "wake", _spy_wake)

    agent_name = registered_agent()
    request = ExternalTaskSubmitRequest(
        request_id=_unique_request_id("order"),
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="order",
    )

    task_db, duplicate = TaskSubmissionService.submit_external_task(request)
    cleanup_task_ids.append(task_db.id)

    assert duplicate is False
    assert order == ["commit", "wake"]


def test_submit_external_task_wake_failure_still_succeeds(
    registered_agent, cleanup_task_ids, monkeypatch
):
    def _broken_wake():
        raise RuntimeError("模拟 wake 失败")

    monkeypatch.setattr(
        service_module.task_consumer_service, "wake", _broken_wake
    )

    agent_name = registered_agent()
    request = ExternalTaskSubmitRequest(
        request_id=_unique_request_id("wakefail"),
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="wake fail",
    )

    task_db, duplicate = TaskSubmissionService.submit_external_task(request)
    cleanup_task_ids.append(task_db.id)

    assert duplicate is False
    assert task_db.status == "pending"


def test_submit_external_task_duplicate_does_not_wake_again(
    registered_agent, cleanup_task_ids, monkeypatch
):
    agent_name = registered_agent()
    request = ExternalTaskSubmitRequest(
        request_id=_unique_request_id("nowake"),
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="no wake on duplicate",
    )

    first, first_duplicate = TaskSubmissionService.submit_external_task(
        request
    )
    cleanup_task_ids.append(first.id)
    assert first_duplicate is False

    wake_calls = []
    monkeypatch.setattr(
        service_module.task_consumer_service,
        "wake",
        lambda: wake_calls.append(1),
    )

    second, second_duplicate = TaskSubmissionService.submit_external_task(
        request
    )

    assert second_duplicate is True
    assert wake_calls == []


# ---------------------------------------------------------------------------
# TaskService.create_external_task / find_by_external_request 单元测试
# ---------------------------------------------------------------------------


def test_create_external_task_returns_none_on_unique_conflict(
    registered_agent, cleanup_task_ids
):
    agent_name = registered_agent()
    request_id = _unique_request_id("directconflict")

    task1 = Task(
        task_type="x",
        payload={"task": "x"},
        assigned_agent=agent_name,
        priority="normal",
    )
    created1 = TaskService.create_external_task(
        task1, external_source=TEST_MARKER, external_request_id=request_id
    )
    cleanup_task_ids.append(created1.id)
    assert created1 is not None

    task2 = Task(
        task_type="x",
        payload={"task": "x"},
        assigned_agent=agent_name,
        priority="normal",
    )
    created2 = TaskService.create_external_task(
        task2, external_source=TEST_MARKER, external_request_id=request_id
    )
    assert created2 is None
    assert _count_by_external(TEST_MARKER, request_id) == 1


def test_find_by_external_request_returns_none_when_absent():
    assert (
        TaskService.find_by_external_request(
            TEST_MARKER, "definitely-does-not-exist"
        )
        is None
    )


# ---------------------------------------------------------------------------
# 并发：真实多线程直接对同一 (source, request_id) 提交
# ---------------------------------------------------------------------------


def test_submit_external_task_concurrent_requests_create_only_one_task(
    registered_agent, cleanup_task_ids
):
    """
    8 个线程同时对完全相同的 (source, request_id) 调用
    submit_external_task：最终必须只有一条任务、恰好一次
    duplicate=False，其余全部 duplicate=True，且不产生任何异常
    （唯一约束冲突不应该冒泡成未处理的异常）。数据库唯一约束是
    这里唯一的并发安全保障——"先查后插"本身只是减少无意义插入
    尝试的优化。
    """

    agent_name = registered_agent()
    request_id = _unique_request_id("concurrent")
    request = ExternalTaskSubmitRequest(
        request_id=request_id,
        source=TEST_MARKER,
        assigned_agent=agent_name,
        task="concurrent",
    )

    results = []
    errors = []
    lock = threading.Lock()

    def _submit():
        try:
            result = TaskSubmissionService.submit_external_task(request)
            with lock:
                results.append(result)
        except Exception as error:
            with lock:
                errors.append(error)

    threads = [threading.Thread(target=_submit) for _ in range(8)]

    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert len(results) == 8

    task_ids = {task_db.id for task_db, _ in results}
    assert len(task_ids) == 1
    cleanup_task_ids.append(task_ids.pop())

    duplicate_flags = [duplicate for _, duplicate in results]
    assert duplicate_flags.count(False) == 1
    assert duplicate_flags.count(True) == 7

    assert _count_by_external(TEST_MARKER, request_id) == 1
