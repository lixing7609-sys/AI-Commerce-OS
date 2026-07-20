"""
阶段 8B：AI CEO 结构化结果自动转委派的 Agent 层集成测试。

覆盖：structured 结果触发真实委派、text fallback 不委派、
unsupported_task 不委派、Provider 失败不委派、depth>0 不委派、
其它 Agent（产品/销售/财务/行政）收到委派任务时返回
capability_not_implemented 且不调用 LLM Gateway。

LLM 调用全部通过 monkeypatch app.agents.ai_ceo_agent.llm_gateway
模拟，不发起真实网络请求；所有测试创建的任务按 id 精确清理。
"""

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.agents import ai_ceo_agent as ai_ceo_agent_module
from app.agents.agent_registry import AgentRegistry
from app.agents.ai_ceo_agent import AICEOAgent
from app.agents.operational_agent import OperationalAgent
from app.database.db import SessionLocal
from app.llm.exceptions import ProviderUnavailableError
from app.llm.models import LLMResponse, LLMUsage
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.task_execution_service import TaskExecutionService

TEST_MARKER = "AI_CEO_DELEGATION_TEST"


def _make_ai_ceo(suffix="A"):
    return AICEOAgent(
        name=f"{TEST_MARKER}_CEO_{suffix}_{uuid.uuid4().hex[:6]}",
        role="chief_executive",
        description="test",
    )


def _make_operational(suffix="A"):
    return OperationalAgent(
        name=f"{TEST_MARKER}_OP_{suffix}_{uuid.uuid4().hex[:6]}",
        role="product_manager",
        description="test",
    )


def _fake_llm_response(content):
    return LLMResponse(
        content=content,
        provider="ollama",
        model="test-model",
        usage=LLMUsage(input_tokens=1, output_tokens=1, total_tokens=2),
        latency_ms=1.0,
    )


def _insert_task(task_id, assigned_agent, task_text):
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type="agent_task",
            assigned_agent=assigned_agent,
            priority="normal",
            status="pending",
            payload={"task": task_text},
            created_at=datetime.now(timezone.utc),
            # 与真实创建路径（Task 数据类 __post_init__）保持一致：
            # 顶层任务的 root_task_id 等于自身 id。直接构造 TaskDB
            # 不会自动获得这个默认值，必须显式设置——否则委派创建的
            # 子任务的 root_task_id 会回退到父任务 id（正确），但
            # 父任务自己的 root_task_id 会是 NULL，导致按
            # root_task_id 做批量清理时漏删父任务本身。
            root_task_id=task_id,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()


def _get_task_row(task_id):
    db = SessionLocal()
    try:
        return db.query(TaskDB).filter(TaskDB.id == task_id).first()
    finally:
        db.close()


@pytest.fixture
def cleanup_by_root():
    root_ids = []
    yield root_ids
    if not root_ids:
        return
    db = SessionLocal()
    try:
        db.query(TaskDB).filter(TaskDB.root_task_id.in_(root_ids)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


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
# 21. structured result 自动委派
# ---------------------------------------------------------------------------


def test_structured_result_triggers_real_delegation(
    monkeypatch, cleanup_by_root
):
    runtime_engine.running = True

    ceo = _make_ai_ceo("STRUCT")
    target = _make_operational("TARGET")
    AgentRegistry.register(ceo)
    AgentRegistry.register(target)

    content = json.dumps(
        {
            "summary": "s",
            "findings": [],
            "risks": [],
            "actions": [],
            "delegations": [
                {
                    "assigned_agent": target.name,
                    "task": "分析商品结构",
                    "priority": "normal",
                    "reason": "r",
                }
            ],
        },
        ensure_ascii=False,
    )
    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(content),
    )

    task_id = f"AICEODELEG{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, ceo.name, "生成今日经营分析")
    cleanup_by_root.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        delegation = row.result["result"]["delegation"]
        assert delegation["status"] == "created"
        assert delegation["created_count"] == 1

        child_id = delegation["child_task_ids"][0]
        child_row = _get_task_row(child_id)
        assert child_row is not None
        assert child_row.parent_task_id == task_id
        assert child_row.root_task_id == task_id
        assert child_row.delegation_depth == 1
        assert child_row.created_by_agent == ceo.name
    finally:
        AgentRegistry.unregister(ceo.name)
        AgentRegistry.unregister(target.name)


# ---------------------------------------------------------------------------
# 22/23/24/25. 不触发委派的场景
# ---------------------------------------------------------------------------


def test_text_fallback_does_not_delegate(monkeypatch, cleanup_by_root):
    runtime_engine.running = True

    ceo = _make_ai_ceo("TEXTFALLBACK")
    AgentRegistry.register(ceo)

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response("这不是合法 JSON"),
    )

    task_id = f"AICEODELEG{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, ceo.name, "生成今日经营分析")
    cleanup_by_root.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        assert row.result["result"]["format"] == "text"
        assert row.result["result"]["delegation"]["status"] == "none"
        assert row.result["result"]["delegation"]["created_count"] == 0
    finally:
        AgentRegistry.unregister(ceo.name)


def test_unsupported_task_does_not_delegate(monkeypatch, cleanup_by_root):
    runtime_engine.running = True

    ceo = _make_ai_ceo("UNSUPPORTED")
    AgentRegistry.register(ceo)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不支持的任务不应调用模型")

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway, "generate", _fail_if_called
    )

    task_id = f"AICEODELEG{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, ceo.name, "帮我写一首诗")
    cleanup_by_root.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        assert row.result["result"]["status"] == "unsupported_task"
        assert "delegation" not in row.result["result"]
    finally:
        AgentRegistry.unregister(ceo.name)


def test_provider_failure_does_not_delegate(monkeypatch, cleanup_by_root):
    runtime_engine.running = True

    ceo = _make_ai_ceo("PROVFAIL")
    AgentRegistry.register(ceo)

    def _raise_error(request):
        raise ProviderUnavailableError()

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway, "generate", _raise_error
    )

    task_id = f"AICEODELEG{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, ceo.name, "生成今日经营分析")
    cleanup_by_root.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "failed"
        assert result.error_type == "provider_unavailable"

        db = SessionLocal()
        try:
            child_count = (
                db.query(TaskDB)
                .filter(TaskDB.parent_task_id == task_id)
                .count()
            )
        finally:
            db.close()
        assert child_count == 0
    finally:
        AgentRegistry.unregister(ceo.name)


def test_depth_greater_than_zero_does_not_delegate(monkeypatch):
    """
    直接单元测试 AICEOAgent，depth>0 时即使模型返回合法 delegations
    也不应创建子任务（防止递归委派的兜底防线，不依赖是否真的存在
    parent_task_id 数据库行）。
    """

    ceo = _make_ai_ceo("DEPTH")

    content = (
        '{"summary": "s", "findings": [], "risks": [], "actions": [], '
        '"delegations": [{"assigned_agent": "产品 Agent", '
        '"task": "任务", "priority": "normal", "reason": "r"}]}'
    )
    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(content),
    )

    run_result = ceo.run(
        context={"task": "生成今日经营分析"},
        task_name="生成今日经营分析",
        task_id="TASK-FAKE-CHILD-ID",
        delegation_depth=1,
        root_task_id="TASK-FAKE-ROOT-ID",
    )

    assert run_result["success"] is True
    delegation = run_result["result"]["delegation"]
    assert delegation["status"] == "none"
    assert delegation["created_count"] == 0


# ---------------------------------------------------------------------------
# 26/27. 其它 Agent capability_not_implemented，且不调用 LLM
# ---------------------------------------------------------------------------


def test_other_agent_returns_capability_not_implemented(cleanup_by_root):
    runtime_engine.running = True

    agent = _make_operational("CAP")
    AgentRegistry.register(agent)

    task_id = f"AICEODELEG{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "分析商品结构")
    cleanup_by_root.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        assert row.result["result"] == {
            "status": "capability_not_implemented",
            "agent": agent.name,
            "message": "该 AI 员工的业务能力将在后续阶段接入",
        }
    finally:
        AgentRegistry.unregister(agent.name)


def test_other_agent_never_imports_or_calls_llm_gateway():
    """
    静态确认 operational_agent.py 不依赖 app.llm，从模块层面排除
    "误接入模型"的可能性，而不仅是运行时行为观察。
    """

    import app.agents.operational_agent as operational_agent_module

    source = operational_agent_module.__file__
    with open(source, "r", encoding="utf-8") as f:
        content = f.read()

    assert "app.llm" not in content
    assert "llm_gateway" not in content
