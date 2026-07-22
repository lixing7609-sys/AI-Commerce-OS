"""
OperationLogService 直接测试：append-only 写入、按 domain/
entity_type/entity_id 查询。跨域复用能力（Token 之外的域可以直接
写同一张表）在这里用一个非 Token 的假 domain 验证——不需要
Shop/Device Admin 真的接入，只需要证明这张表本身不对 domain 做
任何硬编码限制。
"""

from app.database.db import SessionLocal
from app.services.operation_log_service import OperationLogService


def test_record_and_list_round_trip():
    db = SessionLocal()

    try:
        log = OperationLogService.record_within_session(
            db,
            domain="token",
            entity_type="test_entity",
            entity_id="entity-1",
            action="test_action",
            owner_scope_type="installation",
            owner_scope_id="test-op-log-scope",
            actor_type="developer_internal",
            actor_id="tester",
            reason_code=None,
            reason_text="operation log round trip test",
        )
        db.commit()
        log_id = log.id
    finally:
        db.close()

    entries = OperationLogService.list_for_entity("token", "test_entity", "entity-1")

    try:
        assert any(entry.id == log_id for entry in entries)
        assert entries[0].reason_text == "operation log round trip test"
    finally:
        db = SessionLocal()
        try:
            from app.models.operation_log_db import OperationLogDB

            db.query(OperationLogDB).filter(OperationLogDB.id == log_id).delete()
            db.commit()
        finally:
            db.close()


def test_domain_is_free_text_not_constrained():
    """
    operation_logs.domain 没有数据库 CheckConstraint——任意域都
    可以写入，不需要为了接入这张表而先改 schema（见 Token Economy
    Phase 1 Revision 3 §"Operation log domain"）。
    """

    db = SessionLocal()

    try:
        log = OperationLogService.record_within_session(
            db,
            domain="hypothetical_future_domain",
            entity_type="whatever",
            entity_id="1",
            action="did_something",
            owner_scope_type=None,
            owner_scope_id=None,
            actor_type="system",
            actor_id=None,
            reason_code=None,
            reason_text=None,
        )
        db.commit()
        log_id = log.id
    finally:
        db.close()

    db = SessionLocal()
    try:
        from app.models.operation_log_db import OperationLogDB

        stored = db.query(OperationLogDB).filter(OperationLogDB.id == log_id).first()
        assert stored is not None
        assert stored.domain == "hypothetical_future_domain"
        db.query(OperationLogDB).filter(OperationLogDB.id == log_id).delete()
        db.commit()
    finally:
        db.close()
