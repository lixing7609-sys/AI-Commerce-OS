"""
Token 记账不变量的随机化测试（Phase 1A 支持的操作范围内）：固定
随机种子的 grant/manual_adjustment 序列，每一步之后断言 ADR-0003
的记账不变量仍然成立。

只覆盖 Phase 1A 已经实现、已经测试过的两种操作（grant_credit、
manual_adjustment）；reservation/settlement/release/consumption
在这些操作真正存在之前不属于这里的范围（见 Token Economy
Phase 1 Revision 3 §"Revise the phased implementation plan"）。

不依赖 Hypothesis 等新增依赖，用标准库 random 加固定种子，保证
可重复（见 Token Economy Phase 1 Revision 3 §"Property testing"）。
"""

import random
import uuid

from app.database.db import SessionLocal
from app.models.token_ledger_entry_db import TokenLedgerEntryDB
from app.services.token_account_service import TokenAccountService
from app.services.token_administration_service import TokenAdministrationService
from app.services.token_ledger_service import NegativeBalanceError
from app.services.token_projection_service import TokenProjectionService
from tests.token_test_support import cleanup_token_account, new_test_owner_scope_id

_SEED = 20260722
_SEQUENCE_LENGTH = 200


def _new_reference() -> str:
    return f"ref-{uuid.uuid4().hex}"


def _assert_invariants_hold(token_account_id: int) -> int:
    """
    返回当前"真正的"可用余额（ledger 求和），并断言：

    - 可用余额永远不为负（Accounting Invariant #1）；
    - 账户投影和从 ledger 重新推导的结果一致（Accounting
      Invariant #2）。
    """

    db = SessionLocal()
    try:
        from sqlalchemy import func

        available = (
            db.query(func.coalesce(func.sum(TokenLedgerEntryDB.available_delta), 0))
            .filter(TokenLedgerEntryDB.token_account_id == token_account_id)
            .scalar()
        )
        available = int(available or 0)
    finally:
        db.close()

    assert available >= 0, f"available balance went negative: {available}"

    rebuilt = TokenProjectionService.rebuild_account(token_account_id)
    assert rebuilt.available_balance == available
    assert rebuilt.reserved_balance == 0  # Phase 1A 不产生任何预留

    return available


def test_randomized_grant_and_adjustment_sequence_preserves_invariants():
    owner_scope_id = new_test_owner_scope_id()
    account = TokenAccountService.get_or_create_account("installation", owner_scope_id)

    rng = random.Random(_SEED)
    running_available = 0
    rejected_count = 0
    applied_count = 0

    try:
        for _ in range(_SEQUENCE_LENGTH):
            operation = rng.choice(["grant", "adjustment"])

            if operation == "grant":
                amount = rng.randint(1, 500)
                source_type = rng.choice(
                    ["promotional", "compensation", "manually_granted"]
                )

                TokenAdministrationService.issue_grant(
                    source_type=source_type,
                    amount=amount,
                    grant_reference=_new_reference(),
                    reason="invariant fuzz test",
                    actor="fuzzer",
                    actor_type="developer_internal",
                    owner_scope_type="installation",
                    owner_scope_id=owner_scope_id,
                )
                running_available += amount
                applied_count += 1

            else:
                # 允许生成会导致负余额的调整，验证它们被安全拒绝、
                # 不留下任何持久化痕迹。
                amount = rng.randint(-500, 500)

                if amount == 0:
                    continue

                try:
                    TokenAdministrationService.record_manual_adjustment(
                        amount=amount,
                        adjustment_reference=_new_reference(),
                        reason="invariant fuzz test",
                        actor="fuzzer",
                        actor_type="developer_internal",
                        owner_scope_type="installation",
                        owner_scope_id=owner_scope_id,
                    )
                    running_available += amount
                    applied_count += 1
                except NegativeBalanceError:
                    rejected_count += 1

            actual_available = _assert_invariants_hold(account.id)
            assert actual_available == running_available

        # 至少要触发过一次负余额拒绝和一些成功操作，否则这条测试
        # 没有真正覆盖它声称覆盖的场景（固定种子应当保证这一点，
        # 但显式断言比"祈祷种子选得好"更可靠）。
        assert applied_count > 0
        assert rejected_count > 0

    finally:
        cleanup_token_account(account.id, owner_scope_id)


def test_randomized_sequence_is_reproducible_with_same_seed():
    """
    同一个种子跑两遍，最终可用余额必须完全一致——这是"随机但
    确定"这件事本身的合理性检查，不是对 Token 逻辑的进一步断言。
    """

    def run_once() -> int:
        owner_scope_id = new_test_owner_scope_id()
        account = TokenAccountService.get_or_create_account(
            "installation", owner_scope_id
        )
        rng = random.Random(_SEED)
        total = 0

        try:
            for _ in range(50):
                amount = rng.randint(1, 100)
                TokenAdministrationService.issue_grant(
                    source_type="promotional",
                    amount=amount,
                    grant_reference=_new_reference(),
                    reason="reproducibility test",
                    actor="fuzzer",
                    actor_type="developer_internal",
                    owner_scope_type="installation",
                    owner_scope_id=owner_scope_id,
                )
                total += amount

            projection = TokenProjectionService.rebuild_account(account.id)
            return projection.available_balance
        finally:
            cleanup_token_account(account.id, owner_scope_id)

    first_total = run_once()
    second_total = run_once()

    assert first_total == second_total
