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
            )

            db.add(task_db)
            db.commit()
            db.refresh(task_db)

            return task_db

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
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[list[TaskDB], int]:
        """
        查询任务记录，支持按状态、执行 Agent 筛选和分页。

        筛选和计数均在 SQL 层完成，返回本次筛选后（分页前）
        的总数 filtered_total，供调用方构造分页信息。
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