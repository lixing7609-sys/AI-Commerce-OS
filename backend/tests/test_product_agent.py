"""
ProductAgent（阶段 8D）测试。

覆盖：四类支持任务识别、无关任务 unsupported（不调用模型）、
直接任务真实执行路径、AI CEO 委派任务执行路径（经由
TaskExecutionService 完整走一遍）、task identity 保留、
depth=1 时不委派、Provider 失败安全、result 字段白名单（不含
prompt/context/raw response）、不影响 AI CEO/销售 Agent。

LLM 调用全部通过 monkeypatch app.agents.product_agent.llm_gateway
模拟，不发起真实网络请求；所有测试创建的任务按 id 精确清理。
"""

import json
import uuid
from datetime import datetime, timezone

import pytest

from app.agents import product_agent as product_agent_module
from app.agents.agent_registry import AgentRegistry
from app.agents.product_agent import ProductAgent, SUPPORTED_TASK_TYPE_LABELS
from app.database.db import SessionLocal
from app.llm.exceptions import ProviderUnavailableError
from app.llm.models import LLMResponse, LLMUsage
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.task_execution_service import TaskExecutionService

TEST_MARKER = "PRODUCT_AGENT_TEST"

_VALID_PRODUCT_JSON = json.dumps(
    {
        "summary": "s",
        "known_facts": [],
        "reasonable_assumptions": [],
        "data_gaps": ["尚未接入真实商品数据"],
        "opportunities": [],
        "selection_verdict": {
            "product": "",
            "recommendation": "need_more_data",
            "reason": "",
            "confidence": "low",
        },
        "assortment_plan": {
            "traffic_items": [],
            "profit_items": [],
            "filler_items": [],
        },
        "minimum_viable_test": {
            "what_to_test": "",
            "quantity": "",
            "channel": "",
            "duration": "",
            "required_materials": [],
            "success_signal": "",
            "stop_condition": "",
            "follow_up_data": [],
        },
        "listing_checklist": [],
        "supplier_questions": [],
        "next_actions": [],
        "required_inputs": [],
        "warnings": [],
    },
    ensure_ascii=False,
)


def _make_agent(suffix="A"):
    return ProductAgent(
        name=f"{TEST_MARKER}_{suffix}_{uuid.uuid4().hex[:6]}",
        role="product_manager",
        description="test",
    )


def _fake_llm_response(content=_VALID_PRODUCT_JSON):
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
# 四类支持任务识别
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "task_name",
    [
        "分析当前值得测试的商品方向",
        "根据现有条件提出商品机会",
        "找出适合小样本验证的产品方向",
        "分析鞋服类目商品机会",
    ],
)
def test_product_opportunity_tasks_are_supported(task_name):
    agent = _make_agent("OPP")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "product_analysis"


@pytest.mark.parametrize(
    "task_name",
    [
        "评估这个商品是否值得上架测试",
        "判断这个商品适不适合当前渠道",
        "分析某商品的用户需求和风险",
        "给出这个选品的保留或放弃建议",
    ],
)
def test_product_selection_tasks_are_supported(task_name):
    agent = _make_agent("SEL")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "product_analysis"


@pytest.mark.parametrize(
    "task_name",
    [
        "为店铺制定首批商品组合",
        "设计引流款利润款和补充款组合",
        "给出小批量组货方案",
        "规划首批测试 SKU 结构",
    ],
)
def test_product_assortment_tasks_are_supported(task_name):
    agent = _make_agent("ASSORT")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "product_analysis"


@pytest.mark.parametrize(
    "task_name",
    [
        "为商品上架制定准备清单",
        "输出商品资料图片标题和卖点准备项",
        "制定首批上架测试方案",
        "给出上架前需要补齐的信息",
    ],
)
def test_product_listing_prep_tasks_are_supported(task_name):
    agent = _make_agent("LISTING")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "product_analysis"


# ---------------------------------------------------------------------------
# 回归测试：AI CEO 委派场景下真实出现过的措辞
#
# 审查发现的实际情况：一条 AI CEO 委派的子任务标题为"设计自动化
# 任务模板以提升日常任务量"，被正确判定为 unsupported——该文本
# 确实不含任何商品/产品相关关键词，属于内部流程优化任务而非
# 产品任务，不是分类器 bug。为防止未来出现"模型用合理措辞描述
# 产品任务却被误判为 unsupported"的真实回归，这里锁定两条审查
# 中明确点名的措辞，以及分类器不应误判为 unsupported 的其它常见
# AI CEO 委派措辞；同时锁定分类器不应过度放宽、误伤财务/行政/
# 数据库类任务的负例。
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "task_name",
    [
        "分析当前值得推进的产品方向",
        "提出产品优化建议",
        "针对产品线给出下一步建议",
        "评估商品结构是否需要调整",
    ],
)
def test_realistic_ai_ceo_delegation_phrasings_are_supported(task_name):
    agent = _make_agent("REALISTIC")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "product_analysis"


def test_specific_sku_evaluation_without_generic_keyword_is_supported():
    """
    审查中发现的真实分类缺口：具体选品评估任务经常直接给出商品
    名称（如"LED灯带"）而不出现"商品"/"产品"/"选品"泛称词，但
    会出现"小样本测试"这类强相关措辞——补充"小样本"/"报价"关键词
    后必须能识别，不能因为缺少泛称词就误判为 unsupported。
    """

    agent = _make_agent("LED")
    task_name = (
        "评估0.85元/米LED灯带是否值得进入线上小样本测试；"
        "该价格仅作为用户提供的背景，不代表完整成本"
    )
    decision = agent.think({"task": task_name})
    assert decision["action"] == "product_analysis"


def test_non_product_automation_task_correctly_unsupported():
    """
    审查中实际出现过的委派文本："设计自动化任务模板以提升日常
    任务量"——不含任何商品/产品关键词，属于内部流程优化任务，
    正确判定为 unsupported，不是分类器 bug。
    """

    agent = _make_agent("NONPRODUCT")
    decision = agent.think({"task": "设计自动化任务模板以提升日常任务量"})
    assert decision["action"] == "unsupported_task"


@pytest.mark.parametrize(
    "task_name",
    [
        "生成本月财务报表",
        "核对本季度收入与成本数据",
        "安排明天的日程提醒",
        "检查数据库迁移版本",
        "调查近期任务量骤降原因并输出报告",
        "备份系统日志文件",
    ],
)
def test_keywords_not_overly_broad_finance_admin_db_tasks_unsupported(task_name):
    """
    确认关键词列表没有被放得过宽，财务/行政/数据库/日志类任务
    不会被误判为产品任务。
    """

    agent = _make_agent("NEGCTRL")
    decision = agent.think({"task": task_name})
    assert decision["action"] == "unsupported_task"


# ---------------------------------------------------------------------------
# 无关任务 unsupported，且不调用 LLM
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
            "产品 Agent 当前仅支持商品机会、选品评估、"
            "商品组合和上架准备类任务"
        ),
    }


def test_unsupported_task_never_calls_llm_gateway(monkeypatch):
    agent = _make_agent("UNSUPPORTED_NOCALL")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不支持的任务不应调用模型")

    monkeypatch.setattr(
        product_agent_module.llm_gateway, "generate", _fail_if_called
    )

    run_result = agent.run(
        context={"task": "检查数据库迁移版本"},
        task_name="检查数据库迁移版本",
    )

    assert run_result["success"] is True
    assert run_result["result"]["status"] == "unsupported_task"


def test_supported_task_type_labels_exposed():
    assert set(SUPPORTED_TASK_TYPE_LABELS) == {
        "商品机会分析",
        "选品评估",
        "商品组合与组货建议",
        "上架准备清单",
    }


# ---------------------------------------------------------------------------
# 直接任务真实执行路径；result 字段白名单
# ---------------------------------------------------------------------------


def test_direct_product_task_execute_returns_whitelisted_result(monkeypatch):
    agent = _make_agent("DIRECT")

    monkeypatch.setattr(
        product_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    decision = agent.think({"task": "分析当前值得测试的商品方向"})
    result = agent.execute(decision)

    assert set(result.keys()) == {
        "agent",
        "analysis_type",
        "generated_at",
        "provider",
        "model",
        "format",
        "product_analysis",
        "usage",
    }
    assert result["analysis_type"] == "product_strategy"
    assert result["format"] == "structured"
    assert "尚未接入真实商品数据" in result["product_analysis"]["data_gaps"]


def test_execute_never_leaks_prompt_or_raw_response(monkeypatch):
    agent = _make_agent("NOPROMPTLEAK")

    monkeypatch.setattr(
        product_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    decision = agent.think({"task": "分析当前值得测试的商品方向"})
    result = agent.execute(decision)

    result_text = json.dumps(result, ensure_ascii=False)
    assert "system_prompt" not in result_text
    assert "user_prompt" not in result_text
    assert "PRODUCT_AGENT_SYSTEM_PROMPT" not in result_text


# ---------------------------------------------------------------------------
# task identity 保留；depth=1 不委派
# ---------------------------------------------------------------------------


def test_product_agent_has_no_delegation_capability():
    """
    静态确认 product_agent.py 不 import TaskDelegationService（只
    检查真实的 import 语句），从模块层面排除"产品 Agent 继续委派"
    的可能性。
    """

    source_path = product_agent_module.__file__
    with open(source_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    import_lines = [
        line
        for line in lines
        if line.strip().startswith("import ") or line.strip().startswith("from ")
    ]

    assert not any("task_delegation_service" in line for line in import_lines)
    assert not any("TaskDelegationService" in line for line in import_lines)


def test_product_agent_never_imports_httpx_or_reads_env_directly():
    """
    产品 Agent 只能通过统一 LLM Gateway 调用模型：不直接 import
    httpx，不直接读取 DEEPSEEK_API_KEY 或 .env。
    """

    source_path = product_agent_module.__file__
    with open(source_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "import httpx" not in content
    assert "DEEPSEEK_API_KEY" not in content
    assert "dotenv" not in content


def test_depth_one_task_executes_normally_without_delegating(monkeypatch):
    agent = _make_agent("DEPTH1")

    monkeypatch.setattr(
        product_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    run_result = agent.run(
        context={"task": "为店铺制定首批商品组合"},
        task_name="为店铺制定首批商品组合",
        task_id="TASK-CHILD-X",
        delegation_depth=1,
        root_task_id="TASK-ROOT-X",
        parent_task_id="TASK-PARENT-X",
    )

    assert run_result["success"] is True
    assert run_result["result"]["format"] == "structured"
    assert "delegation" not in run_result["result"]


# ---------------------------------------------------------------------------
# Provider 失败安全
# ---------------------------------------------------------------------------


def test_provider_failure_propagates_safe_error_type(monkeypatch):
    agent = _make_agent("PROVFAIL")

    def _raise_provider_unavailable(request):
        raise ProviderUnavailableError()

    monkeypatch.setattr(
        product_agent_module.llm_gateway, "generate", _raise_provider_unavailable
    )

    run_result = agent.run(
        context={"task": "分析当前值得测试的商品方向"},
        task_name="分析当前值得测试的商品方向",
    )

    assert run_result["success"] is False
    assert run_result["error"] == "provider_unavailable"
    assert agent.status == "error"


# ---------------------------------------------------------------------------
# 经由 TaskExecutionService 的完整执行路径
# ---------------------------------------------------------------------------


def test_task_execution_service_completes_direct_product_task(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2EDIRECT")
    AgentRegistry.register(agent)

    monkeypatch.setattr(
        product_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    task_id = f"PRODUCTTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "分析当前值得测试的商品方向")
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


def test_task_execution_service_completes_ai_ceo_delegated_product_task(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2EDELEG")
    AgentRegistry.register(agent)

    monkeypatch.setattr(
        product_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    parent_id = f"PRODUCTTEST{uuid.uuid4().hex[:8].upper()}"
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

    child_id = f"PRODUCTTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(
        child_id,
        agent.name,
        "为店铺规划首批测试 SKU 结构",
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


def test_provider_failure_does_not_affect_ai_ceo_or_sales_agent(
    monkeypatch, cleanup_task_ids
):
    """
    产品 Agent 的 Provider 失败只影响自己这条任务，不影响 AI CEO
    或销售 Agent 的注册状态、状态字段或其它任务。
    """

    ai_ceo = AgentRegistry.get("AI CEO")
    ai_ceo_status_before = ai_ceo.status if ai_ceo else None

    sales_agent = AgentRegistry.get("销售 Agent")
    sales_status_before = sales_agent.status if sales_agent else None

    runtime_engine.running = True

    agent = _make_agent("E2EFAIL")
    AgentRegistry.register(agent)

    def _raise_provider_unavailable(request):
        raise ProviderUnavailableError()

    monkeypatch.setattr(
        product_agent_module.llm_gateway, "generate", _raise_provider_unavailable
    )

    task_id = f"PRODUCTTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "分析当前值得测试的商品方向")
    cleanup_task_ids.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()
        assert result.outcome == "failed"
        assert result.error_type == "provider_unavailable"

        row = _get_task_row(task_id)
        assert row.status == "failed"
        assert row.error == "AgentExecutionError:provider_unavailable"

        ai_ceo_after = AgentRegistry.get("AI CEO")
        if ai_ceo_after is not None and ai_ceo_status_before is not None:
            assert ai_ceo_after.status == ai_ceo_status_before

        sales_after = AgentRegistry.get("销售 Agent")
        if sales_after is not None and sales_status_before is not None:
            assert sales_after.status == sales_status_before
    finally:
        AgentRegistry.unregister(agent.name)
