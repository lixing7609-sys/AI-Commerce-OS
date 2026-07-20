"""
AICEOAgent（阶段 8A：AI CEO 真实经营分析能力）测试。

覆盖：支持/不支持任务识别、真实系统数据上下文（不含 payload/
context/Secret 原文）、structured JSON 解析与 text 兜底、Provider
失败时的安全写入、以及经由 TaskExecutionService 的完整
completed/failed 语义。LLM 调用全部通过 monkeypatch
app.agents.ai_ceo_agent.llm_gateway.generate 模拟，不发起真实
网络请求。
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.agents import ai_ceo_agent as ai_ceo_agent_module
from app.agents.agent_registry import AgentRegistry
from app.agents.ai_ceo_agent import AICEOAgent, SUPPORTED_TASK_KEYWORDS
from app.database.db import SessionLocal
from app.llm.exceptions import ProviderUnavailableError
from app.llm.models import LLMResponse, LLMUsage
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.task_execution_service import TaskExecutionService

TEST_MARKER = "AI_CEO_TEST_MARKER"


def _make_agent(suffix="A"):
    return AICEOAgent(
        name=f"{TEST_MARKER}_{suffix}_{uuid.uuid4().hex[:6]}",
        role="chief_executive",
        description="test",
    )


def _fake_llm_response(content='{"summary": "s", "findings": [], "risks": [], "actions": [], "delegations": []}'):
    return LLMResponse(
        content=content,
        provider="ollama",
        model="test-model",
        usage=LLMUsage(input_tokens=1, output_tokens=2, total_tokens=3),
        latency_ms=12.3,
    )


# ---------------------------------------------------------------------------
# 14/15. 支持任务识别 / 不支持任务
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "task_name",
    [
        "生成今日经营分析",
        "分析当前系统运行情况",
        "给出今日行动建议",
        "总结最近7天任务执行情况",
    ],
)
def test_think_recognizes_supported_operations_tasks(task_name):
    agent = _make_agent("SUPPORTED")

    decision = agent.think({"task": task_name})

    assert decision["action"] == "system_operations_analysis"
    assert "analysis_context" in decision


def test_think_marks_unsupported_task(monkeypatch):
    agent = _make_agent("UNSUPPORTED")

    decision = agent.think({"task": "帮我写一首诗"})

    assert decision["action"] == "unsupported_task"

    result = agent.execute(decision)

    assert result == {
        "status": "unsupported_task",
        "message": "AI CEO 当前仅支持系统经营分析任务",
    }


def test_unsupported_task_does_not_call_llm_gateway(monkeypatch):
    agent = _make_agent("UNSUPPORTED_NOCALL")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不支持的任务不应调用模型")

    monkeypatch.setattr(ai_ceo_agent_module.llm_gateway, "generate", _fail_if_called)

    run_result = agent.run(context={"task": "帮我订机票"}, task_name="帮我订机票")

    assert run_result["success"] is True
    assert run_result["result"]["status"] == "unsupported_task"


def test_supported_task_keywords_exposed_for_frontend():
    assert len(SUPPORTED_TASK_KEYWORDS) > 0
    assert all(isinstance(kw, str) for kw in SUPPORTED_TASK_KEYWORDS)


# ---------------------------------------------------------------------------
# 16/17/18. 真实系统数据上下文；不传递 payload/context 原文；不传递 Secret
# ---------------------------------------------------------------------------


def test_think_context_has_expected_top_level_keys():
    agent = _make_agent("CONTEXT")

    decision = agent.think({"task": "生成今日经营分析"})
    context = decision["analysis_context"]

    assert set(context.keys()) == {"runtime", "tasks", "agents", "integrations"}
    assert isinstance(context["agents"], list)
    assert "recent_failed_tasks" in context["tasks"]


def test_analysis_context_never_contains_raw_task_payload_or_secrets():
    agent = _make_agent("NOPAYLOAD")

    sensitive_context = {
        "task": "生成今日经营分析",
        "secret_token": "SENSITIVE-PAYLOAD-VALUE-999",
        "customer_email": "user@example.com",
    }

    decision = agent.think(sensitive_context)
    context_text = str(decision["analysis_context"])

    assert "SENSITIVE-PAYLOAD-VALUE-999" not in context_text
    assert "user@example.com" not in context_text
    assert "secret_token" not in context_text


def test_integrations_context_is_boolean_only():
    agent = _make_agent("INTEGRATIONS")

    decision = agent.think({"task": "生成今日经营分析"})
    integrations = decision["analysis_context"]["integrations"]

    for value in integrations.values():
        assert isinstance(value, bool)


def test_execute_sends_only_context_derived_prompt_to_gateway(monkeypatch):
    agent = _make_agent("PROMPT")

    captured_requests = []

    def _fake_generate(request):
        captured_requests.append(request)
        return _fake_llm_response()

    monkeypatch.setattr(ai_ceo_agent_module.llm_gateway, "generate", _fake_generate)

    decision = agent.think(
        {
            "task": "生成今日经营分析",
            "raw_secret_field": "SHOULD-NOT-REACH-PROMPT",
        }
    )
    agent.execute(decision)

    assert len(captured_requests) == 1
    assert "SHOULD-NOT-REACH-PROMPT" not in captured_requests[0].user_prompt
    assert "SHOULD-NOT-REACH-PROMPT" not in captured_requests[0].system_prompt


# ---------------------------------------------------------------------------
# 19/20. structured JSON / text fallback
# ---------------------------------------------------------------------------


def test_execute_returns_structured_format_for_valid_json(monkeypatch):
    agent = _make_agent("STRUCTURED")

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(
            '{"summary": "今日一切正常", "findings": ["f1"], "risks": [], "actions": ["a1"], "delegations": []}'
        ),
    )

    decision = agent.think({"task": "生成今日经营分析"})
    result = agent.execute(decision)

    assert result["format"] == "structured"
    assert result["analysis"]["summary"] == "今日一切正常"
    assert result["analysis"]["findings"] == ["f1"]
    assert result["provider"] == "ollama"
    assert result["usage"] == {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3}


def test_execute_falls_back_to_text_for_invalid_json(monkeypatch):
    agent = _make_agent("TEXTFALLBACK")

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response("这不是 JSON，只是一段自然语言分析。"),
    )

    decision = agent.think({"task": "生成今日经营分析"})
    result = agent.execute(decision)

    assert result["format"] == "text"
    assert result["analysis"]["text"] == "这不是 JSON，只是一段自然语言分析。"


# ---------------------------------------------------------------------------
# 21. Provider 失败安全写入
# ---------------------------------------------------------------------------


def test_provider_failure_propagates_safe_error_type_via_run(monkeypatch):
    agent = _make_agent("PROVFAIL")

    def _raise_provider_unavailable(request):
        raise ProviderUnavailableError()

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway, "generate", _raise_provider_unavailable
    )

    run_result = agent.run(
        context={"task": "生成今日经营分析"}, task_name="生成今日经营分析"
    )

    assert run_result["success"] is False
    assert run_result["error"] == "provider_unavailable"
    assert agent.status == "error"
    assert agent.to_dict()["last_llm_call_status"] == "provider_unavailable"


def test_successful_call_updates_last_llm_call_status(monkeypatch):
    agent = _make_agent("SUCCESSSTATUS")

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    agent.run(context={"task": "生成今日经营分析"}, task_name="生成今日经营分析")

    assert agent.to_dict()["last_llm_call_status"] == "success"


# ---------------------------------------------------------------------------
# to_dict() 增强字段
# ---------------------------------------------------------------------------


def test_to_dict_exposes_llm_fields_without_network_call(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("to_dict() 不应发起网络请求")

    import httpx

    monkeypatch.setattr(httpx, "get", _fail_if_called)
    monkeypatch.setattr(httpx, "post", _fail_if_called)

    agent = _make_agent("TODICT")
    data = agent.to_dict()

    assert data["llm_provider"] == "ollama"
    assert data["llm_model"] == "qwen2.5:7b"
    assert data["supported_task_types"] == list(SUPPORTED_TASK_KEYWORDS)
    assert data["last_llm_call_status"] is None


# ---------------------------------------------------------------------------
# 22/23/24. 经由 TaskExecutionService 的完整 completed/failed 语义
# ---------------------------------------------------------------------------


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


def test_task_execution_service_completes_task_on_llm_success(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2ESUCCESS")
    AgentRegistry.register(agent)

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: _fake_llm_response(),
    )

    task_id = f"AICEOTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "生成今日经营分析")
    cleanup_task_ids.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()

        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        assert row.status == "completed"
        assert row.result["result"]["format"] == "structured"
    finally:
        AgentRegistry.unregister(agent.name)


def test_task_execution_service_fails_task_with_safe_error_type_on_llm_failure(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2EFAIL")
    AgentRegistry.register(agent)

    monkeypatch.setattr(
        ai_ceo_agent_module.llm_gateway,
        "generate",
        lambda request: (_ for _ in ()).throw(ProviderUnavailableError()),
    )

    task_id = f"AICEOTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "生成今日经营分析")
    cleanup_task_ids.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()

        assert result.outcome == "failed"
        assert result.error_type == "provider_unavailable"

        row = _get_task_row(task_id)
        assert row.status == "failed"
        assert row.error == "AgentExecutionError:provider_unavailable"
        assert row.result is None
    finally:
        AgentRegistry.unregister(agent.name)


def test_task_execution_service_completes_unsupported_task(
    monkeypatch, cleanup_task_ids
):
    runtime_engine.running = True

    agent = _make_agent("E2EUNSUPPORTED")
    AgentRegistry.register(agent)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不支持的任务不应调用模型")

    monkeypatch.setattr(ai_ceo_agent_module.llm_gateway, "generate", _fail_if_called)

    task_id = f"AICEOTEST{uuid.uuid4().hex[:8].upper()}"
    _insert_task(task_id, agent.name, "帮我写一首诗")
    cleanup_task_ids.append(task_id)

    try:
        result = TaskExecutionService.process_next_pending_task()

        assert result.outcome == "completed"

        row = _get_task_row(task_id)
        assert row.status == "completed"
        assert row.result["result"]["status"] == "unsupported_task"
    finally:
        AgentRegistry.unregister(agent.name)
