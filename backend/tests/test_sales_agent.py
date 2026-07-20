"""
SalesAgent（阶段 8C）测试。

覆盖：三类支持任务识别、无关任务 unsupported（不调用模型）、
直接任务真实执行路径、AI CEO 委派任务执行路径（经由
TaskExecutionService 完整走一遍）、task identity 保留、
depth=1 时不委派、Provider 失败安全、processed_count/
failed_count、result 字段白名单（不含 prompt/context/raw
response）、不影响 AI CEO。

LLM 调用全部通过 monkeypatch app.agents.sales_agent.llm_gateway
模拟，不发起真实网络请求；所有测试创建的任务按 id 精确清理。
"""

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.agents import sales_agent as sales_agent_module
from app.agents.agent_registry import AgentRegistry
from app.agents.sales_agent import SalesAgent, SUPPORTED_TASK_TYPE_LABELS
from app.database.db import SessionLocal
from app.llm.exceptions import ProviderUnavailableError
from app.llm.models import LLMResponse, LLMUsage
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.task_execution_service import TaskExecutionService

TEST_MARKER = "SALES_AGENT_TEST"

_VALID_SALES_JSON = json.dumps(
    {
        "summary": "s",
        "known_facts": [],
        "data_gaps": ["尚未接入真实订单数据"],
        "opportunities": [],
        "strategy": {
            "target": "",
            "positioning": "",
            "channel_plan": [],
            "content_plan": [],
            "conversion_plan": [],
        },
        "actions_today": [],
        "seven_day_plan": [],
        "required_inputs": [],
        "warnings": [],
    },
    ensure_ascii=False,
)


def _make_agent(suffix="A"):
    return SalesAgent(
        name=f"{TEST_MARKER}_{suffix}_{uuid.uuid4().hex[:6]}",
        role="sales_operator",
        description="test",
    )


def _fake_llm_response(content=_VALID_SALES_JSON):
    return LLMResponse(
        content=content,
        provider="ollama",
        model="test-model",
        usage=LLMUsage(input_tokens=1, output_tokens=2, total_tokens=3),
        latency_ms=1.0,
    )


def _insert_task(task_id, assigned_agent, task_text, **extra):
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type="agent_task",
            assigned_agent=assigned_agent,
            priority="normal",
            status=extra.pop("status", "pending"),
            payload={"task": task_text},
            created_at=datetime.now(timezone.utc),
            root_task_id=extra.pop("root_task_id", task_id),
            **extra,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return task_id


def _get_task_row(task_id):
    db = SessionLocal()
    try:
        return db.query(TaskDB).filter(TaskDB.id == task_id).first()
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
# 1/2/3. 三类支持任务识别
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "task_name",
    [
        "分析当前可执行的销售机会",
        "找出近期最值得推进的销售动作",
        "分析现阶段销售增长突破口",
        "根据当前系统情况提出销售机会",
    ],
)
def test_sales_opportunity_tasks_are_supported(task_name):
    agent = _make_agent("OPP")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "sales_analysis"


@pytest.mark.parametrize(
    "task_name",
    [
        "为某商品制定销售策略",
        "给出商品上架后的销售打法",
        "分析商品适合哪些销售渠道",
        "制定商品冷启动销售方案",
    ],
)
def test_product_sales_strategy_tasks_are_supported(task_name):
    agent = _make_agent("STRAT")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "sales_analysis"


@pytest.mark.parametrize(
    "task_name",
    [
        "给出今天的销售行动清单",
        "制定未来7天销售推进计划",
        "根据 AI CEO 的结论落实销售任务",
        "给出渠道运营和内容转化建议",
    ],
)
def test_operational_action_tasks_are_supported(task_name):
    agent = _make_agent("OPS")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "sales_analysis"


# ---------------------------------------------------------------------------
# 4/5. 无关任务 unsupported，且不调用 LLM
# ---------------------------------------------------------------------------


def test_unrelated_task_is_unsupported():
    agent = _make_agent("UNSUPPORTED")
    decision = agent.think({"task": "检查数据库迁移版本"})
    assert decision["action"] == "unsupported_task"

    result = agent.execute(decision)
    assert result == {
        "status": "unsupported_task",
        "agent": agent.name,
        "message": (
            "销售 Agent 当前仅支持销售机会、商品销售策略和"
            "销售运营建议类任务"
        ),
    }


def test_unsupported_task_never_calls_llm_gateway(monkeypatch):
    agent = _make_agent("UNSUPPORTED_NOCALL")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不支持的任务不应调用模型")

    monkeypatch.setattr(sales_agent_module.llm_gateway, "generate", _fail_if_called)

    run_result = agent.run(
        context={"task": "检查数据库迁移版本"},
        task_name="检查数据库迁移版本",
    )

    assert run_result["success"] is True
    assert run_result["result"]["status"] == "unsupported_task"


def test_supported_task_type_labels_exposed():
    assert set(SUPPORTED_TASK_TYPE_LABELS) == {
        "销售机会分析",
        "商品销售策略",
        "销售运营建议",
    }


# ---------------------------------------------------------------------------
# 26/33/34. 直接任务真实执行路径；result 字段白名单
# ---------------------------------------------------------------------------


def test_direct_sales_task_execute_returns_whitelisted_result(monkeypatch):
    agent = _make_agent("DIRECT")

    monkeypatch.setattr(
        sales_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    decision = agent.think({"task": "分析当前可执行的销售机会"})
    result = agent.execute(decision)

    assert set(result.keys()) == {
        "agent",
        "analysis_type",
        "generated_at",
        "provider",
        "model",
        "format",
        "sales_analysis",
        "usage",
    }
    assert result["analysis_type"] == "sales_strategy"
    assert result["format"] == "structured"
    assert "尚未接入真实订单数据" in result["sales_analysis"]["data_gaps"]


def test_execute_never_leaks_prompt_or_raw_response(monkeypatch):
    agent = _make_agent("NOPROMPTLEAK")

    monkeypatch.setattr(
        sales_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    decision = agent.think({"task": "分析当前可执行的销售机会"})
    result = agent.execute(decision)

    result_text = json.dumps(result, ensure_ascii=False)
    assert "system_prompt" not in result_text
    assert "user_prompt" not in result_text
    assert "SALES_AGENT_SYSTEM_PROMPT" not in result_text


# ---------------------------------------------------------------------------
# 28/29. task identity 保留；depth=1 不委派
# ---------------------------------------------------------------------------


def test_sales_agent_has_no_delegation_capability():
    """
    静态确认 sales_agent.py 不 import TaskDelegationService（只
    检查真实的 import 语句，不检查注释里对该类名的说明性提及），
    从模块层面排除"销售 Agent 继续委派"的可能性。
    """

    source_path = sales_agent_module.__file__
    with open(source_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    import_lines = [
        line
        for line in lines
        if line.strip().startswith("import ") or line.strip().startswith("from ")
    ]

    assert not any("task_delegation_service" in line for line in import_lines)
    assert not any("TaskDelegationService" in line for line in import_lines)


def test_depth_one_task_executes_normally_without_delegating(monkeypatch):
    agent = _make_agent("DEPTH1")

    monkeypatch.setattr(
        sales_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    run_result = agent.run(
        context={"task": "分析近30天销售任务量低的原因"},
        task_name="分析近30天销售任务量低的原因",
        task_id="TASK-CHILD-X",
        delegation_depth=1,
        root_task_id="TASK-ROOT-X",
        parent_task_id="TASK-PARENT-X",
    )

    assert run_result["success"] is True
    assert run_result["result"]["format"] == "structured"
    # 结果里不含任何 "delegation" 相关字段——销售 Agent 从不产出
    # 委派摘要。
    assert "delegation" not in run_result["result"]


# ---------------------------------------------------------------------------
# 30. Provider 失败安全
# ---------------------------------------------------------------------------


def test_provider_failure_propagates_safe_error_type(monkeypatch):
    agent = _make_agent("PROVFAIL")

    def _raise_provider_unavailable(request):
        raise ProviderUnavailableError()

    monkeypatch.setattr(
        sales_agent_module.llm_gateway, "generate", _raise_provider_unavailable
    )

    run_result = agent.run(
        context={"task": "分析当前可执行的销售机会"},
        task_name="分析当前可执行的销售机会",
    )

    assert run_result["success"] is False
    assert run_result["error"] == "provider_unavailable"
    assert agent.status == "error"


# ---------------------------------------------------------------------------
# 26/27/28/31/32/35. 经由 TaskExecutionService 的完整执行路径
# ---------------------------------------------------------------------------


def test_task_execution_service_completes_direct_sales_task(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2EDIRECT")
    AgentRegistry.register(agent)

    monkeypatch.setattr(
        sales_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    task_id = f"SALESTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "分析当前可执行的销售机会")
    cleanup_task_ids.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        assert row.status == "completed"
        assert row.result["result"]["format"] == "structured"
        assert row.result["result"]["agent"] == agent.name
    finally:
        AgentRegistry.unregister(agent.name)


def test_task_execution_service_completes_ai_ceo_delegated_sales_task(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2EDELEG")
    AgentRegistry.register(agent)

    monkeypatch.setattr(
        sales_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    parent_id = f"SALESTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(
        parent_id,
        "AI CEO",
        "生成今日经营分析",
        status="completed",
        result={
            "success": True,
            "result": {
                "analysis": {
                    "summary": "系统正常",
                    "findings": [],
                    "risks": [],
                    "actions": [],
                },
                "delegation": {"items": []},
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    child_id = f"SALESTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(
        child_id,
        agent.name,
        "分析近30天销售任务量低的原因",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
        created_by_agent="AI CEO",
    )
    cleanup_task_ids.append(child_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "completed"

        row = _get_task_row(child_id)
        assert row.status == "completed"
        assert row.parent_task_id == parent_id
        assert row.root_task_id == parent_id
        assert row.delegation_depth == 1
        assert row.result["result"]["format"] == "structured"
    finally:
        AgentRegistry.unregister(agent.name)


def test_provider_failure_does_not_affect_ai_ceo(monkeypatch, cleanup_task_ids):
    """
    销售 Agent 的 Provider 失败只影响自己这条任务，不影响 AI CEO
    的注册状态、状态字段或其它任务。
    """

    from app.agents.agent_registry import AgentRegistry as Registry

    ai_ceo = Registry.get("AI CEO")
    ai_ceo_status_before = ai_ceo.status if ai_ceo else None

    runtime_engine.running = True

    agent = _make_agent("E2EFAIL")
    AgentRegistry.register(agent)

    def _raise_provider_unavailable(request):
        raise ProviderUnavailableError()

    monkeypatch.setattr(
        sales_agent_module.llm_gateway, "generate", _raise_provider_unavailable
    )

    task_id = f"SALESTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "分析当前可执行的销售机会")
    cleanup_task_ids.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "failed"
        assert result.error_type == "provider_unavailable"

        row = _get_task_row(task_id)
        assert row.status == "failed"
        assert row.error == "AgentExecutionError:provider_unavailable"

        ai_ceo_after = Registry.get("AI CEO")
        if ai_ceo_after is not None and ai_ceo_status_before is not None:
            assert ai_ceo_after.status == ai_ceo_status_before
    finally:
        AgentRegistry.unregister(agent.name)
