"""
阶段 8B：AI CEO 经营分析结果转真实子任务的委派服务。

只负责"业务校验 + 幂等创建子任务"，不负责解析模型输出（那是
app.agents.ai_ceo_response 的职责，产出的 delegations 已经是
结构规整的 {assigned_agent, task, priority, reason} 字典列表）、
不负责判断父任务是否"允许委派"（那由调用方 AICEOAgent 根据
decision 中的 task_id/delegation_depth 决定是否调用本服务）。

安全边界：assigned_agent/task/priority/reason 均来自模型输出，
但 parent_task_id/root_task_id/delegation_depth/created_by_agent/
task id 全部由本服务生成或从调用方提供的可信参数派生，模型无法
控制这些字段。
"""

import hashlib
import logging

from sqlalchemy.exc import IntegrityError

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.models.task_db import TaskDB
from app.runtime.task import Task
from app.services.task_consumer_service import task_consumer_service

logger = logging.getLogger("app.task_delegation")

MAX_DELEGATIONS = 3
_MIN_TASK_LENGTH = 1
_MAX_TASK_LENGTH = 64
_VALID_PRIORITIES = frozenset({"high", "normal", "low"})

_CHILD_DELEGATION_DEPTH = 1


def _normalize_task_text(task_text: str) -> str:
    return " ".join(task_text.split()).lower()


def _delegation_key(parent_task_id: str, assigned_agent: str, task_text: str) -> str:
    normalized = _normalize_task_text(task_text)
    digest = hashlib.sha256(
        f"{parent_task_id}:{assigned_agent}:{normalized}".encode("utf-8")
    ).hexdigest()
    return digest[:32]


class TaskDelegationService:
    """
    把 AI CEO 结构化结果中的 delegations 转换成真实子任务。

    调用方须保证只在满足"父任务由 AI CEO 执行、depth==0"的前提下
    调用；本服务仍会用 parent_depth 参数再次校验作为兜底，防止
    递归委派。
    """

    @staticmethod
    def create_delegated_tasks(
        *,
        parent_task_id: str,
        parent_agent_name: str,
        parent_depth: int,
        root_task_id: str,
        delegations: list[dict],
        shop_id: int | None = None,
    ) -> dict:
        empty_summary = {
            "status": "none",
            "created_count": 0,
            "skipped_count": 0,
            "child_task_ids": [],
            "items": [],
        }

        if parent_depth != 0:
            logger.warning(
                "delegation rejected: parent_task_id=%s depth=%s "
                "(recursive delegation not allowed)",
                parent_task_id,
                parent_depth,
            )
            return empty_summary

        if not delegations:
            return empty_summary

        items: list[dict] = []
        skipped_count = 0
        created_count = 0
        failed_count = 0
        child_task_ids: list[str] = []
        seen_keys: set[tuple[str, str]] = set()
        candidates: list[dict] = []

        for raw in delegations:
            assigned_agent = str(raw.get("assigned_agent", "")).strip()
            task_text = str(raw.get("task", "")).strip()
            priority = raw.get("priority", "normal")
            reason = str(raw.get("reason", "") or "")

            if priority not in _VALID_PRIORITIES:
                priority = "normal"

            skip_reason = None

            if assigned_agent == parent_agent_name:
                skip_reason = "self_delegation"
            elif AgentRegistry.get(assigned_agent) is None:
                skip_reason = "unknown_agent"
            elif not (
                _MIN_TASK_LENGTH <= len(task_text) <= _MAX_TASK_LENGTH
            ):
                skip_reason = "invalid_task_length"

            if skip_reason:
                items.append(
                    {
                        "assigned_agent": assigned_agent,
                        "task": task_text[:_MAX_TASK_LENGTH],
                        "priority": priority,
                        "reason": reason,
                        "child_task_id": None,
                        "status": "skipped",
                        "skip_reason": skip_reason,
                    }
                )
                skipped_count += 1
                continue

            dedup_key = (assigned_agent, _normalize_task_text(task_text))

            if dedup_key in seen_keys:
                items.append(
                    {
                        "assigned_agent": assigned_agent,
                        "task": task_text,
                        "priority": priority,
                        "reason": reason,
                        "child_task_id": None,
                        "status": "skipped",
                        "skip_reason": "duplicate",
                    }
                )
                skipped_count += 1
                continue

            seen_keys.add(dedup_key)
            candidates.append(
                {
                    "assigned_agent": assigned_agent,
                    "task": task_text,
                    "priority": priority,
                    "reason": reason,
                }
            )

        accepted = candidates[:MAX_DELEGATIONS]
        overflow = candidates[MAX_DELEGATIONS:]

        for extra in overflow:
            items.append(
                {
                    **extra,
                    "child_task_id": None,
                    "status": "skipped",
                    "skip_reason": "max_delegations_exceeded",
                }
            )
            skipped_count += 1

        for candidate in accepted:
            delegation_key = _delegation_key(
                parent_task_id, candidate["assigned_agent"], candidate["task"]
            )

            child_task_id, error_type = (
                TaskDelegationService._create_child_task(
                    parent_task_id=parent_task_id,
                    root_task_id=root_task_id,
                    parent_agent_name=parent_agent_name,
                    delegation_key=delegation_key,
                    assigned_agent=candidate["assigned_agent"],
                    task_text=candidate["task"],
                    priority=candidate["priority"],
                    shop_id=shop_id,
                )
            )

            if child_task_id is not None:
                created_count += 1
                child_task_ids.append(child_task_id)
                items.append(
                    {
                        **candidate,
                        "child_task_id": child_task_id,
                        "status": "created",
                    }
                )
            else:
                failed_count += 1
                items.append(
                    {
                        **candidate,
                        "child_task_id": None,
                        "status": "failed",
                        "skip_reason": error_type,
                    }
                )

        if created_count > 0:
            TaskDelegationService._wake_consumer(parent_task_id)

        if created_count == 0 and failed_count > 0:
            status = "failed"
        elif created_count > 0 and (skipped_count > 0 or failed_count > 0):
            status = "partial_failure"
        elif created_count > 0:
            status = "created"
        else:
            status = "none"

        logger.info(
            "delegation summary: parent_task_id=%s status=%s "
            "created=%s skipped=%s failed=%s",
            parent_task_id,
            status,
            created_count,
            skipped_count,
            failed_count,
        )

        return {
            "status": status,
            "created_count": created_count,
            "skipped_count": skipped_count,
            "child_task_ids": child_task_ids,
            "items": items,
        }

    @staticmethod
    def _create_child_task(
        *,
        parent_task_id: str,
        root_task_id: str,
        parent_agent_name: str,
        delegation_key: str,
        assigned_agent: str,
        task_text: str,
        priority: str,
        shop_id: int | None = None,
    ) -> tuple[str | None, str | None]:
        """
        创建单条子任务并 commit；命中唯一约束（父任务重复执行导致
        重复委派）时安全幂等地返回已存在的子任务 id，不算失败、
        不创建第二条。

        返回 (child_task_id, error_type)：成功时 error_type 为
        None；数据库失败时 child_task_id 为 None、error_type 为
        安全的异常类型名。
        """

        task = Task(
            task_type=task_text,
            payload={"task": task_text},
            assigned_agent=assigned_agent,
            priority=priority,
            parent_task_id=parent_task_id,
            root_task_id=root_task_id,
            delegation_depth=_CHILD_DELEGATION_DEPTH,
            created_by_agent=parent_agent_name,
            delegation_key=delegation_key,
            # 阶段 8E：子任务强制继承父任务 shop_id，由本服务（而非
            # 模型输出的 delegations 列表）唯一决定，LLM 无法通过
            # prompt 指定另一个店铺——delegations 字典本身就不包含
            # shop_id 字段，调用方也不会从模型输出中读取它。
            shop_id=shop_id,
        )

        db = SessionLocal()

        try:
            row = TaskDB(
                id=task.id,
                task_type=task.task_type,
                assigned_agent=task.assigned_agent,
                priority=task.priority,
                status=task.status,
                payload=task.payload,
                created_at=task.created_at,
                parent_task_id=task.parent_task_id,
                root_task_id=task.root_task_id,
                delegation_depth=task.delegation_depth,
                created_by_agent=task.created_by_agent,
                delegation_key=task.delegation_key,
                shop_id=task.shop_id,
            )

            db.add(row)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()

                existing = (
                    db.query(TaskDB)
                    .filter(TaskDB.parent_task_id == parent_task_id)
                    .filter(TaskDB.delegation_key == delegation_key)
                    .first()
                )

                if existing is not None:
                    logger.info(
                        "delegation idempotent hit: parent_task_id=%s "
                        "existing_child=%s",
                        parent_task_id,
                        existing.id,
                    )
                    return existing.id, None

                # 理论上不应发生：唯一约束冲突必然意味着冲突行
                # 存在；重新查询仍为空说明出现了无法解释的数据
                # 不一致，按数据库失败处理，不伪造成功。
                return None, "IntegrityError"

            return task.id, None

        except Exception as error:
            db.rollback()
            logger.error(
                "delegation child task creation failed: parent_task_id=%s "
                "error_type=%s",
                parent_task_id,
                type(error).__name__,
            )
            return None, type(error).__name__

        finally:
            db.close()

    @staticmethod
    def _wake_consumer(parent_task_id: str) -> None:
        """
        子任务全部 commit 之后才调用；wake 失败只记录日志，不回滚
        已经成功创建的子任务，也不影响父任务后续的 completed 写回
        （与 TaskSubmissionService._wake_consumer 的既定安全模式
        一致）。
        """

        try:
            task_consumer_service.wake()
        except Exception as error:
            logger.warning(
                "task consumer wake after delegation failed: "
                "parent_task_id=%s error_type=%s",
                parent_task_id,
                type(error).__name__,
            )
