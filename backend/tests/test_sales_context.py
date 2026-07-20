"""
SalesContextBuilder（build_sales_context）测试（阶段 8C）。

覆盖：直接任务上下文（source=direct）、AI CEO 子任务上下文
（source=ai_ceo_delegation）、父任务不存在时安全降级、父任务
summary 白名单抽取（不整体泄露父任务 result）、payload/context/
Secret 不传给模型、data_availability 默认全部 false、上下文
大小/条数限制、控制字符清理。
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.agents.sales_context import build_sales_context
from app.database.db import SessionLocal
from app.models.task_db import TaskDB

TEST_MARKER = "SALES_CONTEXT_TEST"


def _make_task_id():
    return f"SALESCTX{uuid.uuid4().hex[:8].upper()}"


def _insert_task(*, task_id, result=None, status="completed"):
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER}_task",
            assigned_agent="AI CEO",
            priority="normal",
            status=status,
            payload={"task": "生成今日经营分析"},
            result=result,
            created_at=datetime.now(timezone.utc),
            root_task_id=task_id,
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
# 6/7. 直接任务上下文 / AI CEO 子任务上下文
# ---------------------------------------------------------------------------


def test_direct_task_has_source_direct():
    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="制定未来7天销售计划",
        priority="normal",
        task_id="TASK-FAKE",
        parent_task_id=None,
        delegation_depth=0,
    )

    assert context["task"]["source"] == "direct"
    assert context["task"]["delegation_depth"] == 0
    assert context["parent_analysis"]["summary"] is None


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
                            "reason": "销售活跃度低",
                        }
                    ]
                },
            },
        },
    )
    cleanup_task_ids.append(parent_id)

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="分析近30天任务量低的原因",
        priority="normal",
        task_id="TASK-CHILD-1",
        parent_task_id=parent_id,
        delegation_depth=1,
    )

    assert context["task"]["source"] == "ai_ceo_delegation"
    assert context["task"]["delegation_depth"] == 1
    assert context["parent_analysis"]["summary"] == "系统运行正常"
    assert context["parent_analysis"]["findings"] == ["f1"]
    assert context["parent_analysis"]["delegation_reason"] == "销售活跃度低"


# ---------------------------------------------------------------------------
# 8. 父任务不存在
# ---------------------------------------------------------------------------


def test_missing_parent_task_returns_empty_analysis_safely():
    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id="TASK-DOES-NOT-EXIST",
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

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        delegation_depth=1,
    )

    assert context["parent_analysis"]["summary"] is None


# ---------------------------------------------------------------------------
# 9/10. 父任务 summary 白名单，不整体泄露 result
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

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        delegation_depth=1,
    )

    assert set(context["parent_analysis"].keys()) == {
        "summary",
        "findings",
        "risks",
        "actions",
        "delegation_reason",
    }
    # provider/model/usage 等父任务 result 的其它字段不得泄露到
    # 上下文任何位置。
    context_text = str(context)
    assert "deepseek-chat" not in context_text
    assert "100" not in context_text or "input_tokens" not in context_text


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

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        delegation_depth=1,
    )

    assert "SHOULD-NOT-LEAK-INTO-CONTEXT" not in str(context)


# ---------------------------------------------------------------------------
# 11/12. payload/context/Secret 不传给模型
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

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        delegation_depth=1,
    )

    context_text = str(context)
    assert "payload" not in context_text
    assert "DEEPSEEK_API_KEY" not in context_text
    assert "postgresql://" not in context_text


# ---------------------------------------------------------------------------
# 13. data_availability 默认 false
# ---------------------------------------------------------------------------


def test_data_availability_defaults_all_false():
    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-X",
        parent_task_id=None,
        delegation_depth=0,
    )

    for value in context["data_availability"].values():
        assert value is False


# ---------------------------------------------------------------------------
# 14. 上下文大小限制
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

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name="销售机会分析",
        priority="normal",
        task_id="TASK-CHILD",
        parent_task_id=parent_id,
        delegation_depth=1,
    )

    assert len(context["parent_analysis"]["summary"]) <= 300
    assert len(context["parent_analysis"]["findings"]) <= 8


# ---------------------------------------------------------------------------
# 15. 控制字符清理
# ---------------------------------------------------------------------------


def test_task_title_strips_control_characters():
    dirty_title = "销售机会分析\x00\x01\x08带有控制字符"

    context = build_sales_context(
        agent_name="销售 Agent",
        task_name=dirty_title,
        priority="normal",
        task_id="TASK-X",
        parent_task_id=None,
        delegation_depth=0,
    )

    title = context["task"]["title"]
    assert "\x00" not in title
    assert "\x01" not in title
    assert "\x08" not in title
    assert "销售机会分析" in title
