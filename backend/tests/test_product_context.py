"""
ProductContextBuilder（build_product_context）测试（阶段 8D）。

覆盖：直接任务上下文（source=direct）、AI CEO 子任务上下文
（source=ai_ceo_delegation）、父任务不存在时安全降级、父任务
summary 白名单抽取（不整体泄露父任务 result）、同一 root_task_id
下销售 Agent 兄弟任务安全摘要读取（结构化结果才提取、非结构化
/不存在则安全跳过）、payload/context/Secret 不传给模型、
data_availability 默认全部 false、上下文大小/条数限制、控制字符
清理。
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.agents.product_context import build_product_context
from app.database.db import SessionLocal
from app.models.task_db import TaskDB

TEST_MARKER = "PRODUCT_CONTEXT_TEST"


def _make_task_id():
    return f"PRODCTX{uuid.uuid4().hex[:8].upper()}"


def _insert_task(
    *,
    task_id,
    assigned_agent="AI CEO",
    result=None,
    status="completed",
    root_task_id=None,
    completed_at=None,
):
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER}_task",
            assigned_agent=assigned_agent,
            priority="normal",
            status=status,
            payload={"task": "任务"},
            result=result,
            created_at=datetime.now(timezone.utc),
            completed_at=completed_at
            or (datetime.now(timezone.utc) if status == "completed" else None),
            root_task_id=root_task_id if root_task_id is not None else task_id,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return task_id


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
# 直接任务上下文 / AI CEO 子任务上下文
# ---------------------------------------------------------------------------


def test_direct_task_has_source_direct():
    context = build_product_context(
        agent_name="产品 Agent",
        task_name="分析当前值得测试的商品方向",
        priority="normal",
        task_id="TASK-FAKE",
        parent_task_id=None,
        root_task_id=None,
        delegation_depth=0,
    )

    assert context["task"]["source"] == "direct"
    assert context["task"]["delegation_depth"] == 0
    assert context["parent_analysis"]["summary"] is None
    assert context["sales_agent_reference"] == []


def test_delegated_task_has_source_ai_ceo_delegation(cleanup_task_ids):
    parent_id = _insert_task(
        task_id=_make_task_id(),
        result={
            "success": True,
            "result": {
                "analysis": {
                    "summary": "系统运行正常",
                    "findings": ["f1"],
                    "risks": ["r1"],
                    "actions": ["a1"],
                },
                "delegation": {
                    "items": [
                        {
                            "child_task_id": "TASK-CHILD-1",
                            "reason": "商品结构单一",
                        }
                    ]
                },
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="给出首批商品组合建议",
        priority="normal",
        task_id="TASK-CHILD-1",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
    )

    assert context["task"]["source"] == "ai_ceo_delegation"
    assert context["task"]["delegation_depth"] == 1
    assert context["parent_analysis"]["summary"] == "系统运行正常"
    assert context["parent_analysis"]["findings"] == ["f1"]
    assert context["parent_analysis"]["delegation_reason"] == "商品结构单一"


# ---------------------------------------------------------------------------
# 父任务不存在
# ---------------------------------------------------------------------------


def test_missing_parent_task_returns_empty_analysis_safely():
    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id="TASK-DOES-NOT-EXIST",
        root_task_id="TASK-DOES-NOT-EXIST",
        delegation_depth=1,
    )

    assert context["parent_analysis"] == {
        "summary": None,
        "findings": [],
        "risks": [],
        "actions": [],
        "delegation_reason": None,
    }


def test_parent_without_result_returns_empty_analysis_safely(cleanup_task_ids):
    parent_id = _insert_task(task_id=_make_task_id(), result=None, status="running")
    cleanup_task_ids.append(parent_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
    )

    assert context["parent_analysis"]["summary"] is None


# ---------------------------------------------------------------------------
# 父任务 summary 白名单，不整体泄露 result
# ---------------------------------------------------------------------------


def test_parent_analysis_only_whitelisted_fields(cleanup_task_ids):
    parent_id = _insert_task(
        task_id=_make_task_id(),
        result={
            "success": True,
            "result": {
                "provider": "deepseek",
                "model": "deepseek-chat",
                "analysis": {
                    "summary": "s",
                    "findings": ["f"],
                    "risks": ["r"],
                    "actions": ["a"],
                },
                "usage": {"input_tokens": 100, "output_tokens": 50},
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
    )

    assert set(context["parent_analysis"].keys()) == {
        "summary",
        "findings",
        "risks",
        "actions",
        "delegation_reason",
    }
    context_text = str(context)
    assert "deepseek-chat" not in context_text


def test_parent_result_not_leaked_wholesale(cleanup_task_ids):
    parent_id = _insert_task(
        task_id=_make_task_id(),
        result={
            "success": True,
            "result": {
                "analysis": {
                    "summary": "s",
                    "findings": [],
                    "risks": [],
                    "actions": [],
                },
            },
            "sensitive_marker": "SHOULD-NOT-LEAK-INTO-CONTEXT",
        },
    )
    cleanup_task_ids.append(parent_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
    )

    assert "SHOULD-NOT-LEAK-INTO-CONTEXT" not in str(context)


# ---------------------------------------------------------------------------
# 销售 Agent 兄弟任务安全摘要
# ---------------------------------------------------------------------------


def test_sales_sibling_structured_result_extracted_safely(cleanup_task_ids):
    root_id = _make_task_id()
    _insert_task(task_id=root_id, assigned_agent="AI CEO", result=None)
    cleanup_task_ids.append(root_id)

    sales_task_id = _make_task_id()
    _insert_task(
        task_id=sales_task_id,
        assigned_agent="销售 Agent",
        root_task_id=root_id,
        result={
            "success": True,
            "result": {
                "agent": "销售 Agent",
                "format": "structured",
                "provider": "deepseek",
                "model": "deepseek-chat",
                "sales_analysis": {
                    "summary": "目标人群是年轻女性",
                    "known_facts": ["k1"],
                    "data_gaps": ["尚未接入真实订单数据"],
                    "opportunities": [
                        {"title": "机会1", "reason": "r", "confidence": "high"}
                    ],
                    "strategy": {
                        "target": "年轻女性",
                        "positioning": "高性价比",
                        "channel_plan": [],
                        "content_plan": [],
                        "conversion_plan": [],
                    },
                    "actions_today": [],
                    "seven_day_plan": [],
                    "required_inputs": ["素材"],
                    "warnings": ["w1"],
                },
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        },
    )
    cleanup_task_ids.append(sales_task_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="给出首批商品组合建议",
        priority="normal",
        task_id="TASK-PRODUCT-CHILD",
        parent_task_id=root_id,
        root_task_id=root_id,
        delegation_depth=1,
    )

    reference = context["sales_agent_reference"]
    assert len(reference) == 1
    assert reference[0]["summary"] == "目标人群是年轻女性"
    assert reference[0]["strategy_target"] == "年轻女性"
    assert reference[0]["strategy_positioning"] == "高性价比"
    assert reference[0]["opportunity_titles"] == ["机会1"]
    assert reference[0]["required_inputs"] == ["素材"]
    assert reference[0]["warnings"] == ["w1"]

    # 不泄露 provider/model/usage 等原始字段
    context_text = str(context)
    assert "deepseek-chat" not in context_text


def test_sales_sibling_text_format_is_skipped_not_leaked(cleanup_task_ids):
    root_id = _make_task_id()
    _insert_task(task_id=root_id, assigned_agent="AI CEO", result=None)
    cleanup_task_ids.append(root_id)

    sales_task_id = _make_task_id()
    _insert_task(
        task_id=sales_task_id,
        assigned_agent="销售 Agent",
        root_task_id=root_id,
        result={
            "success": True,
            "result": {
                "agent": "销售 Agent",
                "format": "text",
                "sales_analysis": {"text": "纯文本降级结果"},
            },
        },
    )
    cleanup_task_ids.append(sales_task_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="给出首批商品组合建议",
        priority="normal",
        task_id="TASK-PRODUCT-CHILD",
        parent_task_id=root_id,
        root_task_id=root_id,
        delegation_depth=1,
    )

    assert context["sales_agent_reference"] == []


def test_sales_sibling_excludes_non_completed_tasks(cleanup_task_ids):
    root_id = _make_task_id()
    _insert_task(task_id=root_id, assigned_agent="AI CEO", result=None)
    cleanup_task_ids.append(root_id)

    running_sales_task_id = _make_task_id()
    _insert_task(
        task_id=running_sales_task_id,
        assigned_agent="销售 Agent",
        root_task_id=root_id,
        status="running",
        result=None,
    )
    cleanup_task_ids.append(running_sales_task_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="给出首批商品组合建议",
        priority="normal",
        task_id="TASK-PRODUCT-CHILD",
        parent_task_id=root_id,
        root_task_id=root_id,
        delegation_depth=1,
    )

    assert context["sales_agent_reference"] == []


def test_sales_sibling_limited_to_three_most_recent(cleanup_task_ids):
    root_id = _make_task_id()
    _insert_task(task_id=root_id, assigned_agent="AI CEO", result=None)
    cleanup_task_ids.append(root_id)

    for i in range(5):
        sales_task_id = _make_task_id()
        _insert_task(
            task_id=sales_task_id,
            assigned_agent="销售 Agent",
            root_task_id=root_id,
            result={
                "success": True,
                "result": {
                    "agent": "销售 Agent",
                    "format": "structured",
                    "sales_analysis": {
                        "summary": f"summary-{i}",
                        "known_facts": [],
                        "data_gaps": [],
                        "opportunities": [],
                        "strategy": {},
                        "actions_today": [],
                        "seven_day_plan": [],
                        "required_inputs": [],
                        "warnings": [],
                    },
                },
            },
        )
        cleanup_task_ids.append(sales_task_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="给出首批商品组合建议",
        priority="normal",
        task_id="TASK-PRODUCT-CHILD",
        parent_task_id=root_id,
        root_task_id=root_id,
        delegation_depth=1,
    )

    assert len(context["sales_agent_reference"]) == 3


def test_sales_sibling_never_leaks_payload_or_secrets(cleanup_task_ids):
    root_id = _make_task_id()
    _insert_task(task_id=root_id, assigned_agent="AI CEO", result=None)
    cleanup_task_ids.append(root_id)

    sales_task_id = _make_task_id()
    _insert_task(
        task_id=sales_task_id,
        assigned_agent="销售 Agent",
        root_task_id=root_id,
        result={
            "success": True,
            "result": {
                "agent": "销售 Agent",
                "format": "structured",
                "sales_analysis": {
                    "summary": "s",
                    "known_facts": [],
                    "data_gaps": [],
                    "opportunities": [],
                    "strategy": {},
                    "actions_today": [],
                    "seven_day_plan": [],
                    "required_inputs": [],
                    "warnings": [],
                },
                "usage": {"input_tokens": 999},
            },
        },
    )
    cleanup_task_ids.append(sales_task_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="给出首批商品组合建议",
        priority="normal",
        task_id="TASK-PRODUCT-CHILD",
        parent_task_id=root_id,
        root_task_id=root_id,
        delegation_depth=1,
    )

    context_text = str(context)
    assert "999" not in context_text
    assert "payload" not in context_text


# ---------------------------------------------------------------------------
# payload/context/Secret 不传给模型
# ---------------------------------------------------------------------------


def test_context_never_contains_raw_payload_or_secrets(cleanup_task_ids):
    parent_id = _insert_task(
        task_id=_make_task_id(),
        result={
            "success": True,
            "result": {
                "analysis": {
                    "summary": "s",
                    "findings": [],
                    "risks": [],
                    "actions": [],
                },
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
    )

    context_text = str(context)
    assert "DEEPSEEK_API_KEY" not in context_text
    assert "postgresql://" not in context_text


# ---------------------------------------------------------------------------
# data_availability 默认 false
# ---------------------------------------------------------------------------


def test_data_availability_defaults_all_false():
    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-X",
        parent_task_id=None,
        root_task_id=None,
        delegation_depth=0,
    )

    for value in context["data_availability"].values():
        assert value is False


# ---------------------------------------------------------------------------
# 上下文大小限制 / 控制字符清理
# ---------------------------------------------------------------------------


def test_context_size_bounded_even_with_huge_parent_analysis(cleanup_task_ids):
    parent_id = _insert_task(
        task_id=_make_task_id(),
        result={
            "success": True,
            "result": {
                "analysis": {
                    "summary": "s" * 5000,
                    "findings": [f"finding-{i}" * 50 for i in range(100)],
                    "risks": [],
                    "actions": [],
                },
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="商品机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
    )

    assert len(context["parent_analysis"]["summary"]) <= 300
    assert len(context["parent_analysis"]["findings"]) <= 8


def test_task_title_strips_control_characters():
    dirty_title = "商品机会分析\x00\x01\x08带有控制字符"

    context = build_product_context(
        agent_name="产品 Agent",
        task_name=dirty_title,
        priority="normal",
        task_id="TASK-X",
        parent_task_id=None,
        root_task_id=None,
        delegation_depth=0,
    )

    title = context["task"]["title"]
    assert "\x00" not in title
    assert "\x01" not in title
    assert "\x08" not in title
    assert "商品机会分析" in title
