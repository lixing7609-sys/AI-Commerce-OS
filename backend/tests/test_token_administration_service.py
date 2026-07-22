"""
TokenAdministrationService 测试（Phase 1A）：issue_grant /
record_manual_adjustment 的原子性、幂等性、并发安全性，以及负余额
防护。
"""

import threading
import uuid

import pytest

from app.database.db import SessionLocal
from app.models.operation_log_db import OperationLogDB
from app.models.token_account_projection_db import TokenAccountProjectionDB
from app.models.token_ledger_entry_db import TokenLedgerEntryDB
from app.models.token_lot_db import TokenGrantDB, TokenLotDB
from app.services.token_account_service import TokenAccountService
from app.services.token_ledger_service import (
    IdempotencyConflictError,
    NegativeBalanceError,
)
from app.services.token_administration_service import (
    InvalidActorTypeError,
    InvalidAdjustmentError,
    InvalidGrantError,
    TokenAdministrationService,
)
from tests.token_test_support import cleanup_token_account, new_test_owner_scope_id


def _new_reference() -> str:
    return f"ref-{uuid.uuid4().hex}"


@pytest.fixture
def scoped_account():
    owner_scope_id = new_test_owner_scope_id()
    account = TokenAccountService.get_or_create_account("installation", owner_scope_id)

    yield owner_scope_id, account

    cleanup_token_account(account.id, owner_scope_id)


def test_issue_grant_is_atomic_across_all_five_effects(scoped_account):
    owner_scope_id, account = scoped_account
    grant_reference = _new_reference()

    grant = TokenAdministrationService.issue_grant(
        source_type="promotional",
        amount=200,
        grant_reference=grant_reference,
        reason="phase 1a atomicity test",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    db = SessionLocal()

    try:
        # 1. origin 记录
        assert grant.amount == 200
        assert grant.token_account_id == account.id

        # 2. Token 批次
        lot = (
            db.query(TokenLotDB)
            .filter(TokenLotDB.source_reference_id == grant.id)
            .filter(TokenLotDB.source_reference_type == "token_grant")
            .first()
        )
        assert lot is not None
        assert lot.original_amount == 200
        assert lot.remaining_amount == 200

        # 3. ledger 借记条目
        entry = (
            db.query(TokenLedgerEntryDB)
            .filter(TokenLedgerEntryDB.reference_type == "token_grant")
            .filter(TokenLedgerEntryDB.reference_id == grant.id)
            .first()
        )
        assert entry is not None
        assert entry.entry_type == "grant_credit"
        assert entry.available_delta == 200
        assert entry.reserved_delta == 0
        assert entry.lot_delta == 200
        assert entry.lot_id == lot.id

        # 4. 账户投影更新
        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == account.id)
            .first()
        )
        assert projection.available_balance == 200
        assert projection.reserved_balance == 0
        assert projection.last_ledger_entry_id == entry.id

        # 5. OperationLog
        log = (
            db.query(OperationLogDB)
            .filter(OperationLogDB.id == grant.operation_log_id)
            .first()
        )
        assert log is not None
        assert log.domain == "token"
        assert log.action == "grant_issued"
        assert log.owner_scope_id == owner_scope_id
        assert log.actor_id == "tester"
    finally:
        db.close()


def test_idempotent_grant_retry_returns_original_result(scoped_account):
    owner_scope_id, _account = scoped_account
    grant_reference = _new_reference()

    kwargs = dict(
        source_type="promotional",
        amount=50,
        grant_reference=grant_reference,
        reason="idempotent retry test",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    first = TokenAdministrationService.issue_grant(**kwargs)
    second = TokenAdministrationService.issue_grant(**kwargs)

    assert first.id == second.id

    db = SessionLocal()
    try:
        entries = (
            db.query(TokenLedgerEntryDB)
            .filter(TokenLedgerEntryDB.reference_type == "token_grant")
            .filter(TokenLedgerEntryDB.reference_id == first.id)
            .all()
        )
        assert len(entries) == 1, "retry must not duplicate the ledger entry"
    finally:
        db.close()


def test_conflicting_grant_identity_reuse_raises(scoped_account):
    owner_scope_id, _account = scoped_account
    grant_reference = _new_reference()

    TokenAdministrationService.issue_grant(
        source_type="promotional",
        amount=50,
        grant_reference=grant_reference,
        reason="original",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    with pytest.raises(IdempotencyConflictError):
        TokenAdministrationService.issue_grant(
            source_type="promotional",
            amount=999,  # 不同金额 = 冲突 payload
            grant_reference=grant_reference,
            reason="original",
            actor="tester",
            actor_type="developer_internal",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )


def test_concurrent_duplicate_grant_produces_exactly_one_ledger_entry(scoped_account):
    owner_scope_id, account = scoped_account
    grant_reference = _new_reference()
    results: list[TokenGrantDB] = []
    lock = threading.Lock()

    def worker():
        grant = TokenAdministrationService.issue_grant(
            source_type="compensation",
            amount=75,
            grant_reference=grant_reference,
            reason="concurrent duplicate test",
            actor="tester",
            actor_type="developer_internal",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )
        with lock:
            results.append(grant)

    threads = [threading.Thread(target=worker) for _ in range(6)]

    for thread in threads:
        thread.start()

    for thread in threads:
        thread.join(timeout=10)

    assert len(results) == 6
    assert len({grant.id for grant in results}) == 1

    db = SessionLocal()
    try:
        entries = (
            db.query(TokenLedgerEntryDB)
            .filter(TokenLedgerEntryDB.reference_type == "token_grant")
            .filter(TokenLedgerEntryDB.reference_id == results[0].id)
            .all()
        )
        assert len(entries) == 1

        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == account.id)
            .first()
        )
        assert projection.available_balance == 75
    finally:
        db.close()


def test_issue_grant_rejects_unsupported_source_type(scoped_account):
    owner_scope_id, _account = scoped_account

    with pytest.raises(InvalidGrantError):
        TokenAdministrationService.issue_grant(
            source_type="purchased",  # 不在 Phase 1A 支持范围内
            amount=10,
            grant_reference=_new_reference(),
            reason="reject test",
            actor="tester",
            actor_type="developer_internal",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )


def test_issue_grant_rejects_unknown_actor_type(scoped_account):
    owner_scope_id, _account = scoped_account

    with pytest.raises(InvalidActorTypeError):
        TokenAdministrationService.issue_grant(
            source_type="promotional",
            amount=10,
            grant_reference=_new_reference(),
            reason="reject test",
            actor="tester",
            actor_type="anonymous",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )


def test_manual_positive_adjustment(scoped_account):
    owner_scope_id, account = scoped_account
    adjustment_reference = _new_reference()

    adjustment = TokenAdministrationService.record_manual_adjustment(
        amount=40,
        adjustment_reference=adjustment_reference,
        reason="manual credit test",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    assert adjustment.amount == 40

    db = SessionLocal()
    try:
        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == account.id)
            .first()
        )
        assert projection.available_balance == 40

        log = (
            db.query(OperationLogDB)
            .filter(OperationLogDB.id == adjustment.operation_log_id)
            .first()
        )
        assert log is not None
        assert log.action == "adjustment_recorded"
    finally:
        db.close()


def test_manual_negative_adjustment_after_sufficient_grant(scoped_account):
    owner_scope_id, account = scoped_account

    TokenAdministrationService.issue_grant(
        source_type="promotional",
        amount=100,
        grant_reference=_new_reference(),
        reason="fund before negative adjustment",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    adjustment = TokenAdministrationService.record_manual_adjustment(
        amount=-30,
        adjustment_reference=_new_reference(),
        reason="manual debit test",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    assert adjustment.amount == -30

    db = SessionLocal()
    try:
        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == account.id)
            .first()
        )
        assert projection.available_balance == 70
    finally:
        db.close()


def test_negative_adjustment_beyond_available_balance_is_rejected(scoped_account):
    owner_scope_id, account = scoped_account

    TokenAdministrationService.issue_grant(
        source_type="promotional",
        amount=10,
        grant_reference=_new_reference(),
        reason="small fund",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    with pytest.raises(NegativeBalanceError):
        TokenAdministrationService.record_manual_adjustment(
            amount=-11,
            adjustment_reference=_new_reference(),
            reason="over-debit test",
            actor="tester",
            actor_type="developer_internal",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )

    db = SessionLocal()
    try:
        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == account.id)
            .first()
        )
        # 被拒绝的调整不应该有任何持久化效果
        assert projection.available_balance == 10
    finally:
        db.close()


def test_manual_adjustment_rejects_zero_amount(scoped_account):
    owner_scope_id, _account = scoped_account

    with pytest.raises(InvalidAdjustmentError):
        TokenAdministrationService.record_manual_adjustment(
            amount=0,
            adjustment_reference=_new_reference(),
            reason="zero amount test",
            actor="tester",
            actor_type="developer_internal",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )


def test_conflicting_adjustment_identity_reuse_raises(scoped_account):
    owner_scope_id, _account = scoped_account
    adjustment_reference = _new_reference()

    TokenAdministrationService.record_manual_adjustment(
        amount=5,
        adjustment_reference=adjustment_reference,
        reason="original",
        actor="tester",
        actor_type="developer_internal",
        owner_scope_type="installation",
        owner_scope_id=owner_scope_id,
    )

    with pytest.raises(IdempotencyConflictError):
        TokenAdministrationService.record_manual_adjustment(
            amount=6,
            adjustment_reference=adjustment_reference,
            reason="original",
            actor="tester",
            actor_type="developer_internal",
            owner_scope_type="installation",
            owner_scope_id=owner_scope_id,
        )
