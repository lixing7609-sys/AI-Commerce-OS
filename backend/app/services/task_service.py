from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.task_db import TaskDB
from app.runtime.task import Task


class TaskService:
    """
    任务持久化服务。

    负责：

    - 创建任务记录
    - 更新任务状态
    - 查询任务详情
    - 查询全部任务
    - 统计任务状态
    """

    @staticmethod
    def create_task(task: Task) -> TaskDB:
        db = SessionLocal()

        try:
            task_db = TaskDB(
                id=task.id,
                task_type=task.task_type,
                assigned_agent=task.assigned_agent,
                priority=task.priority,
                status=task.status,
                payload=task.payload,
                result=task.result,
                error=task.error,
                created_at=task.created_at,
                started_at=task.started_at,
                completed_at=task.completed_at,
                parent_task_id=task.parent_task_id,
                root_task_id=task.root_task_id,
                delegation_depth=task.delegation_depth,
                created_by_agent=task.created_by_agent,
                delegation_key=task.delegation_key,
                shop_id=task.shop_id,
                source_deliverable_id=task.source_deliverable_id,
            )

            db.add(task_db)
            db.commit()
            db.refresh(task_db)

            return task_db

        finally:
            db.close()

    @staticmethod
    def create_external_task(
        task: Task,
        *,
        external_source: str,
        external_request_id: str,
    ) -> TaskDB | None:
        """
        创建带外部幂等字段的任务（阶段 6A 外部接入网关专用）。

        若 (external_source, external_request_id) 命中数据库唯一
        约束冲突，说明另一个并发请求已经先一步插入成功——这是
        正常的并发竞争结果，不是错误：捕获 IntegrityError、
        rollback 后返回 None，由调用方（TaskSubmissionService）
        重新按 external_source/external_request_id 查询已存在的
        任务并返回 duplicate=true，不在这里抛出异常、也不重试
        插入。
        """

        db = SessionLocal()

        try:
            task_db = TaskDB(
                id=task.id,
                task_type=task.task_type,
                assigned_agent=task.assigned_agent,
                priority=task.priority,
                status=task.status,
                payload=task.payload,
                result=task.result,
                error=task.error,
                created_at=task.created_at,
                started_at=task.started_at,
                completed_at=task.completed_at,
                external_source=external_source,
                external_request_id=external_request_id,
                parent_task_id=task.parent_task_id,
                root_task_id=task.root_task_id,
                delegation_depth=task.delegation_depth,
                created_by_agent=task.created_by_agent,
                delegation_key=task.delegation_key,
                shop_id=task.shop_id,
                source_deliverable_id=task.source_deliverable_id,
            )

            db.add(task_db)

            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                return None

            db.refresh(task_db)

            return task_db

        finally:
            db.close()

    @staticmethod
    def find_by_external_request(
        external_source: str,
        external_request_id: str,
    ) -> TaskDB | None:
        """
        按 (external_source, external_request_id) 精确查询已存在
        的任务，用于外部接入网关的幂等去重。两个参数必须同时提供
        非空值——内部任务两字段均为 NULL，不会被本方法意外匹配到
        （SQL 中 NULL = NULL 恒为假）。
        """

        db = SessionLocal()

        try:
            return (
                db.query(TaskDB)
                .filter(TaskDB.external_source == external_source)
                .filter(TaskDB.external_request_id == external_request_id)
                .first()
            )

        finally:
            db.close()

    @staticmethod
    def update_task(task: Task) -> TaskDB | None:
        db = SessionLocal()

        try:
            task_db = (
                db.query(TaskDB)
                .filter(TaskDB.id == task.id)
                .first()
            )

            if task_db is None:
                return None

            task_db.task_type = task.task_type
            task_db.assigned_agent = task.assigned_agent
            task_db.priority = task.priority
            task_db.status = task.status
            task_db.payload = task.payload
            task_db.result = task.result
            task_db.error = task.error
            task_db.created_at = task.created_at
            task_db.started_at = task.started_at
            task_db.completed_at = task.completed_at
            task_db.parent_task_id = task.parent_task_id
            task_db.root_task_id = task.root_task_id
            task_db.delegation_depth = task.delegation_depth
            task_db.created_by_agent = task.created_by_agent
            task_db.delegation_key = task.delegation_key
            task_db.shop_id = task.shop_id
            task_db.source_deliverable_id = task.source_deliverable_id

            db.commit()
            db.refresh(task_db)

            return task_db

        finally:
            db.close()

    @staticmethod
    def get_task(task_id: str) -> TaskDB | None:
        db = SessionLocal()

        try:
            return (
                db.query(TaskDB)
                .filter(TaskDB.id == task_id)
                .first()
            )

        finally:
            db.close()

    @staticmethod
    def get_all_tasks(
        status: str | None = None,
        assigned_agent: str | None = None,
        shop_id: int | None = None,
        unassigned_shop: bool = False,
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[TaskDB], int]:
        """
        查询任务记录，支持按状态、执行 Agent、店铺筛选和分页。

        筛选和计数均在 SQL 层完成，返回本次筛选后（分页前）
        的总数 filtered_total，供调用方构造分页信息。

        shop_id 与 unassigned_shop 互斥：shop_id 非空时按具体店铺
        精确过滤；unassigned_shop=True 时改为只返回 shop_id IS NULL
        （未绑定店铺）的任务，二者同时提供时 shop_id 优先。
        """

        db = SessionLocal()

        try:
            query = db.query(TaskDB)

            if status is not None:
                query = query.filter(TaskDB.status == status)

            if assigned_agent is not None:
                query = query.filter(
                    TaskDB.assigned_agent == assigned_agent
                )

            if shop_id is not None:
                query = query.filter(TaskDB.shop_id == shop_id)
            elif unassigned_shop:
                query = query.filter(TaskDB.shop_id.is_(None))

            filtered_total = query.count()

            query = query.order_by(TaskDB.created_at.desc())

            if offset:
                query = query.offset(offset)

            if limit is not None:
                query = query.limit(limit)

            return query.all(), filtered_total

        finally:
            db.close()

    @staticmethod
    def get_children(parent_task_id: str) -> list[TaskDB]:
        """
        查询某个父任务下的全部子任务（阶段 8B），按创建时间升序。
        """

        db = SessionLocal()

        try:
            return (
                db.query(TaskDB)
                .filter(TaskDB.parent_task_id == parent_task_id)
                .order_by(TaskDB.created_at.asc())
                .all()
            )

        finally:
            db.close()

    @staticmethod
    def get_recent_completed_by_root(
        root_task_id: str,
        assigned_agent: str,
        *,
        exclude_task_id: str | None = None,
        shop_id: int | None = None,
        require_same_shop: bool = False,
        limit: int = 3,
    ) -> list[TaskDB]:
        """
        查询同一 root_task_id 下、指定 Agent 已完成的最近任务（阶段
        8D：产品 Agent 安全读取销售 Agent 兄弟任务摘要），按完成
        时间倒序，默认最多 3 条。exclude_task_id 用于排除调用方
        自身（避免任务把自己当作"已完成兄弟任务"读取）。

        阶段 8E：require_same_shop=True 时额外按 shop_id 精确过滤
        （包括 shop_id 为 None 的情况，此时只匹配同样未绑定店铺的
        兄弟任务），防止店铺 A 的任务读取到店铺 B 的兄弟任务摘要。
        正常情况下同一 root_task_id 下的任务本来就通过委派强制继承
        同一 shop_id，这里是应用层的额外防线，不依赖这一前提。
        """

        db = SessionLocal()

        try:
            query = (
                db.query(TaskDB)
                .filter(TaskDB.root_task_id == root_task_id)
                .filter(TaskDB.assigned_agent == assigned_agent)
                .filter(TaskDB.status == "completed")
            )

            if exclude_task_id is not None:
                query = query.filter(TaskDB.id != exclude_task_id)

            if require_same_shop:
                query = query.filter(TaskDB.shop_id == shop_id)

            return (
                query.order_by(TaskDB.completed_at.desc())
                .limit(limit)
                .all()
            )

        finally:
            db.close()

    @staticmethod
    def get_child_task_counts(task_ids: list[str]) -> dict[str, int]:
        """
        批量查询一组任务各自的子任务数量，避免列表接口逐行查询
        造成 N+1（阶段 8B，供 Task Center 列表"已委派 N 个子任务"
        展示使用）。
        """

        if not task_ids:
            return {}

        db = SessionLocal()

        try:
            rows = (
                db.query(TaskDB.parent_task_id, func.count(TaskDB.id))
                .filter(TaskDB.parent_task_id.in_(task_ids))
                .group_by(TaskDB.parent_task_id)
                .all()
            )

            return {parent_id: count for parent_id, count in rows}

        finally:
            db.close()

    @staticmethod
    def get_stats() -> dict:
        db = SessionLocal()

        try:
            total = db.query(TaskDB).count()

            pending = (
                db.query(TaskDB)
                .filter(TaskDB.status == "pending")
                .count()
            )

            running = (
                db.query(TaskDB)
                .filter(TaskDB.status == "running")
                .count()
            )

            completed = (
                db.query(TaskDB)
                .filter(TaskDB.status == "completed")
                .count()
            )

            failed = (
                db.query(TaskDB)
                .filter(TaskDB.status == "failed")
                .count()
            )

            return {
                "total": total,
                "pending": pending,
                "running": running,
                "completed": completed,
                "failed": failed,
            }

        finally:
            db.close()

    @staticmethod
    def to_dict(task_db: TaskDB) -> dict:
        return {
            "id": task_db.id,
            "task_type": task_db.task_type,
            "payload": task_db.payload,
            "assigned_agent": task_db.assigned_agent,
            "priority": task_db.priority,
            "status": task_db.status,
            "created_at": (
                task_db.created_at.isoformat()
                if task_db.created_at
                else None
            ),
            "started_at": (
                task_db.started_at.isoformat()
                if task_db.started_at
                else None
            ),
            "completed_at": (
                task_db.completed_at.isoformat()
                if task_db.completed_at
                else None
            ),
            "result": task_db.result,
            "error": task_db.error,
        }