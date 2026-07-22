from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.token_adjustment_db import TokenAdjustmentDB
from app.models.token_lot_db import TOKEN_LOT_SOURCE_TYPES, TokenGrantDB
from app.services.operation_log_service import OperationLogService
from app.services.token_account_service import TokenAccountService
from app.services.token_ledger_service import (
    IdempotencyConflictError,
    NegativeBalanceError,
    TokenLedgerService,
)
from app.services.token_projection_service import TokenProjectionService

TOKEN_DOMAIN = "token"

# Token 域自己校验的 actor_type 取值——仓库目前没有任何真实的用户
# 认证体系，"system" 供内部自动流程使用，"developer_internal" 供
# 人工触发的内部/测试流程使用。不冒充一个尚不存在的认证身份
# （见 Token Economy Phase 1 Revision 3 §"Operation logs"）。
TOKEN_ACTOR_TYPES = ("system", "developer_internal")


class InvalidActorTypeError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class InvalidGrantError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class InvalidAdjustmentError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def _validate_actor_type(actor_type: str) -> None:
    if actor_type not in TOKEN_ACTOR_TYPES:
        raise InvalidActorTypeError(
            f"actor_type {actor_type!r} is not a recognized Token actor type"
        )


class TokenAdministrationService:
    """
    Token 管理性写操作的编排入口：人工发放（issue_grant）、人工
    调整（record_manual_adjustment）。

    每个公开方法都是"一个业务操作、一个事务所有者"——自己打开
    唯一的一个 session，依次调用 OperationLogService/
    TokenLedgerService/TokenProjectionService 的 session-aware
    辅助方法完成 origin 记录、ledger 记录、投影更新、操作日志
    四件事，最后统一 commit 一次。任何一步失败，整个操作都不会
    留下部分生效的痕迹（见 Token Economy Phase 1 Revision 3
    §"Transactions and locking"）。
    """

    @staticmethod
    def issue_grant(
        *,
        source_type: str,
        amount: int,
        grant_reference: str,
        reason: str,
        actor: str,
        actor_type: str,
        owner_scope_type: str = "installation",
        owner_scope_id: str = "local",
    ) -> TokenGrantDB:
        _validate_actor_type(actor_type)

        if source_type not in TOKEN_LOT_SOURCE_TYPES:
            raise InvalidGrantError(
                f"source_type {source_type!r} is not a Phase 1A-supported grant source"
            )

        if amount <= 0:
            raise InvalidGrantError("grant amount must be positive")

        if not reason:
            raise InvalidGrantError("grant reason must not be empty")

        account = TokenAccountService.get_or_create_account(
            owner_scope_type, owner_scope_id
        )

        db = SessionLocal()

        try:
            existing = (
                db.query(TokenGrantDB)
                .filter(TokenGrantDB.token_account_id == account.id)
                .filter(TokenGrantDB.grant_reference == grant_reference)
                .first()
            )

            if existing is not None:
                TokenAdministrationService._assert_grant_matches(
                    existing,
                    source_type=source_type,
                    amount=amount,
                    reason=reason,
                    actor=actor,
                )
                return existing

            # 从这里开始到 commit 为止是一整个原子操作：origin 记录
            # /批次/ledger/投影/操作日志要么全部成功，要么全部不
            # 生效。并发写入同一个 grant_reference 时，唯一约束冲突
            # 可能在中途任意一次 flush（不只是最终 commit）时被
            # Postgres 报出来，所以必须把从 add(grant) 到 commit()
            # 之间的全部语句包在同一个 try/except IntegrityError
            # 里，而不是只包最后的 commit()（这是 Phase 1A 实现
            # 过程中由并发测试发现并修正的一个真实 bug）。
            try:
                log = OperationLogService.record_within_session(
                    db,
                    domain=TOKEN_DOMAIN,
                    entity_type="token_grant",
                    entity_id=grant_reference,
                    action="grant_issued",
                    owner_scope_type=owner_scope_type,
                    owner_scope_id=owner_scope_id,
                    actor_type=actor_type,
                    actor_id=actor,
                    reason_code=None,
                    reason_text=reason,
                    reference_ids={"grant_reference": grant_reference},
                )

                grant = TokenGrantDB(
                    token_account_id=account.id,
                    source_type=source_type,
                    amount=amount,
                    grant_reference=grant_reference,
                    reason=reason,
                    actor=actor,
                    operation_log_id=log.id,
                )

                db.add(grant)
                db.flush()

                lot = TokenProjectionService.create_lot_within_session(
                    db,
                    token_account_id=account.id,
                    source_type=source_type,
                    source_reference_type="token_grant",
                    source_reference_id=grant.id,
                    original_amount=amount,
                    expires_at=None,
                )

                entry = TokenLedgerService.append_entry_within_session(
                    db,
                    token_account_id=account.id,
                    entry_type="grant_credit",
                    available_delta=amount,
                    reserved_delta=0,
                    lot_id=lot.id,
                    lot_delta=amount,
                    reference_type="token_grant",
                    reference_id=grant.id,
                )
                db.flush()

                TokenProjectionService.apply_account_delta_within_session(
                    db,
                    token_account_id=account.id,
                    available_delta=amount,
                    reserved_delta=0,
                    last_ledger_entry_id=entry.id,
                )

                db.commit()
            except IntegrityError:
                db.rollback()

                existing = (
                    db.query(TokenGrantDB)
                    .filter(TokenGrantDB.token_account_id == account.id)
                    .filter(TokenGrantDB.grant_reference == grant_reference)
                    .first()
                )

                if existing is None:
                    raise

                TokenAdministrationService._assert_grant_matches(
                    existing,
                    source_type=source_type,
                    amount=amount,
                    reason=reason,
                    actor=actor,
                )
                return existing

            db.refresh(grant)

            return grant

        finally:
            db.close()

    @staticmethod
    def _assert_grant_matches(
        existing: TokenGrantDB,
        *,
        source_type: str,
        amount: int,
        reason: str,
        actor: str,
    ) -> None:
        if (
            existing.source_type != source_type
            or existing.amount != amount
            or existing.reason != reason
            or existing.actor != actor
        ):
            raise IdempotencyConflictError(
                "grant_reference "
                f"{existing.grant_reference!r} was already used with a "
                "different payload"
            )

    @staticmethod
    def record_manual_adjustment(
        *,
        amount: int,
        adjustment_reference: str,
        reason: str,
        actor: str,
        actor_type: str,
        owner_scope_type: str = "installation",
        owner_scope_id: str = "local",
    ) -> TokenAdjustmentDB:
        _validate_actor_type(actor_type)

        if amount == 0:
            raise InvalidAdjustmentError("adjustment amount must not be zero")

        if not reason:
            raise InvalidAdjustmentError("adjustment reason must not be empty")

        account = TokenAccountService.get_or_create_account(
            owner_scope_type, owner_scope_id
        )

        db = SessionLocal()

        try:
            existing = (
                db.query(TokenAdjustmentDB)
                .filter(TokenAdjustmentDB.token_account_id == account.id)
                .filter(TokenAdjustmentDB.adjustment_reference == adjustment_reference)
                .first()
            )

            if existing is not None:
                TokenAdministrationService._assert_adjustment_matches(
                    existing, amount=amount, reason=reason, actor=actor
                )
                return existing

            # 先锁定投影行（序列化并发调整），再用 ledger 重新推导
            # 出"此刻真正的"可用余额做判断——不信任缓存值本身
            # （见 Token Economy Phase 1 Revision 3
            # §"Account projection"）。
            TokenProjectionService.get_projection_for_update_within_session(
                db, account.id
            )

            current_available = (
                TokenLedgerService.compute_available_balance_within_session(
                    db, account.id
                )
            )

            if current_available + amount < 0:
                raise NegativeBalanceError(
                    "manual adjustment would make available balance negative: "
                    f"current={current_available}, delta={amount}"
                )

            # 同样，从这里到 commit 为止是一整个原子操作，必须整体
            # 包在一个 try/except IntegrityError 里——唯一约束冲突
            # 可能在中途任意一次 flush 时被 Postgres 报出来，不只
            # 在最终 commit() 时（见 issue_grant() 里同样的注释和
            # 并发测试）。
            try:
                log = OperationLogService.record_within_session(
                    db,
                    domain=TOKEN_DOMAIN,
                    entity_type="token_adjustment",
                    entity_id=adjustment_reference,
                    action="adjustment_recorded",
                    owner_scope_type=owner_scope_type,
                    owner_scope_id=owner_scope_id,
                    actor_type=actor_type,
                    actor_id=actor,
                    reason_code=None,
                    reason_text=reason,
                    reference_ids={"adjustment_reference": adjustment_reference},
                )

                adjustment = TokenAdjustmentDB(
                    token_account_id=account.id,
                    amount=amount,
                    adjustment_reference=adjustment_reference,
                    reason=reason,
                    actor=actor,
                    operation_log_id=log.id,
                )

                db.add(adjustment)
                db.flush()

                entry = TokenLedgerService.append_entry_within_session(
                    db,
                    token_account_id=account.id,
                    entry_type="manual_adjustment",
                    available_delta=amount,
                    reserved_delta=0,
                    lot_id=None,
                    lot_delta=0,
                    reference_type="token_adjustment",
                    reference_id=adjustment.id,
                )
                db.flush()

                TokenProjectionService.apply_account_delta_within_session(
                    db,
                    token_account_id=account.id,
                    available_delta=amount,
                    reserved_delta=0,
                    last_ledger_entry_id=entry.id,
                )

                db.commit()
            except IntegrityError:
                db.rollback()

                existing = (
                    db.query(TokenAdjustmentDB)
                    .filter(TokenAdjustmentDB.token_account_id == account.id)
                    .filter(
                        TokenAdjustmentDB.adjustment_reference
                        == adjustment_reference
                    )
                    .first()
                )

                if existing is None:
                    raise

                TokenAdministrationService._assert_adjustment_matches(
                    existing, amount=amount, reason=reason, actor=actor
                )
                return existing

            db.refresh(adjustment)

            return adjustment

        finally:
            db.close()

    @staticmethod
    def _assert_adjustment_matches(
        existing: TokenAdjustmentDB, *, amount: int, reason: str, actor: str
    ) -> None:
        if (
            existing.amount != amount
            or existing.reason != reason
            or existing.actor != actor
        ):
            raise IdempotencyConflictError(
                "adjustment_reference "
                f"{existing.adjustment_reference!r} was already used with a "
                "different payload"
            )
