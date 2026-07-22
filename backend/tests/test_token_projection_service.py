"""
TokenProjectionService 测试（Phase 1A）：投影可以从 ledger 完整
重建，删除投影行后重建结果必须和删除前一致，重复重建必须幂等。

100,000 条规模的 replay 性能验收属于 Phase 1D，这里只验证重建
路径本身是正确、确定性的，用小规模数据集，不在常规测试套件里
生成大数据量（见 Token Economy Phase 1 Revision 3 §8）。
"""

import uuid

import pytest

from app.database.db import SessionLocal
from app.models.token_account_projection_db import TokenAccountProjectionDB
from app.services.token_account_service import TokenAccountService
from app.services.token_administration_service import TokenAdministrationService
from app.services.token_projection_service import TokenProjectionService
from tests.token_test_support import cleanup_token_account, new_test_owner_scope_id


def _new_reference() -> str:
    return f"ref-{uuid.uuid4().hex}"


@pytest.fixture
def funded_account():
    owner_scope_id = new_test_owner_scope_id()
    account = TokenAccountService.get_or_create_account("installation", owner_scope_id)

    # 一小笔混合操作序列：两次发放、一次正向调整、一次负向调整。
    TokenAdministrationService.issue_grant(
        source_type="promotional",
        amount=100,
        grant_reference=_new_reference(),
        reason="fixture grant 1",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )
    TokenAdministrationService.issue_grant(
        source_type="compensation",
        amount=50,
        grant_reference=_new_reference(),
        reason="fixture grant 2",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )
    TokenAdministrationService.record_manual_adjustment(
        amount=20,
        adjustment_reference=_new_reference(),
        reason="fixture positive adjustment",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )
    TokenAdministrationService.record_manual_adjustment(
        amount=-15,
        adjustment_reference=_new_reference(),
        reason="fixture negative adjustment",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    yield owner_scope_id, account

    cleanup_token_account(account.id, owner_scope_id)


def test_rebuild_account_matches_incremental_projection(funded_account):
    _owner_scope_id, account = funded_account

    incremental = TokenProjectionService.get_projection(account.id)
    assert incremental.available_balance == 100 + 50 + 20 - 15  # 155

    rebuilt = TokenProjectionService.rebuild_account(account.id)

    assert rebuilt.available_balance == incremental.available_balance
    assert rebuilt.reserved_balance == incremental.reserved_balance == 0


def test_projection_deletion_and_complete_reconstruction(funded_account):
    _owner_scope_id, account = funded_account

    expected_available = TokenProjectionService.get_projection(account.id).available_balance

    db = SessionLocal()
    try:
        db.query(TokenAccountProjectionDB).filter(
            TokenAccountProjectionDB.token_account_id == account.id
        ).delete()
        db.commit()
    finally:
        db.close()

    assert TokenProjectionService.get_projection(account.id) is None

    rebuilt = TokenProjectionService.rebuild_account(account.id)

    assert rebuilt.available_balance == expected_available


def test_repeated_rebuild_is_idempotent(funded_account):
    _owner_scope_id, account = funded_account

    first = TokenProjectionService.rebuild_account(account.id)
    second = TokenProjectionService.rebuild_account(account.id)
    third = TokenProjectionService.rebuild_account(account.id)

    assert first.available_balance == second.available_balance == third.available_balance
    assert first.reserved_balance == second.reserved_balance == third.reserved_balance
    # 每次 rebuild 都会推进 projection_version，但可用/预留余额必须
    # 保持稳定不变——这是 replay 确定性的核心断言。
    assert third.projection_version > first.projection_version


def test_rebuild_lot_matches_original_amount_for_untouched_lot(funded_account):
    from app.models.token_lot_db import TokenLotDB

    _owner_scope_id, account = funded_account

    db = SessionLocal()
    try:
        lot = (
            db.query(TokenLotDB)
            .filter(TokenLotDB.token_account_id == account.id)
            .filter(TokenLotDB.original_amount == 100)
            .first()
        )
    finally:
        db.close()

    assert lot is not None
    assert lot.remaining_amount == 100

    rebuilt_lot = TokenProjectionService.rebuild_lot(lot.id)

    assert rebuilt_lot.remaining_amount == 100
