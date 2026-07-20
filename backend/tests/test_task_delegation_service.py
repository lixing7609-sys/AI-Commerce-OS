"""
TaskDelegationService（阶段 8B）测试。

覆盖：合法委派创建、超过上限截断、未知 Agent/自委派/空任务/超长
任务/非法 priority 的校验语义、重复委派去重、父任务重执行和并发
执行下的幂等（数据库唯一约束兜底）、单条/全部子任务创建失败时
的 partial_failure/failed 语义、子任务 commit 后才 wake、wake
失败不回滚已创建的子任务。

测试注册专用的假 Agent（唯一名称），不使用真实业务 Agent，不
调用真实 LLM；所有测试创建的任务按 id 精确清理。
"""

import threading
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.agents.agent_registry import AgentRegistry
from app.agents.operational_agent import OperationalAgent
from app.database.db import SessionLocal
from app.models.task_db import TaskDB
from app.services import task_delegation_service as module
from app.services.task_delegation_service import TaskDelegationService

TEST_MARKER = "DELEGATION_TEST"


def _unique_agent_name(suffix):
    return f"{TEST_MARKER}_AGENT_{suffix}_{uuid.uuid4().hex[:6].upper()}"


def _make_parent_task_id():
    return f"TASKDELEG{uuid.uuid4().hex[:10].upper()}"


@pytest.fixture
def registered_agent():
    created = []

    def _register(suffix="A"):
        name = _unique_agent_name(suffix)
        agent = OperationalAgent(
            name=name, role="delegation_test", description="test"
        )
        AgentRegistry.register(agent)
        created.append(name)
        return name

    yield _register

    for name in created:
        AgentRegistry.unregister(name)


@pytest.fixture
def cleanup_by_parent():
    parent_ids = []

    yield parent_ids

    if not parent_ids:
        return

    db = SessionLocal()
    try:
        db.query(TaskDB).filter(TaskDB.parent_task_id.in_(parent_ids)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _children_of(parent_task_id):
    db = SessionLocal()
    try:
        return (
            db.query(TaskDB)
            .filter(TaskDB.parent_task_id == parent_task_id)
            .all()
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 6/7/8. 合法 1 条 / 合法 3 条 / 超过 3 条截断
# ---------------------------------------------------------------------------


def test_single_valid_delegation_creates_one_child(
    registered_agent, cleanup_by_parent
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {
                "assigned_agent": agent_name,
                "task": "分析商品结构",
                "priority": "normal",
                "reason": "测试原因",
            }
        ],
    )

    assert result["status"] == "created"
    assert result["created_count"] == 1
    assert result["skipped_count"] == 0
    assert len(result["child_task_ids"]) == 1

    children = _children_of(parent_id)
    assert len(children) == 1
    assert children[0].assigned_agent == agent_name
    assert children[0].delegation_depth == 1
    assert children[0].created_by_agent == "AI CEO"
    assert children[0].root_task_id == parent_id


def test_three_valid_delegations_all_created(
    registered_agent, cleanup_by_parent
):
    agents = [registered_agent(str(i)) for i in range(3)]
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": name, "task": f"任务{i}", "priority": "normal"}
            for i, name in enumerate(agents)
        ],
    )

    assert result["status"] == "created"
    assert result["created_count"] == 3
    assert len(_children_of(parent_id)) == 3


def test_more_than_three_delegations_truncated(
    registered_agent, cleanup_by_parent
):
    agents = [registered_agent(str(i)) for i in range(5)]
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": name, "task": f"任务{i}", "priority": "normal"}
            for i, name in enumerate(agents)
        ],
    )

    assert result["created_count"] == 3
    assert result["skipped_count"] == 2
    assert result["status"] == "partial_failure"

    overflow_items = [
        item
        for item in result["items"]
        if item.get("skip_reason") == "max_delegations_exceeded"
    ]
    assert len(overflow_items) == 2
    assert len(_children_of(parent_id)) == 3


# ---------------------------------------------------------------------------
# 9/10/11/12/13. 校验语义
# ---------------------------------------------------------------------------


def test_unknown_agent_is_skipped(cleanup_by_parent):
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {
                "assigned_agent": f"{TEST_MARKER}_NOT_REGISTERED",
                "task": "任务",
                "priority": "normal",
            }
        ],
    )

    assert result["created_count"] == 0
    assert result["skipped_count"] == 1
    assert result["status"] == "none"
    assert result["items"][0]["skip_reason"] == "unknown_agent"
    assert len(_children_of(parent_id)) == 0


def test_self_delegation_is_skipped(registered_agent, cleanup_by_parent):
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": "AI CEO", "task": "自己修复自己", "priority": "normal"}
        ],
    )

    assert result["created_count"] == 0
    assert result["items"][0]["skip_reason"] == "self_delegation"


def test_empty_task_text_is_skipped(registered_agent, cleanup_by_parent):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": agent_name, "task": "   ", "priority": "normal"}
        ],
    )

    assert result["created_count"] == 0
    assert result["items"][0]["skip_reason"] == "invalid_task_length"


def test_overlong_task_text_is_skipped(registered_agent, cleanup_by_parent):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {
                "assigned_agent": agent_name,
                "task": "x" * 65,
                "priority": "normal",
            }
        ],
    )

    assert result["created_count"] == 0
    assert result["items"][0]["skip_reason"] == "invalid_task_length"


def test_invalid_priority_defaults_to_normal_not_skipped(
    registered_agent, cleanup_by_parent
):
    """
    固定语义（阶段 8B 三 的约束由 ai_ceo_response 解析层已经把非法
    priority 默认为 normal；本服务作为业务层兜底，同样默认为
    normal，不因为 priority 非法而跳过整条委派）。
    """

    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {
                "assigned_agent": agent_name,
                "task": "任务",
                "priority": "urgent-not-a-real-priority",
            }
        ],
    )

    assert result["created_count"] == 1
    children = _children_of(parent_id)
    assert children[0].priority == "normal"


# ---------------------------------------------------------------------------
# 14. 重复 delegation 去重
# ---------------------------------------------------------------------------


def test_duplicate_delegations_are_deduplicated(
    registered_agent, cleanup_by_parent
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": agent_name, "task": "分析商品结构", "priority": "normal"},
            {"assigned_agent": agent_name, "task": "分析商品结构", "priority": "high"},
        ],
    )

    assert result["created_count"] == 1
    assert result["skipped_count"] == 1
    assert any(
        item.get("skip_reason") == "duplicate" for item in result["items"]
    )
    assert len(_children_of(parent_id)) == 1


# ---------------------------------------------------------------------------
# 15/16. 幂等：父任务重执行 / 并发执行不重复创建
# ---------------------------------------------------------------------------


def test_reexecuting_parent_does_not_duplicate_children(
    registered_agent, cleanup_by_parent
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    delegations = [
        {"assigned_agent": agent_name, "task": "分析商品结构", "priority": "normal"}
    ]

    first = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=delegations,
    )

    second = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=delegations,
    )

    assert first["child_task_ids"] == second["child_task_ids"]
    assert len(_children_of(parent_id)) == 1


def test_concurrent_delegation_does_not_duplicate_children(
    registered_agent, cleanup_by_parent
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    delegations = [
        {"assigned_agent": agent_name, "task": "分析商品结构", "priority": "normal"}
    ]

    results = []
    lock = threading.Lock()

    def worker():
        result = TaskDelegationService.create_delegated_tasks(
            parent_task_id=parent_id,
            parent_agent_name="AI CEO",
            parent_depth=0,
            root_task_id=parent_id,
            delegations=delegations,
        )
        with lock:
            results.append(result)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert len(_children_of(parent_id)) == 1


# ---------------------------------------------------------------------------
# 17/18. 单条失败 partial_failure / 全部失败 failed
# ---------------------------------------------------------------------------


def test_single_child_db_failure_yields_partial_failure(
    registered_agent, cleanup_by_parent, monkeypatch
):
    agents = [registered_agent(str(i)) for i in range(2)]
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    original_session_local = module.SessionLocal
    call_count = {"n": 0}

    class _FailOnceSession:
        def __init__(self, *args, **kwargs):
            self._session = original_session_local(*args, **kwargs)
            call_count["n"] += 1
            self._should_fail = call_count["n"] == 1

        def __getattr__(self, name):
            return getattr(self._session, name)

        def commit(self):
            if self._should_fail:
                raise RuntimeError("simulated db failure")
            return self._session.commit()

    monkeypatch.setattr(module, "SessionLocal", _FailOnceSession)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": name, "task": f"任务{i}", "priority": "normal"}
            for i, name in enumerate(agents)
        ],
    )

    assert result["status"] == "partial_failure"
    assert result["created_count"] == 1

    failed_items = [
        item for item in result["items"] if item["status"] == "failed"
    ]
    assert len(failed_items) == 1
    assert failed_items[0]["skip_reason"] == "RuntimeError"


def test_all_children_db_failure_yields_failed_status(
    registered_agent, cleanup_by_parent, monkeypatch
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    original_session_local = module.SessionLocal

    class _AlwaysFailSession:
        def __init__(self, *args, **kwargs):
            self._session = original_session_local(*args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._session, name)

        def commit(self):
            raise RuntimeError("simulated db failure")

    monkeypatch.setattr(module, "SessionLocal", _AlwaysFailSession)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": agent_name, "task": "任务", "priority": "normal"}
        ],
    )

    assert result["status"] == "failed"
    assert result["created_count"] == 0

    monkeypatch.setattr(module, "SessionLocal", original_session_local)
    assert len(_children_of(parent_id)) == 0


# ---------------------------------------------------------------------------
# 19/20. wake 时序与失败安全
# ---------------------------------------------------------------------------


def test_wake_called_only_after_children_committed(
    registered_agent, cleanup_by_parent, monkeypatch
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    observed_child_count_at_wake = {"value": None}

    def _fake_wake():
        observed_child_count_at_wake["value"] = len(_children_of(parent_id))

    monkeypatch.setattr(
        module.task_consumer_service, "wake", _fake_wake
    )

    TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": agent_name, "task": "任务", "priority": "normal"}
        ],
    )

    assert observed_child_count_at_wake["value"] == 1


def test_wake_failure_does_not_roll_back_children(
    registered_agent, cleanup_by_parent, monkeypatch
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    def _failing_wake():
        raise RuntimeError("wake failed")

    monkeypatch.setattr(
        module.task_consumer_service, "wake", _failing_wake
    )

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": agent_name, "task": "任务", "priority": "normal"}
        ],
    )

    assert result["created_count"] == 1
    assert len(_children_of(parent_id)) == 1


# ---------------------------------------------------------------------------
# depth != 0 兜底（防递归委派）
# ---------------------------------------------------------------------------


def test_parent_depth_nonzero_creates_no_children(
    registered_agent, cleanup_by_parent
):
    agent_name = registered_agent("A")
    parent_id = _make_parent_task_id()
    cleanup_by_parent.append(parent_id)

    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=1,
        root_task_id=parent_id,
        delegations=[
            {"assigned_agent": agent_name, "task": "任务", "priority": "normal"}
        ],
    )

    assert result["status"] == "none"
    assert result["created_count"] == 0
    assert len(_children_of(parent_id)) == 0
