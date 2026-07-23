"""
DeliverableService（阶段 8E）测试。

覆盖：AI CEO/销售/产品 Agent 已完成任务自动生成成果、failed/
unsupported 不生成、幂等（自动+手动不重复创建）、手动 from-task、
审核状态流转（approve/reject/archive/restore）、版本递增与历史
版本只读、基于成果创建后续任务（含 shop_id 继承）。

直接构造 TaskDB 行并调用 TaskExecutionService.complete_task()
模拟"任务成功完成"，不调用真实 LLM、不发起真实网络请求。所有
测试创建的任务/成果/版本均按精确 id 清理。
"""

import uuid
from datetime import datetime, timezone

import pytest

from app.agents.agent_registry import AgentRegistry
from app.agents.base_agent import BaseAgent
from app.database.db import SessionLocal
from app.models.deliverable_db import DeliverableDB, DeliverableVersionDB
from app.models.task_db import TaskDB
from app.services.deliverable_service import (
    DeliverableNotFoundError,
    DeliverableService,
    NoDeliverableContentError,
    TaskNotCompletedError,
    TaskNotFoundError,
)
from app.services.task_execution_service import TaskExecutionService

TEST_MARKER = "DELIVERABLE_TEST"


def _make_task_id():
    return f"TASKDLV{uuid.uuid4().hex[:10].upper()}"


def _insert_task(*, status="running", assigned_agent="AI CEO", shop_id=None, task_type="经营分析测试"):
    db = SessionLocal()
    task_id = _make_task_id()
    try:
        row = TaskDB(
            id=task_id,
            task_type=task_type,
            assigned_agent=assigned_agent,
            priority="normal",
            status=status,
            payload={"task": task_type, "source": TEST_MARKER},
            created_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc) if status == "running" else None,
            root_task_id=task_id,
            shop_id=shop_id,
        )
        db.add(row)
        db.commit()
        return task_id
    finally:
        db.close()


def _delete_task(task_id):
    db = SessionLocal()
    try:
        db.query(TaskDB).filter(TaskDB.id == task_id).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _delete_deliverable(deliverable_id):
    if deliverable_id is None:
        return
    db = SessionLocal()
    try:
        db.query(DeliverableVersionDB).filter(
            DeliverableVersionDB.deliverable_id == deliverable_id
        ).delete(synchronize_session=False)
        db.query(DeliverableDB).filter(DeliverableDB.id == deliverable_id).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


@pytest.fixture
def cleanup():
    task_ids = []
    deliverable_ids = []

    yield task_ids, deliverable_ids

    for did in deliverable_ids:
        _delete_deliverable(did)
    for tid in task_ids:
        _delete_task(tid)


CEO_ENVELOPE = {
    "success": True,
    "agent": "AI CEO",
    "decision": {"action": "system_operations_analysis"},
    "result": {
        "agent": "AI CEO",
        "analysis_type": "system_operations",
        "generated_at": "2026-07-21T00:00:00+00:00",
        "provider": "deepseek",
        "model": "deepseek-chat",
        "delegation": {"status": "none", "created_count": 0, "skipped_count": 0, "child_task_ids": [], "items": []},
        "format": "structured",
        "analysis": {
            "summary": "本周经营平稳",
            "findings": ["任务完成率保持稳定"],
            "risks": ["部分任务依赖单一 Agent"],
            "actions": ["补充销售数据来源"],
            "delegations": [],
        },
        "usage": {"input_tokens": 10, "output_tokens": 20, "total_tokens": 30},
    },
}


def _sales_envelope():
    return {
        "success": True,
        "agent": "销售 Agent",
        "decision": {"action": "sales_analysis"},
        "result": {
            "agent": "销售 Agent",
            "analysis_type": "sales_strategy",
            "generated_at": "2026-07-21T00:00:00+00:00",
            "provider": "deepseek",
            "model": "deepseek-chat",
            "format": "structured",
            "sales_analysis": {
                "summary": "小样本冷启动建议",
                "known_facts": ["尚无历史销量"],
                "data_gaps": ["缺少客单价数据"],
                "opportunities": [{"title": "私域测试", "reason": "成本可控", "confidence": "medium"}],
                "strategy": {
                    "target": "验证初始转化率",
                    "positioning": "高性价比",
                    "channel_plan": ["私域小范围测试"],
                    "content_plan": [],
                    "conversion_plan": [],
                },
                "actions_today": [],
                "seven_day_plan": [],
                "required_inputs": ["历史客单价"],
                "warnings": ["数据样本小，结论需谨慎"],
            },
            "usage": None,
        },
    }


def _product_envelope():
    return {
        "success": True,
        "agent": "产品 Agent",
        "decision": {"action": "product_analysis"},
        "result": {
            "agent": "产品 Agent",
            "analysis_type": "product_strategy",
            "generated_at": "2026-07-21T00:00:00+00:00",
            "provider": "deepseek",
            "model": "deepseek-chat",
            "format": "structured",
            "product_analysis": {
                "summary": "LED 灯带小样本测试建议",
                "known_facts": [],
                "reasonable_assumptions": [],
                "data_gaps": ["缺少供应商报价"],
                "opportunities": [],
                "selection_verdict": {
                    "product": "LED 灯带",
                    "recommendation": "test",
                    "reason": "需求存在但缺少验证数据",
                    "confidence": "medium",
                },
                "assortment_plan": {"traffic_items": [], "profit_items": [], "filler_items": []},
                "minimum_viable_test": {
                    "what_to_test": "小样本转化",
                    "quantity": "50件",
                    "channel": "私域",
                    "duration": "7天",
                    "required_materials": [],
                    "success_signal": "",
                    "stop_condition": "",
                    "follow_up_data": [],
                },
                "listing_checklist": [],
                "supplier_questions": ["报价是否含运费"],
                "next_actions": ["联系供应商询价"],
                "required_inputs": [],
                "warnings": [],
            },
            "usage": None,
        },
    }


UNSUPPORTED_ENVELOPE = {
    "success": True,
    "agent": "AI CEO",
    "decision": {"action": "unsupported_task"},
    "result": {"status": "unsupported_task", "message": "AI CEO 当前仅支持系统经营分析任务"},
}

CAPABILITY_NOT_IMPLEMENTED_ENVELOPE = {
    "success": True,
    "agent": "财务 Agent",
    "decision": {"agent": "财务 Agent", "task": "记录本月支出"},
    "result": {
        "status": "capability_not_implemented",
        "agent": "财务 Agent",
        "message": "该 AI 员工的业务能力将在后续阶段接入",
    },
}


# ---------------------------------------------------------------------------
# 自动生成
# ---------------------------------------------------------------------------


def test_completed_ceo_task_auto_generates_deliverable(cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_task(assigned_agent="AI CEO")
    task_ids.append(task_id)

    result = TaskExecutionService.complete_task(task_id, CEO_ENVELOPE)
    assert result.outcome == "completed"

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    assert deliverable is not None
    deliverable_ids.append(deliverable.id)
    assert deliverable.deliverable_type == "ceo_analysis"
    assert deliverable.status == "pending_review"
    assert deliverable.agent_name == "AI CEO"
    assert deliverable.root_task_id == task_id
    assert deliverable.current_version == 1

    version = DeliverableService.get_current_version(deliverable)
    assert version is not None
    assert version.structured_content["summary"] == "本周经营平稳"


def test_completed_sales_task_auto_generates_deliverable(cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_task(assigned_agent="销售 Agent")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, _sales_envelope())

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    assert deliverable is not None
    deliverable_ids.append(deliverable.id)
    assert deliverable.deliverable_type == "sales_analysis"


def test_completed_product_task_auto_generates_deliverable(cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_task(assigned_agent="产品 Agent")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, _product_envelope())

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    assert deliverable is not None
    deliverable_ids.append(deliverable.id)
    assert deliverable.deliverable_type == "product_analysis"


def test_unsupported_task_does_not_generate_deliverable(cleanup):
    task_ids, _ = cleanup
    task_id = _insert_task(assigned_agent="AI CEO")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, UNSUPPORTED_ENVELOPE)

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    assert deliverable is None


def test_capability_not_implemented_task_does_not_generate_deliverable(cleanup):
    task_ids, _ = cleanup
    task_id = _insert_task(assigned_agent="财务 Agent")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, CAPABILITY_NOT_IMPLEMENTED_ENVELOPE)

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    assert deliverable is None


def test_failed_task_does_not_generate_deliverable(cleanup):
    task_ids, _ = cleanup
    task_id = _insert_task(assigned_agent="AI CEO")
    task_ids.append(task_id)

    TaskExecutionService.fail_task(task_id, "LLMGatewayError")

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    assert deliverable is None


def test_auto_generation_is_idempotent_on_retry(cleanup):
    """
    Consumer 重试场景的近似模拟：complete_task 已经成功一次后，
    第二次直接调用生成逻辑（模拟意外重试）不应创建第二条成果。
    """

    task_ids, deliverable_ids = cleanup
    task_id = _insert_task(assigned_agent="AI CEO")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, CEO_ENVELOPE)

    first = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    deliverable_ids.append(first.id)

    # 直接重复调用底层生成方法（不重新执行整条 complete_task），
    # 验证幂等：不抛异常、返回同一条记录、不新增数据库行。
    second = DeliverableService.generate_for_completed_task(task_id)
    assert second is not None
    assert second.id == first.id

    count = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .count()
    )
    assert count == 1


# ---------------------------------------------------------------------------
# 手动从任务生成
# ---------------------------------------------------------------------------


def test_manual_create_from_completed_task(cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_task(assigned_agent="AI CEO", status="completed")

    db = SessionLocal()
    try:
        row = db.query(TaskDB).filter(TaskDB.id == task_id).first()
        row.result = CEO_ENVELOPE
        row.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    task_ids.append(task_id)

    deliverable = DeliverableService.create_from_task(task_id)
    deliverable_ids.append(deliverable.id)
    assert deliverable.source_task_id == task_id

    # 幂等：再次调用返回同一条记录
    again = DeliverableService.create_from_task(task_id)
    assert again.id == deliverable.id


def test_manual_create_from_task_rejects_running_task(cleanup):
    task_ids, _ = cleanup
    task_id = _insert_task(assigned_agent="AI CEO", status="running")
    task_ids.append(task_id)

    with pytest.raises(TaskNotCompletedError):
        DeliverableService.create_from_task(task_id)


def test_manual_create_from_task_rejects_missing_task():
    with pytest.raises(TaskNotFoundError):
        DeliverableService.create_from_task("TASKDLVMISSING000000")


def test_manual_create_from_task_rejects_no_content(cleanup):
    task_ids, _ = cleanup
    task_id = _insert_task(assigned_agent="AI CEO", status="completed")

    db = SessionLocal()
    try:
        row = db.query(TaskDB).filter(TaskDB.id == task_id).first()
        row.result = UNSUPPORTED_ENVELOPE
        row.completed_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    task_ids.append(task_id)

    with pytest.raises(NoDeliverableContentError):
        DeliverableService.create_from_task(task_id)


# ---------------------------------------------------------------------------
# 审核状态流转
# ---------------------------------------------------------------------------


def _create_ceo_deliverable(cleanup):
    task_ids, deliverable_ids = cleanup
    task_id = _insert_task(assigned_agent="AI CEO")
    task_ids.append(task_id)
    TaskExecutionService.complete_task(task_id, CEO_ENVELOPE)
    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    deliverable_ids.append(deliverable.id)
    return task_id, deliverable.id


def test_approve_sets_status_and_timestamp(cleanup):
    _, deliverable_id = _create_ceo_deliverable(cleanup)

    approved = DeliverableService.approve(deliverable_id)
    assert approved.status == "approved"
    assert approved.approved_at is not None


def test_reject_sets_status_and_timestamp(cleanup):
    _, deliverable_id = _create_ceo_deliverable(cleanup)

    rejected = DeliverableService.reject(deliverable_id)
    assert rejected.status == "rejected"
    assert rejected.rejected_at is not None


def test_archive_then_restore_round_trip(cleanup):
    _, deliverable_id = _create_ceo_deliverable(cleanup)

    archived = DeliverableService.archive(deliverable_id)
    assert archived.status == "archived"
    assert archived.archived_at is not None

    restored = DeliverableService.restore(deliverable_id)
    assert restored.status == "pending_review"
    assert restored.archived_at is None


def test_restore_rejects_non_archived_deliverable(cleanup):
    _, deliverable_id = _create_ceo_deliverable(cleanup)

    from app.services.deliverable_service import InvalidDeliverableTransitionError

    with pytest.raises(InvalidDeliverableTransitionError):
        DeliverableService.restore(deliverable_id)


def test_transition_on_missing_deliverable_raises():
    with pytest.raises(DeliverableNotFoundError):
        DeliverableService.approve(999999999)


# ---------------------------------------------------------------------------
# 版本
# ---------------------------------------------------------------------------


def test_regenerate_version_increments_and_keeps_history(cleanup):
    task_id, deliverable_id = _create_ceo_deliverable(cleanup)

    # 修改来源任务的 result（模拟内容有更新），再次生成应产生 v2，
    # 不删除 v1。
    db = SessionLocal()
    try:
        row = db.query(TaskDB).filter(TaskDB.id == task_id).first()
        updated_envelope = dict(CEO_ENVELOPE)
        updated_envelope["result"] = {
            **CEO_ENVELOPE["result"],
            "analysis": {**CEO_ENVELOPE["result"]["analysis"], "summary": "更新后的摘要"},
        }
        row.result = updated_envelope
        db.commit()
    finally:
        db.close()

    updated = DeliverableService.regenerate_version(deliverable_id)
    assert updated.current_version == 2

    versions = DeliverableService.get_versions(deliverable_id)
    assert [v.version_number for v in versions] == [1, 2]

    v1 = DeliverableService.get_version(deliverable_id, 1)
    v2 = DeliverableService.get_version(deliverable_id, 2)
    assert v1.structured_content["summary"] == "本周经营平稳"
    assert v2.structured_content["summary"] == "更新后的摘要"


# ---------------------------------------------------------------------------
# 基于成果创建任务
# ---------------------------------------------------------------------------


class _NoopAgent(BaseAgent):
    def think(self, context):
        return {}

    def execute(self, decision):
        return {"ok": True}


@pytest.fixture
def follow_up_agent():
    name = f"{TEST_MARKER}_FOLLOWUP_{uuid.uuid4().hex[:6].upper()}"
    AgentRegistry.register(_NoopAgent(name=name, role="test", description="test"))
    yield name
    AgentRegistry.unregister(name)


def test_create_follow_up_task_inherits_shop_id_by_default(cleanup, follow_up_agent):
    task_ids, deliverable_ids = cleanup

    source_task_id = _insert_task(assigned_agent="AI CEO", shop_id=None)
    task_ids.append(source_task_id)
    TaskExecutionService.complete_task(source_task_id, CEO_ENVELOPE)

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == source_task_id)
        .first()
    )
    deliverable_ids.append(deliverable.id)
    assert deliverable.shop_id is None

    follow_up_task = DeliverableService.create_follow_up_task(
        deliverable.id,
        title=f"{TEST_MARKER} 后续任务",
        assigned_agent=follow_up_agent,
        instruction="基于成果继续",
        priority="normal",
        shop_id=None,
        inherit_shop_scope=True,
    )
    task_ids.append(follow_up_task.id)

    assert follow_up_task.source_deliverable_id == deliverable.id
    assert follow_up_task.shop_id is None
    assert follow_up_task.root_task_id == deliverable.root_task_id


def test_create_follow_up_task_missing_deliverable_raises(follow_up_agent):
    with pytest.raises(DeliverableNotFoundError):
        DeliverableService.create_follow_up_task(
            999999999,
            title="不存在的成果",
            assigned_agent=follow_up_agent,
            instruction="",
            priority="normal",
            shop_id=None,
            inherit_shop_scope=True,
        )
