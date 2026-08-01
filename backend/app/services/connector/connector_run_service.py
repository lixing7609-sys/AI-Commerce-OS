import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.database.db import SessionLocal
from app.models.connector_run_db import ConnectorRunDB

logger = logging.getLogger("app.connector.run_service")

_MAX_SUMMARY_CHARS = 4000


def _truncate(text: str | None, limit: int = _MAX_SUMMARY_CHARS) -> str | None:
    if text is None:
        return None
    if len(text) <= limit:
        return text
    return f"{text[:limit]}…（已截断，原长度 {len(text)} 字符）"


class ConnectorRunService:
    """
    Connector Run 统一审计与状态持久化：每一次 Brain 调用 / Executor
    执行都对应一行记录，重启后端后仍可按 conversation_id 找回历史。
    """

    @staticmethod
    def start_run(
        *,
        kind: str,
        conversation_id: str,
        decision_id: str | None = None,
        task_package_id: str | None = None,
        input_summary: str | None = None,
        detail: dict[str, Any] | None = None,
        status: str = "running",
    ) -> ConnectorRunDB:
        session = SessionLocal()
        try:
            run = ConnectorRunDB(
                kind=kind,
                conversation_id=conversation_id,
                decision_id=decision_id,
                task_package_id=task_package_id,
                status=status,
                input_summary=_truncate(input_summary),
                detail=detail or {},
                started_at=datetime.now(timezone.utc),
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            logger.info("connector run started: id=%s kind=%s status=%s", run.id, kind, status)
            return run
        finally:
            session.close()

    @staticmethod
    def update_run(run_id: str, **patch: Any) -> ConnectorRunDB | None:
        session = SessionLocal()
        try:
            run = session.get(ConnectorRunDB, run_id)
            if run is None:
                return None

            for key, value in patch.items():
                if key == "detail" and value is not None:
                    merged = dict(run.detail or {})
                    merged.update(value)
                    run.detail = merged
                    continue
                if key in ("output_summary", "error"):
                    value = _truncate(value)
                setattr(run, key, value)

            session.commit()
            session.refresh(run)
            return run
        finally:
            session.close()

    @staticmethod
    def complete_run(
        run_id: str,
        *,
        status: str,
        output_summary: str | None = None,
        error: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> ConnectorRunDB | None:
        session = SessionLocal()
        try:
            run = session.get(ConnectorRunDB, run_id)
            if run is None:
                return None

            now = datetime.now(timezone.utc)
            run.status = status
            run.completed_at = now
            if output_summary is not None:
                run.output_summary = _truncate(output_summary)
            if error is not None:
                run.error = _truncate(error)
            if detail is not None:
                merged = dict(run.detail or {})
                merged.update(detail)
                run.detail = merged

            started_at = run.started_at
            if started_at is not None:
                if started_at.tzinfo is None:
                    started_at = started_at.replace(tzinfo=timezone.utc)
                run.duration_ms = (now - started_at).total_seconds() * 1000

            session.commit()
            session.refresh(run)
            logger.info("connector run completed: id=%s status=%s", run.id, status)
            return run
        finally:
            session.close()

    @staticmethod
    def get_run(run_id: str) -> ConnectorRunDB | None:
        session = SessionLocal()
        try:
            return session.get(ConnectorRunDB, run_id)
        finally:
            session.close()

    @staticmethod
    def list_runs_for_conversation(
        conversation_id: str, *, kind: str | None = None, limit: int = 50
    ) -> list[ConnectorRunDB]:
        session = SessionLocal()
        try:
            query = session.query(ConnectorRunDB).filter(
                ConnectorRunDB.conversation_id == conversation_id
            )
            if kind:
                query = query.filter(ConnectorRunDB.kind == kind)
            return (
                query.order_by(ConnectorRunDB.started_at.desc()).limit(limit).all()
            )
        finally:
            session.close()

    @staticmethod
    def find_active_run_for_task_package(task_package_id: str) -> ConnectorRunDB | None:
        """
        并发保护：查询该任务包当前是否已有一个尚未结束的 executor
        run（running / waiting_for_input），供 start_execution 在
        创建新 run 之前调用，避免重复点击导致同一任务被启动两次。
        """

        session = SessionLocal()
        try:
            return (
                session.query(ConnectorRunDB)
                .filter(
                    ConnectorRunDB.task_package_id == task_package_id,
                    ConnectorRunDB.kind == "executor",
                    ConnectorRunDB.status.in_(["running", "waiting_for_input"]),
                )
                .order_by(ConnectorRunDB.started_at.desc())
                .first()
            )
        finally:
            session.close()


def monotonic_ms() -> float:
    return time.monotonic() * 1000
