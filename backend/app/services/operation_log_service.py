from typing import Any

from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.operation_log_db import OperationLogDB


class OperationLogService:
    """
    通用操作日志服务：operation_logs 表的唯一写入入口。

    本服务本身对"哪些取值合法"没有任何限制——domain/entity_type/
    action 都是自由文本，校验交给各自的域自己的服务层做（见
    token_administration_service.py 里 Token 域自己校验的
    actor_type/action 取值）。这样其它域（Shop/Device Admin/
    Advertising/Operator Cloud）未来可以直接调用同一张表，不需要
    改这里的代码（Token Economy Phase 1 Revision 3
    §"Operation log domain"）。
    """

    @staticmethod
    def record_within_session(
        db: Session,
        *,
        domain: str,
        entity_type: str,
        entity_id: str,
        action: str,
        owner_scope_type: str | None,
        owner_scope_id: str | None,
        actor_type: str,
        actor_id: str | None,
        reason_code: str | None,
        reason_text: str | None,
        reference_ids: dict[str, Any] | None = None,
        metadata_json: dict[str, Any] | None = None,
    ) -> OperationLogDB:
        log = OperationLogDB(
            domain=domain,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            owner_scope_type=owner_scope_type,
            owner_scope_id=owner_scope_id,
            actor_type=actor_type,
            actor_id=actor_id,
            reason_code=reason_code,
            reason_text=reason_text,
            reference_ids=reference_ids,
            metadata_json=metadata_json,
        )

        db.add(log)
        db.flush()

        return log

    @staticmethod
    def list_for_entity(domain: str, entity_type: str, entity_id: str) -> list[OperationLogDB]:
        db = SessionLocal()

        try:
            return (
                db.query(OperationLogDB)
                .filter(OperationLogDB.domain == domain)
                .filter(OperationLogDB.entity_type == entity_type)
                .filter(OperationLogDB.entity_id == entity_id)
                .order_by(OperationLogDB.id.asc())
                .all()
            )

        finally:
            db.close()
