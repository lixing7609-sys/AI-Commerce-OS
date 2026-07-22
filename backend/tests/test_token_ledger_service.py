"""
TokenLedgerService 测试（Phase 1A）。

覆盖：grant_credit/manual_adjustment 两种 entry_type 允许的 delta
形状被正确接受，不允许的形状被拒绝；账户/批次余额可以从 ledger
正确求和推导。
"""

import pytest

from app.database.db import SessionLocal
from app.services.token_account_service import TokenAccountService
from app.services.token_ledger_service import (
    InvalidLedgerEntryError,
    TokenLedgerService,
)
from tests.token_test_support import cleanup_token_account, new_test_owner_scope_id


@pytest.fixture
def token_account():
    owner_scope_id = new_test_owner_scope_id()
    account = TokenAccountService.get_or_create_account("installation", owner_scope_id)

    yield account

    cleanup_token_account(account.id, owner_scope_id)


def test_grant_credit_requires_positive_available_and_lot_delta(token_account):
    db = SessionLocal()

    try:
        entry = TokenLedgerService.append_entry_within_session(
            db,
            token_account_id=token_account.id,
            entry_type="grant_credit",
            available_delta=100,
            reserved_delta=0,
            lot_id=1,
            lot_delta=100,
            reference_type="token_grant",
            reference_id=1,
        )
        db.rollback()

        assert entry.available_delta == 100
        assert entry.lot_delta == 100
    finally:
        db.close()


def test_grant_credit_rejects_non_positive_available_delta(token_account):
    db = SessionLocal()

    try:
        with pytest.raises(InvalidLedgerEntryError):
            TokenLedgerService.append_entry_within_session(
                db,
                token_account_id=token_account.id,
                entry_type="grant_credit",
                available_delta=0,
                reserved_delta=0,
                lot_id=1,
                lot_delta=0,
                reference_type="token_grant",
                reference_id=1,
            )
    finally:
        db.rollback()
        db.close()


def test_grant_credit_rejects_nonzero_reserved_delta(token_account):
    db = SessionLocal()

    try:
        with pytest.raises(InvalidLedgerEntryError):
            TokenLedgerService.append_entry_within_session(
                db,
                token_account_id=token_account.id,
                entry_type="grant_credit",
                available_delta=50,
                reserved_delta=5,
                lot_id=1,
                lot_delta=50,
                reference_type="token_grant",
                reference_id=1,
            )
    finally:
        db.rollback()
        db.close()


def test_grant_credit_requires_a_lot_id(token_account):
    db = SessionLocal()

    try:
        with pytest.raises(InvalidLedgerEntryError):
            TokenLedgerService.append_entry_within_session(
                db,
                token_account_id=token_account.id,
                entry_type="grant_credit",
                available_delta=50,
                reserved_delta=0,
                lot_id=None,
                lot_delta=50,
                reference_type="token_grant",
                reference_id=1,
            )
    finally:
        db.rollback()
        db.close()


def test_manual_adjustment_allows_positive_or_negative_nonzero_available_delta(
    token_account,
):
    db = SessionLocal()

    try:
        positive = TokenLedgerService.append_entry_within_session(
            db,
            token_account_id=token_account.id,
            entry_type="manual_adjustment",
            available_delta=10,
            reserved_delta=0,
            lot_id=None,
            lot_delta=0,
            reference_type="token_adjustment",
            reference_id=1,
        )
        db.flush()

        negative = TokenLedgerService.append_entry_within_session(
            db,
            token_account_id=token_account.id,
            entry_type="manual_adjustment",
            available_delta=-10,
            reserved_delta=0,
            lot_id=None,
            lot_delta=0,
            reference_type="token_adjustment",
            reference_id=2,
        )

        assert positive.available_delta == 10
        assert negative.available_delta == -10
    finally:
        db.rollback()
        db.close()


def test_manual_adjustment_rejects_zero_available_delta(token_account):
    db = SessionLocal()

    try:
        with pytest.raises(InvalidLedgerEntryError):
            TokenLedgerService.append_entry_within_session(
                db,
                token_account_id=token_account.id,
                entry_type="manual_adjustment",
                available_delta=0,
                reserved_delta=0,
                lot_id=None,
                lot_delta=0,
                reference_type="token_adjustment",
                reference_id=1,
            )
    finally:
        db.rollback()
        db.close()


def test_manual_adjustment_rejects_a_lot_id(token_account):
    db = SessionLocal()

    try:
        with pytest.raises(InvalidLedgerEntryError):
            TokenLedgerService.append_entry_within_session(
                db,
                token_account_id=token_account.id,
                entry_type="manual_adjustment",
                available_delta=10,
                reserved_delta=0,
                lot_id=1,
                lot_delta=0,
                reference_type="token_adjustment",
                reference_id=1,
            )
    finally:
        db.rollback()
        db.close()


def test_unsupported_entry_type_is_rejected(token_account):
    db = SessionLocal()

    try:
        with pytest.raises(InvalidLedgerEntryError):
            TokenLedgerService.append_entry_within_session(
                db,
                token_account_id=token_account.id,
                entry_type="consumption_settlement",
                available_delta=0,
                reserved_delta=-10,
                lot_id=None,
                lot_delta=0,
                reference_type="token_consumption_record",
                reference_id=1,
            )
    finally:
        db.rollback()
        db.close()


def test_compute_available_balance_sums_deltas(token_account):
    db = SessionLocal()

    try:
        TokenLedgerService.append_entry_within_session(
            db,
            token_account_id=token_account.id,
            entry_type="manual_adjustment",
            available_delta=30,
            reserved_delta=0,
            lot_id=None,
            lot_delta=0,
            reference_type="token_adjustment",
            reference_id=101,
        )
        TokenLedgerService.append_entry_within_session(
            db,
            token_account_id=token_account.id,
            entry_type="manual_adjustment",
            available_delta=-5,
            reserved_delta=0,
            lot_id=None,
            lot_delta=0,
            reference_type="token_adjustment",
            reference_id=102,
        )
        db.commit()

        balance = TokenLedgerService.compute_available_balance_within_session(
            db, token_account.id
        )

        assert balance == 25
    finally:
        db.close()


def test_compute_available_balance_is_zero_with_no_entries(token_account):
    db = SessionLocal()

    try:
        balance = TokenLedgerService.compute_available_balance_within_session(
            db, token_account.id
        )
        assert balance == 0
    finally:
        db.close()
