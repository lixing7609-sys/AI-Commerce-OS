"""
Token Economy Phase 1A 测试共用的清理工具，不是测试文件本身。

Token 域一次操作横跨 9 张表（account/projection/ledger/lot/
grant/adjustment/operation_log/两种 snapshot），逐个测试文件各自
重复维护一遍全表清理逻辑没有意义——这里集中提供一份，供各测试
文件按需调用。每个测试应该用 new_test_owner_scope_id() 生成一个
本次测试专属的 owner_scope_id，确保和其它测试、以及真实的
"installation"/"local" 默认账户完全隔离，不互相影响。
"""

import uuid

from app.database.db import SessionLocal
from app.models.operation_log_db import OperationLogDB
from app.models.provider_cost_snapshot_db import ProviderCostSnapshotDB
from app.models.token_account_db import TokenAccountDB
from app.models.token_account_projection_db import TokenAccountProjectionDB
from app.models.token_adjustment_db import TokenAdjustmentDB
from app.models.token_ledger_entry_db import TokenLedgerEntryDB
from app.models.token_lot_db import TokenGrantDB, TokenLotDB
from app.models.token_pricing_snapshot_db import TokenPricingSnapshotDB


def new_test_owner_scope_id() -> str:
    return f"test-{uuid.uuid4().hex}"


def cleanup_token_account(token_account_id: int, owner_scope_id: str | None = None) -> None:
    """
    按 token_account_id 删除该账户名下所有 Token 记录（ledger、lot、
    grant、adjustment、projection、账户本身），以及按 owner_scope_id
    删除对应的 operation_logs 行。
    """

    db = SessionLocal()

    try:
        db.query(TokenLedgerEntryDB).filter(
            TokenLedgerEntryDB.token_account_id == token_account_id
        ).delete(synchronize_session=False)

        db.query(TokenGrantDB).filter(
            TokenGrantDB.token_account_id == token_account_id
        ).delete(synchronize_session=False)

        db.query(TokenAdjustmentDB).filter(
            TokenAdjustmentDB.token_account_id == token_account_id
        ).delete(synchronize_session=False)

        db.query(TokenLotDB).filter(
            TokenLotDB.token_account_id == token_account_id
        ).delete(synchronize_session=False)

        db.query(TokenAccountProjectionDB).filter(
            TokenAccountProjectionDB.token_account_id == token_account_id
        ).delete(synchronize_session=False)

        if owner_scope_id is not None:
            db.query(OperationLogDB).filter(
                OperationLogDB.owner_scope_id == owner_scope_id
            ).delete(synchronize_session=False)

        db.query(TokenAccountDB).filter(
            TokenAccountDB.id == token_account_id
        ).delete(synchronize_session=False)

        db.commit()

    finally:
        db.close()


def cleanup_snapshot_versions(versions: list[str]) -> None:
    db = SessionLocal()

    try:
        db.query(ProviderCostSnapshotDB).filter(
            ProviderCostSnapshotDB.version.in_(versions)
        ).delete(synchronize_session=False)

        db.query(TokenPricingSnapshotDB).filter(
            TokenPricingSnapshotDB.version.in_(versions)
        ).delete(synchronize_session=False)

        db.query(OperationLogDB).filter(
            OperationLogDB.entity_id.in_(versions)
        ).delete(synchronize_session=False)

        db.commit()

    finally:
        db.close()
