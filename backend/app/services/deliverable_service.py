"""
成果服务（阶段 8E）。

负责成果的自动/手动生成、幂等、版本管理、审核状态流转与"基于成果
创建任务"。所有写入 DeliverableVersionDB.structured_content 的数据
都直接复用 app.agents.*_response 已经产出的白名单清洗结果（或
app.services.deliverable_content 里同等严格的清洗逻辑），不复制
保存 Task.result 的其它字段。
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.deliverable_db import DeliverableDB, DeliverableVersionDB
from app.models.task_db import TaskDB
from app.runtime.task import Task
from app.services.deliverable_content import (
    build_title,
    extract_deliverable_content,
    render_markdown_body,
)
from app.services.task_consumer_service import task_consumer_service

logger = logging.getLogger("app.deliverable_service")


class DeliverableNotFoundError(Exception):
    pass


class TaskNotFoundError(Exception):
    pass


class TaskNotCompletedError(Exception):
    pass


class NoDeliverableContentError(Exception):
    pass


class InvalidDeliverableTransitionError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def _generate_deliverable_code() -> str:
    return f"DLV-{uuid4().hex[:12].upper()}"


class DeliverableService:
    # ------------------------------------------------------------------
    # 生成
    # ------------------------------------------------------------------

    @staticmethod
    def generate_for_completed_task(task_id: str) -> DeliverableDB | None:
        """
        任务成功 completed 后的尽力自动生成，供
        TaskExecutionService.complete_task 调用；调用方已经把本方法
        包在 try/except 里，这里额外再兜底一层，任何异常都不向上
        抛出，只记录安全日志。
        """

        try:
            return DeliverableService._create_from_task_row(task_id, created_by="system")
        except (
            TaskNotFoundError,
            TaskNotCompletedError,
            NoDeliverableContentError,
        ):
            # 这些是"预期内不生成"的正常情况（例如
            # unsupported_task/capability_not_implemented），不是
            # 异常状况，不记录为 error。
            return None
        except Exception as error:
            logger.error(
                "deliverable auto-generation unexpected failure: "
                "task_id=%s error_type=%s",
                task_id,
                type(error).__name__,
            )
            return None

    @staticmethod
    def create_from_task(task_id: str) -> DeliverableDB:
        """
        手动从单个已完成任务生成成果（幂等）：已存在则直接返回
        已有成果；failed/unsupported/running/pending 拒绝。
        """

        return DeliverableService._create_from_task_row(task_id, created_by="manual")

    @staticmethod
    def _create_from_task_row(task_id: str, *, created_by: str) -> DeliverableDB:
        db = SessionLocal()

        try:
            task = db.query(TaskDB).filter(TaskDB.id == task_id).first()

            if task is None:
                raise TaskNotFoundError(f"未找到任务：{task_id}")

            existing = (
                db.query(DeliverableDB)
                .filter(DeliverableDB.source_task_id == task_id)
                .first()
            )
            if existing is not None:
                return existing

            if task.status != "completed":
                raise TaskNotCompletedError(
                    f"任务当前状态为 {task.status}，无法生成成果"
                )

            content = extract_deliverable_content(task.assigned_agent, task.result)

            if content is None:
                raise NoDeliverableContentError("该任务没有可交付的分析内容")

            title = build_title(task.task_type, content["deliverable_type"])
            markdown = render_markdown_body(
                content["deliverable_type"], content["format"], content["structured_content"]
            )

            deliverable = DeliverableDB(
                deliverable_code=_generate_deliverable_code(),
                title=title,
                deliverable_type=content["deliverable_type"],
                status="pending_review",
                source_task_id=task.id,
                root_task_id=task.root_task_id or task.id,
                parent_task_id=task.parent_task_id,
                shop_id=task.shop_id,
                agent_name=task.assigned_agent or "未知 Agent",
                summary=content["summary"] or None,
                current_version=1,
            )
            db.add(deliverable)

            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                # 幂等冲突：另一个并发调用已经先一步插入成功
                # （source_task_id 唯一约束），直接返回已有记录。
                winner = (
                    db.query(DeliverableDB)
                    .filter(DeliverableDB.source_task_id == task_id)
                    .first()
                )
                if winner is not None:
                    return winner
                raise

            version = DeliverableVersionDB(
                deliverable_id=deliverable.id,
                version_number=1,
                format=content["format"],
                content=markdown,
                structured_content=content["structured_content"],
                created_by=created_by,
                source_task_id=task.id,
            )
            db.add(version)

            db.commit()
            db.refresh(deliverable)

            logger.info(
                "deliverable created: deliverable_id=%s source_task_id=%s "
                "deliverable_type=%s created_by=%s",
                deliverable.id,
                task_id,
                content["deliverable_type"],
                created_by,
            )

            return deliverable

        finally:
            db.close()

    # ------------------------------------------------------------------
    # 查询
    # ------------------------------------------------------------------

    @staticmethod
    def get_deliverable(deliverable_id: int) -> DeliverableDB | None:
        db = SessionLocal()
        try:
            return db.query(DeliverableDB).filter(DeliverableDB.id == deliverable_id).first()
        finally:
            db.close()

    @staticmethod
    def list_deliverables(
        *,
        status: str | None = None,
        deliverable_type: str | None = None,
        agent_name: str | None = None,
        shop_id: int | None = None,
        unassigned_shop: bool = False,
        source_task_id: str | None = None,
        root_task_id: str | None = None,
        keyword: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[DeliverableDB], int]:
        db = SessionLocal()

        try:
            query = db.query(DeliverableDB)

            if status:
                query = query.filter(DeliverableDB.status == status)
            if deliverable_type:
                query = query.filter(DeliverableDB.deliverable_type == deliverable_type)
            if agent_name:
                query = query.filter(DeliverableDB.agent_name == agent_name)
            if shop_id is not None:
                query = query.filter(DeliverableDB.shop_id == shop_id)
            elif unassigned_shop:
                query = query.filter(DeliverableDB.shop_id.is_(None))
            if source_task_id:
                query = query.filter(DeliverableDB.source_task_id == source_task_id)
            if root_task_id:
                query = query.filter(DeliverableDB.root_task_id == root_task_id)
            if keyword:
                like = f"%{keyword}%"
                query = query.filter(
                    or_(
                        DeliverableDB.title.ilike(like),
                        DeliverableDB.summary.ilike(like),
                        DeliverableDB.deliverable_code.ilike(like),
                    )
                )
            if created_from is not None:
                query = query.filter(DeliverableDB.created_at >= created_from)
            if created_to is not None:
                query = query.filter(DeliverableDB.created_at <= created_to)

            total = query.count()

            items = (
                query.order_by(DeliverableDB.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )

            return items, total

        finally:
            db.close()

    @staticmethod
    def get_versions(deliverable_id: int) -> list[DeliverableVersionDB]:
        db = SessionLocal()
        try:
            return (
                db.query(DeliverableVersionDB)
                .filter(DeliverableVersionDB.deliverable_id == deliverable_id)
                .order_by(DeliverableVersionDB.version_number.asc())
                .all()
            )
        finally:
            db.close()

    @staticmethod
    def get_version(deliverable_id: int, version_number: int) -> DeliverableVersionDB | None:
        db = SessionLocal()
        try:
            return (
                db.query(DeliverableVersionDB)
                .filter(DeliverableVersionDB.deliverable_id == deliverable_id)
                .filter(DeliverableVersionDB.version_number == version_number)
                .first()
            )
        finally:
            db.close()

    @staticmethod
    def get_current_version(deliverable: DeliverableDB) -> DeliverableVersionDB | None:
        return DeliverableService.get_version(deliverable.id, deliverable.current_version)

    # ------------------------------------------------------------------
    # 审核状态流转
    # ------------------------------------------------------------------

    @staticmethod
    def _transition(deliverable_id: int, target_status: str, timestamp_field: str | None) -> DeliverableDB:
        db = SessionLocal()

        try:
            deliverable = (
                db.query(DeliverableDB).filter(DeliverableDB.id == deliverable_id).first()
            )

            if deliverable is None:
                raise DeliverableNotFoundError(f"未找到成果：{deliverable_id}")

            deliverable.status = target_status
            deliverable.updated_at = datetime.now(timezone.utc)

            if timestamp_field:
                setattr(deliverable, timestamp_field, datetime.now(timezone.utc))

            db.commit()
            db.refresh(deliverable)
            return deliverable

        finally:
            db.close()

    @staticmethod
    def approve(deliverable_id: int) -> DeliverableDB:
        return DeliverableService._transition(deliverable_id, "approved", "approved_at")

    @staticmethod
    def reject(deliverable_id: int) -> DeliverableDB:
        return DeliverableService._transition(deliverable_id, "rejected", "rejected_at")

    @staticmethod
    def archive(deliverable_id: int) -> DeliverableDB:
        return DeliverableService._transition(deliverable_id, "archived", "archived_at")

    @staticmethod
    def restore(deliverable_id: int) -> DeliverableDB:
        db = SessionLocal()

        try:
            deliverable = (
                db.query(DeliverableDB).filter(DeliverableDB.id == deliverable_id).first()
            )

            if deliverable is None:
                raise DeliverableNotFoundError(f"未找到成果：{deliverable_id}")

            if deliverable.status != "archived":
                raise InvalidDeliverableTransitionError("只有已归档的成果才能恢复")

            deliverable.status = "pending_review"
            deliverable.archived_at = None
            deliverable.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(deliverable)
            return deliverable

        finally:
            db.close()

    # ------------------------------------------------------------------
    # 版本
    # ------------------------------------------------------------------

    @staticmethod
    def regenerate_version(deliverable_id: int) -> DeliverableDB:
        """
        基于成果已保存的 source_task_id，重新从该任务当前的
        Task.result 提取、清洗并生成新版本（不调用大模型）。
        历史版本只读，current_version 指向新版本。
        """

        db = SessionLocal()

        try:
            deliverable = (
                db.query(DeliverableDB).filter(DeliverableDB.id == deliverable_id).first()
            )

            if deliverable is None:
                raise DeliverableNotFoundError(f"未找到成果：{deliverable_id}")

            task = (
                db.query(TaskDB).filter(TaskDB.id == deliverable.source_task_id).first()
            )

            if task is None or task.status != "completed":
                raise TaskNotCompletedError("来源任务不存在或未完成，无法重新生成成果")

            content = extract_deliverable_content(task.assigned_agent, task.result)

            if content is None:
                raise NoDeliverableContentError("该任务没有可交付的分析内容")

            markdown = render_markdown_body(
                content["deliverable_type"], content["format"], content["structured_content"]
            )

            next_version = deliverable.current_version + 1

            version = DeliverableVersionDB(
                deliverable_id=deliverable.id,
                version_number=next_version,
                format=content["format"],
                content=markdown,
                structured_content=content["structured_content"],
                created_by="manual",
                source_task_id=task.id,
            )
            db.add(version)

            deliverable.current_version = next_version
            deliverable.summary = content["summary"] or deliverable.summary
            deliverable.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(deliverable)
            return deliverable

        finally:
            db.close()

    # ------------------------------------------------------------------
    # 基于成果创建任务
    # ------------------------------------------------------------------

    @staticmethod
    def create_follow_up_task(
        deliverable_id: int,
        *,
        title: str,
        assigned_agent: str,
        instruction: str | None,
        priority: str,
        shop_id: int | None,
        inherit_shop_scope: bool,
    ) -> TaskDB:
        from app.agents.agent_registry import AgentRegistry
        from app.services.task_submission_service import TaskSubmissionService

        deliverable = DeliverableService.get_deliverable(deliverable_id)

        if deliverable is None:
            raise DeliverableNotFoundError(f"未找到成果：{deliverable_id}")

        if AgentRegistry.get(assigned_agent) is None:
            from app.services.task_submission_service import AgentNotFoundError

            raise AgentNotFoundError(assigned_agent)

        resolved_shop_id = (
            deliverable.shop_id if inherit_shop_scope else shop_id
        )

        TaskSubmissionService.validate_shop_for_task_creation(resolved_shop_id)

        context = {
            "source_deliverable_code": deliverable.deliverable_code,
            "source_deliverable_summary": (deliverable.summary or "")[:500],
        }
        if instruction:
            context["instruction"] = instruction[:2000]

        task = Task(
            task_type=title[:64],
            payload={**context, "task": title[:64]},
            assigned_agent=assigned_agent,
            priority=priority,
            root_task_id=deliverable.root_task_id,
            shop_id=resolved_shop_id,
            source_deliverable_id=deliverable.id,
        )

        from app.services.task_service import TaskService

        task_db = TaskService.create_task(task)

        try:
            task_consumer_service.wake()
        except Exception as error:
            logger.warning(
                "task consumer wake after follow-up task failed: "
                "task_id=%s error_type=%s",
                task_db.id,
                type(error).__name__,
            )

        logger.info(
            "follow-up task created: deliverable_id=%s task_id=%s shop_id=%s",
            deliverable_id,
            task_db.id,
            resolved_shop_id,
        )

        DeliverableService._mark_converted_best_effort(deliverable_id)

        return task_db

    @staticmethod
    def _mark_converted_best_effort(deliverable_id: int) -> None:
        """
        成功创建"基于成果的后续任务"后，把成果标记为
        converted_to_task（仅当当前状态为 draft/pending_review/
        approved 时才转换，不覆盖用户已经做出的 rejected/archived
        决定）。失败只记录日志，不影响已经成功创建的后续任务。
        """

        db = SessionLocal()

        try:
            deliverable = (
                db.query(DeliverableDB).filter(DeliverableDB.id == deliverable_id).first()
            )

            if deliverable is None:
                return

            if deliverable.status in ("draft", "pending_review", "approved"):
                deliverable.status = "converted_to_task"
                deliverable.updated_at = datetime.now(timezone.utc)
                db.commit()

        except Exception as error:
            db.rollback()
            logger.warning(
                "mark deliverable converted_to_task failed: "
                "deliverable_id=%s error_type=%s",
                deliverable_id,
                type(error).__name__,
            )

        finally:
            db.close()
