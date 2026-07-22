"""
TokenAccountService 测试（Phase 1A）。

覆盖：默认账户 get-or-create、并发创建账户不产生重复行、
不同 owner_scope 之间互相隔离、不支持的 owner_scope_type 被拒绝。
"""

import threading

import pytest

from app.services.token_account_service import (
    DEFAULT_OWNER_SCOPE_ID,
    DEFAULT_OWNER_SCOPE_TYPE,
    InvalidOwnerScopeError,
    TokenAccountService,
)
from tests.token_test_support import cleanup_token_account, new_test_owner_scope_id


def test_get_or_create_default_account_is_a_real_singleton():
    account = TokenAccountService.get_or_create_default_account()

    assert account.owner_scope_type == DEFAULT_OWNER_SCOPE_TYPE
    assert account.owner_scope_id == DEFAULT_OWNER_SCOPE_ID
    assert account.status == "active"

    again = TokenAccountService.get_or_create_default_account()

    assert again.id == account.id


def test_get_or_create_account_rejects_unsupported_owner_scope_type():
    with pytest.raises(InvalidOwnerScopeError):
        TokenAccountService.get_or_create_account("business_cell", "not-yet-supported")


def test_concurrent_account_creation_produces_exactly_one_row():
    owner_scope_id = new_test_owner_scope_id()
    results: list[int] = []
    lock = threading.Lock()

    def worker():
        account = TokenAccountService.get_or_create_account("installation", owner_scope_id)
        with lock:
            results.append(account.id)

    threads = [threading.Thread(target=worker) for _ in range(8)]

    for thread in threads:
        thread.start()

    for thread in threads:
        thread.join(timeout=10)

    try:
        assert len(results) == 8
        assert len(set(results)) == 1, "concurrent creation must resolve to one account row"
    finally:
        cleanup_token_account(results[0], owner_scope_id)


def test_ownership_scope_isolation():
    scope_a = new_test_owner_scope_id()
    scope_b = new_test_owner_scope_id()

    account_a = TokenAccountService.get_or_create_account("installation", scope_a)
    account_b = TokenAccountService.get_or_create_account("installation", scope_b)

    try:
        assert account_a.id != account_b.id

        found_a = TokenAccountService.get_account_by_scope("installation", scope_a)
        found_b = TokenAccountService.get_account_by_scope("installation", scope_b)

        assert found_a.id == account_a.id
        assert found_b.id == account_b.id
        assert found_a.id != found_b.id
    finally:
        cleanup_token_account(account_a.id, scope_a)
        cleanup_token_account(account_b.id, scope_b)
