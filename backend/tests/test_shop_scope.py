"""
店铺业务作用域隔离基础（阶段 8E）测试。

覆盖：Task.shop_id 绑定与过滤、旧任务 shop_id=null、
TaskDelegationService 强制子任务继承父任务 shop_id（模型输出无法
更改）、成果继承来源任务 shop_id、不跨店读取成果、ProductAgent
读取销售 Agent 兄弟摘要时严格同 shop_id、店铺停用后拒绝新建任务、
历史任务仍可查看、基于成果创建任务默认继承 shop_id。

本阶段只验证应用层查询是否正确按 shop_id 过滤，不涉及用户登录/
RBAC——不是完整多租户权限系统，测试范围与此保持一致。
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.deliverable_db import DeliverableDB, DeliverableVersionDB
from app.models.shop_api import ShopCreateRequest
from app.models.shop_db import ShopDB
from app.models.task_db import TaskDB
from app.services.deliverable_service import DeliverableService
from app.services.shop_service import ShopService
from app.services.task_delegation_service import TaskDelegationService
from app.services.task_execution_service import TaskExecutionService
from app.services.task_submission_service import (
    ShopNotAvailableError,
    TaskSubmissionService,
)

TEST_MARKER = "SHOP_SCOPE_TEST"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def cleanup():
    task_ids = []
    deliverable_ids = []
    shop_ids = []

    yield task_ids, deliverable_ids, shop_ids

    db = SessionLocal()
    try:
        if deliverable_ids:
            db.query(DeliverableVersionDB).filter(
                DeliverableVersionDB.deliverable_id.in_(deliverable_ids)
            ).delete(synchronize_session=False)
            db.query(DeliverableDB).filter(
                DeliverableDB.id.in_(deliverable_ids)
            ).delete(synchronize_session=False)
        if task_ids:
            db.query(TaskDB).filter(TaskDB.id.in_(task_ids)).delete(
                synchronize_session=False
            )
        if shop_ids:
            db.query(ShopDB).filter(ShopDB.id.in_(shop_ids)).delete(
                synchronize_session=False
            )
        db.commit()
    finally:
        db.close()


def _make_shop(cleanup, **overrides):
    _, _, shop_ids = cleanup
    payload = {"platform": "other", "shop_name": f"{TEST_MARKER}_{uuid.uuid4().hex[:8]}"}
    payload.update(overrides)
    shop = ShopService.create_shop(ShopCreateRequest(**payload))
    shop_ids.append(shop.id)
    return shop


def _make_task_id():
    return f"TASKSCOPE{uuid.uuid4().hex[:9].upper()}"


def _insert_task(*, status="completed", assigned_agent="AI CEO", shop_id=None, result=None, root_task_id=None, parent_task_id=None):
    task_id = _make_task_id()
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER} task",
            assigned_agent=assigned_agent,
            priority="normal",
            status=status,
            payload={"task": f"{TEST_MARKER} task"},
            result=result,
            created_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc) if status == "completed" else None,
            started_at=datetime.now(timezone.utc) if status != "pending" else None,
            root_task_id=root_task_id or task_id,
            parent_task_id=parent_task_id,
            shop_id=shop_id,
        )
        db.add(row)
        db.commit()
        return task_id
    finally:
        db.close()


def _ceo_result(summary="摘要"):
    return {
        "success": True,
        "agent": "AI CEO",
        "decision": {},
        "result": {
            "agent": "AI CEO",
            "analysis_type": "system_operations",
            "format": "structured",
            "analysis": {"summary": summary, "findings": [], "risks": [], "actions": [], "delegations": []},
        },
    }


def _sales_result(summary="销售摘要"):
    return {
        "success": True,
        "agent": "销售 Agent",
        "decision": {},
        "result": {
            "agent": "销售 Agent",
            "analysis_type": "sales_strategy",
            "format": "structured",
            "sales_analysis": {
                "summary": summary,
                "known_facts": [],
                "data_gaps": [],
                "opportunities": [],
                "strategy": {"target": "", "positioning": "", "channel_plan": [], "content_plan": [], "conversion_plan": []},
                "actions_today": [],
                "seven_day_plan": [],
                "required_inputs": [],
                "warnings": [],
            },
        },
    }


# ---------------------------------------------------------------------------
# Task.shop_id 绑定与过滤
# ---------------------------------------------------------------------------


def test_task_can_bind_shop_id(client, cleanup):
    task_ids, _, shop_ids = cleanup
    shop = _make_shop(cleanup)
    task_id = _insert_task(shop_id=shop.id)
    task_ids.append(task_id)

    response = client.get(f"/api/v1/tasks/{task_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["shop_id"] == shop.id
    assert body["shop_name"] == shop.shop_name


def test_task_list_filters_by_shop_id(client, cleanup):
    task_ids, _, _ = cleanup
    shop_a = _make_shop(cleanup)
    shop_b = _make_shop(cleanup)

    task_a = _insert_task(shop_id=shop_a.id)
    task_b = _insert_task(shop_id=shop_b.id)
    task_ids += [task_a, task_b]

    response = client.get("/api/v1/tasks", params={"shop_id": shop_a.id, "limit": 100})
    ids = [item["id"] for item in response.json()["items"]]
    assert task_a in ids
    assert task_b not in ids


def test_task_list_unassigned_shop_filter(client, cleanup):
    task_ids, _, _ = cleanup
    shop = _make_shop(cleanup)

    bound_task = _insert_task(shop_id=shop.id)
    unbound_task = _insert_task(shop_id=None)
    task_ids += [bound_task, unbound_task]

    response = client.get(
        "/api/v1/tasks", params={"unassigned_shop": True, "limit": 100}
    )
    ids = [item["id"] for item in response.json()["items"]]
    assert unbound_task in ids
    assert bound_task not in ids


def test_existing_historical_tasks_have_null_shop_id(cleanup):
    """
    模拟"本阶段之前创建"的历史任务——即创建时不传 shop_id 的
    任务——不会被回填任何店铺，读回后 shop_id 仍为 None。

    不依赖共享开发数据库里恰好存在多少条历史行：由测试自身插入
    样本历史任务并在 cleanup 中删除，因此在任意全新/空数据库中都
    能确定性通过，不假设任何预置行数。
    """

    task_ids, _, _ = cleanup

    historical_task_ids = [_insert_task(shop_id=None) for _ in range(5)]
    task_ids += historical_task_ids

    db = SessionLocal()
    try:
        rows = (
            db.query(TaskDB)
            .filter(TaskDB.id.in_(historical_task_ids))
            .all()
        )
    finally:
        db.close()

    assert len(rows) == len(historical_task_ids)
    assert all(row.shop_id is None for row in rows)


def test_invalid_shop_id_query_param_returns_empty_not_error(client):
    # 不存在的 shop_id 是安全的空结果，不是系统错误。
    response = client.get("/api/v1/tasks", params={"shop_id": 999999999})
    assert response.status_code == 200
    assert response.json()["items"] == []


# ---------------------------------------------------------------------------
# 停用店铺拒绝新任务 / 历史任务仍可查看
# ---------------------------------------------------------------------------


def test_disabled_shop_rejects_new_task_submission(client, cleanup):
    shop = _make_shop(cleanup)
    ShopService.disable_shop(shop.id)

    with pytest.raises(ShopNotAvailableError):
        TaskSubmissionService.validate_shop_for_task_creation(shop.id)

    response = client.post(
        "/api/v1/tasks/submit",
        json={"assigned_agent": "AI CEO", "task": "经营分析", "shop_id": shop.id},
    )
    assert response.status_code == 400


def test_disabled_shop_history_tasks_still_viewable(client, cleanup):
    task_ids, _, _ = cleanup
    shop = _make_shop(cleanup)
    task_id = _insert_task(shop_id=shop.id)
    task_ids.append(task_id)

    ShopService.disable_shop(shop.id)

    response = client.get(f"/api/v1/tasks/{task_id}")
    assert response.status_code == 200
    assert response.json()["shop_id"] == shop.id


def test_active_shop_allows_task_creation_validation():
    # 不应抛出异常。
    TaskSubmissionService.validate_shop_for_task_creation(None)


def test_missing_shop_id_rejected(cleanup):
    with pytest.raises(ShopNotAvailableError):
        TaskSubmissionService.validate_shop_for_task_creation(999999999)


# ---------------------------------------------------------------------------
# 委派继承 shop_id，LLM 无法更改
# ---------------------------------------------------------------------------


def test_delegated_child_task_inherits_parent_shop_id(cleanup):
    task_ids, _, _ = cleanup
    shop = _make_shop(cleanup)

    parent_id = _insert_task(shop_id=shop.id, status="running")
    task_ids.append(parent_id)

    other_shop = _make_shop(cleanup)

    # 模拟模型输出企图指定另一个 shop_id——delegations 字典本身就
    # 没有 shop_id 键，TaskDelegationService 签名也不接受从
    # delegations 内容读取 shop_id，只接受调用方显式传入的可信
    # shop_id 参数，因此即使精心构造的 delegation 字典包含
    # "shop_id" 键也会被忽略。
    result = TaskDelegationService.create_delegated_tasks(
        parent_task_id=parent_id,
        parent_agent_name="AI CEO",
        parent_depth=0,
        root_task_id=parent_id,
        delegations=[
            {
                "assigned_agent": "销售 Agent",
                "task": "跨店铺注入测试",
                "priority": "normal",
                "shop_id": other_shop.id,  # 模型无法通过这种方式生效
            }
        ],
        shop_id=shop.id,
    )

    assert result["status"] == "created"
    child_id = result["child_task_ids"][0]
    task_ids.append(child_id)

    db = SessionLocal()
    try:
        child = db.query(TaskDB).filter(TaskDB.id == child_id).first()
        assert child.shop_id == shop.id
        assert child.shop_id != other_shop.id
    finally:
        db.close()


def test_ai_ceo_agent_delegate_helper_passes_shop_id_from_task_meta(cleanup):
    """
    验证 AICEOAgent._delegate_if_eligible 把 decision 中的 shop_id
    （由 BaseAgent.run() 从服务端注入的 _task_meta 得来，模型无法
    伪造）原样透传给 TaskDelegationService，而不是从模型输出的
    delegations 内容里读取。
    """

    from app.agents.ai_ceo_agent import AICEOAgent

    task_ids, _, _ = cleanup
    shop = _make_shop(cleanup)
    parent_id = _insert_task(shop_id=shop.id, status="running")
    task_ids.append(parent_id)

    agent = AICEOAgent(name="AI CEO", role="chief_executive", description="test")

    decision = {
        "task_id": parent_id,
        "delegation_depth": 0,
        "root_task_id": parent_id,
        "shop_id": shop.id,
    }
    parsed = {
        "format": "structured",
        "analysis": {
            "delegations": [
                {"assigned_agent": "销售 Agent", "task": "委派继承测试", "priority": "normal", "reason": ""}
            ]
        },
    }

    summary = agent._delegate_if_eligible(decision, parsed)
    assert summary["status"] == "created"
    child_id = summary["child_task_ids"][0]
    task_ids.append(child_id)

    db = SessionLocal()
    try:
        child = db.query(TaskDB).filter(TaskDB.id == child_id).first()
        assert child.shop_id == shop.id
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 成果继承 shop_id，不跨店读取
# ---------------------------------------------------------------------------


def test_deliverable_inherits_shop_id_from_source_task(cleanup):
    task_ids, deliverable_ids, _ = cleanup
    shop = _make_shop(cleanup)
    task_id = _insert_task(shop_id=shop.id, status="running")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, _ceo_result())

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    deliverable_ids.append(deliverable.id)
    assert deliverable.shop_id == shop.id


def test_deliverable_without_shop_source_task_has_null_shop_id(cleanup):
    task_ids, deliverable_ids, _ = cleanup
    task_id = _insert_task(shop_id=None, status="running")
    task_ids.append(task_id)

    TaskExecutionService.complete_task(task_id, _ceo_result())

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    deliverable_ids.append(deliverable.id)
    assert deliverable.shop_id is None


def test_deliverable_list_filters_by_shop_id(client, cleanup):
    task_ids, deliverable_ids, _ = cleanup
    shop_a = _make_shop(cleanup)
    shop_b = _make_shop(cleanup)

    task_a = _insert_task(shop_id=shop_a.id, status="running")
    task_b = _insert_task(shop_id=shop_b.id, status="running")
    task_ids += [task_a, task_b]

    TaskExecutionService.complete_task(task_a, _ceo_result("店铺A摘要"))
    TaskExecutionService.complete_task(task_b, _ceo_result("店铺B摘要"))

    db = SessionLocal()
    try:
        deliverable_a = db.query(DeliverableDB).filter(DeliverableDB.source_task_id == task_a).first()
        deliverable_b = db.query(DeliverableDB).filter(DeliverableDB.source_task_id == task_b).first()
    finally:
        db.close()
    deliverable_ids += [deliverable_a.id, deliverable_b.id]

    response = client.get("/api/v1/deliverables", params={"shop_id": shop_a.id})
    ids = [item["id"] for item in response.json()["items"]]
    assert deliverable_a.id in ids
    assert deliverable_b.id not in ids


# ---------------------------------------------------------------------------
# ProductAgent 销售兄弟摘要严格同 shop_id
# ---------------------------------------------------------------------------


def test_sales_sibling_lookup_excludes_other_shop(cleanup):
    from app.agents.product_context import build_product_context

    task_ids, _, _ = cleanup
    shop_a = _make_shop(cleanup)
    shop_b = _make_shop(cleanup)

    root_id = _insert_task(shop_id=shop_a.id, status="running")
    task_ids.append(root_id)

    sales_same_shop = _insert_task(
        assigned_agent="销售 Agent",
        shop_id=shop_a.id,
        status="running",
        root_task_id=root_id,
    )
    sales_other_shop = _insert_task(
        assigned_agent="销售 Agent",
        shop_id=shop_b.id,
        status="running",
        root_task_id=root_id,
    )
    task_ids += [sales_same_shop, sales_other_shop]

    TaskExecutionService.complete_task(sales_same_shop, _sales_result("同店摘要"))
    TaskExecutionService.complete_task(sales_other_shop, _sales_result("异店摘要，不应被读取"))

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="选品评估",
        priority="normal",
        task_id=None,
        parent_task_id=None,
        root_task_id=root_id,
        delegation_depth=1,
        shop_id=shop_a.id,
    )

    summaries = [item["summary"] for item in context["sales_agent_reference"]]
    assert "同店摘要" in summaries
    assert "异店摘要，不应被读取" not in summaries


def test_sales_sibling_lookup_unbound_shop_only_matches_unbound(cleanup):
    from app.agents.product_context import build_product_context

    task_ids, _, _ = cleanup
    shop = _make_shop(cleanup)

    root_id = _insert_task(shop_id=None, status="running")
    task_ids.append(root_id)

    sales_unbound = _insert_task(
        assigned_agent="销售 Agent", shop_id=None, status="running", root_task_id=root_id
    )
    sales_bound = _insert_task(
        assigned_agent="销售 Agent", shop_id=shop.id, status="running", root_task_id=root_id
    )
    task_ids += [sales_unbound, sales_bound]

    TaskExecutionService.complete_task(sales_unbound, _sales_result("未绑定店铺摘要"))
    TaskExecutionService.complete_task(sales_bound, _sales_result("绑定店铺摘要，不应出现"))

    context = build_product_context(
        agent_name="产品 Agent",
        task_name="选品评估",
        priority="normal",
        task_id=None,
        parent_task_id=None,
        root_task_id=root_id,
        delegation_depth=1,
        shop_id=None,
    )

    summaries = [item["summary"] for item in context["sales_agent_reference"]]
    assert "未绑定店铺摘要" in summaries
    assert "绑定店铺摘要，不应出现" not in summaries


# ---------------------------------------------------------------------------
# 基于成果创建任务默认继承 shop_id（API 层，覆盖 test_deliverable_api 之外场景）
# ---------------------------------------------------------------------------


def test_create_follow_up_task_explicit_shop_override(cleanup):
    task_ids, deliverable_ids, _ = cleanup
    shop_a = _make_shop(cleanup)
    shop_b = _make_shop(cleanup)

    task_id = _insert_task(shop_id=shop_a.id, status="running")
    task_ids.append(task_id)
    TaskExecutionService.complete_task(task_id, _ceo_result())

    deliverable = (
        SessionLocal()
        .query(DeliverableDB)
        .filter(DeliverableDB.source_task_id == task_id)
        .first()
    )
    deliverable_ids.append(deliverable.id)

    from app.agents.agent_registry import AgentRegistry
    from app.agents.base_agent import BaseAgent

    class _Noop(BaseAgent):
        def think(self, context):
            return {}

        def execute(self, decision):
            return {}

    agent_name = f"{TEST_MARKER}_OVERRIDE_{uuid.uuid4().hex[:6]}"
    AgentRegistry.register(_Noop(name=agent_name, role="t", description="t"))

    try:
        follow_up = DeliverableService.create_follow_up_task(
            deliverable.id,
            title="显式更换店铺",
            assigned_agent=agent_name,
            instruction="",
            priority="normal",
            shop_id=shop_b.id,
            inherit_shop_scope=False,
        )
        task_ids.append(follow_up.id)
        assert follow_up.shop_id == shop_b.id
        assert follow_up.shop_id != deliverable.shop_id
    finally:
        AgentRegistry.unregister(agent_name)
