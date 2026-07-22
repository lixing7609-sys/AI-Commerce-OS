from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.token_account_projection_db import TokenAccountProjectionDB
from app.models.token_lot_db import TokenLotDB
from app.services.token_ledger_service import TokenLedgerService


class TokenProjectionService:
    """
    唯一允许写 token_account_projections.available_balance/
    reserved_balance 和 token_lots.remaining_amount 的服务。

    这两类值都是从 token_ledger_entries 派生的缓存投影，不是独立
    的记账事实（ADR-0003 Token Domain Model §1/§2/§9）——本服务
    既提供"随写随更新"的 session-aware 增量方法（供其它服务在
    自己的事务内调用），也提供完全脱离缓存、只从 ledger 重新推导
    的 rebuild 方法（用于重建/对账，随时可以把这两张表清空重来）。
    """

    # ------------------------------------------------------------------
    # session-aware：在调用方已打开的事务内使用，不 commit。
    # ------------------------------------------------------------------

    @staticmethod
    def ensure_projection_within_session(
        db: Session, token_account_id: int
    ) -> TokenAccountProjectionDB:
        """
        账户投影行不存在时创建一行零余额的初始投影。账户刚创建、
        还没有任何 ledger 记录时，"可用/预留余额都是 0"本身就是
        对空 ledger 求和的正确结果，不是编造的初始值。
        """

        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == token_account_id)
            .first()
        )

        if projection is not None:
            return projection

        projection = TokenAccountProjectionDB(
            token_account_id=token_account_id,
            available_balance=0,
            reserved_balance=0,
            projection_version=0,
            last_ledger_entry_id=None,
        )

        db.add(projection)
        db.flush()

        return projection

    @staticmethod
    def get_projection_for_update_within_session(
        db: Session, token_account_id: int
    ) -> TokenAccountProjectionDB:
        """
        对账户投影行加行锁（SELECT ... FOR UPDATE），用于序列化
        并发写入同一账户的操作（比如两次并发的人工调整）。加锁后
        应该配合 TokenLedgerService.compute_available_balance_
        within_session() 重新推导真正的余额再做判断，不直接信任
        这一行缓存的数值本身。
        """

        projection = (
            db.query(TokenAccountProjectionDB)
            .filter(TokenAccountProjectionDB.token_account_id == token_account_id)
            .with_for_update()
            .first()
        )

        if projection is None:
            raise ValueError(
                f"no projection row for token_account_id={token_account_id}; "
                "call ensure_projection_within_session() first"
            )

        return projection

    @staticmethod
    def apply_account_delta_within_session(
        db: Session,
        *,
        token_account_id: int,
        available_delta: int,
        reserved_delta: int,
        last_ledger_entry_id: int,
    ) -> TokenAccountProjectionDB:
        projection = TokenProjectionService.get_projection_for_update_within_session(
            db, token_account_id
        )

        projection.available_balance += available_delta
        projection.reserved_balance += reserved_delta
        projection.projection_version += 1
        projection.last_ledger_entry_id = last_ledger_entry_id
        projection.updated_at = datetime.now(timezone.utc)

        return projection

    @staticmethod
    def create_lot_within_session(
        db: Session,
        *,
        token_account_id: int,
        source_type: str,
        source_reference_type: str,
        source_reference_id: int,
        original_amount: int,
        expires_at,
    ) -> TokenLotDB:
        """
        创建一个新批次。remaining_amount 的初始值等于
        original_amount——这是对"目前只有一条记录"的 ledger 求和
        的正确结果，不是绕过投影规则的特例。
        """

        lot = TokenLotDB(
            token_account_id=token_account_id,
            source_type=source_type,
            source_reference_type=source_reference_type,
            source_reference_id=source_reference_id,
            original_amount=original_amount,
            remaining_amount=original_amount,
            expires_at=expires_at,
        )

        db.add(lot)
        db.flush()

        return lot

    @staticmethod
    def apply_lot_delta_within_session(
        db: Session, *, lot_id: int, lot_delta: int
    ) -> TokenLotDB:
        lot = (
            db.query(TokenLotDB)
            .filter(TokenLotDB.id == lot_id)
            .with_for_update()
            .first()
        )

        if lot is None:
            raise ValueError(f"no TokenLotDB row for lot_id={lot_id}")

        lot.remaining_amount += lot_delta

        return lot

    # ------------------------------------------------------------------
    # 独立事务：完全从 ledger 重新推导，随时可以删除投影行重建。
    # ------------------------------------------------------------------

    @staticmethod
    def rebuild_account(token_account_id: int) -> TokenAccountProjectionDB:
        """
        丢弃当前缓存值，完全从 token_ledger_entries 重新计算账户
        投影。用于对账、修复不一致，或者验证 replay 的确定性——
        重复调用必须得到相同结果。
        """

        db = SessionLocal()

        try:
            available = TokenLedgerService.compute_available_balance_within_session(
                db, token_account_id
            )
            reserved = TokenLedgerService.compute_reserved_balance_within_session(
                db, token_account_id
            )
            max_entry_id = TokenLedgerService.get_max_entry_id_within_session(
                db, token_account_id
            )

            projection = TokenProjectionService.ensure_projection_within_session(
                db, token_account_id
            )

            projection.available_balance = available
            projection.reserved_balance = reserved
            projection.projection_version += 1
            projection.last_ledger_entry_id = max_entry_id
            projection.last_reconciled_at = datetime.now(timezone.utc)
            projection.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(projection)

            return projection

        finally:
            db.close()

    @staticmethod
    def rebuild_lot(lot_id: int) -> TokenLotDB:
        db = SessionLocal()

        try:
            remaining = TokenLedgerService.compute_lot_remaining_within_session(
                db, lot_id
            )

            lot = db.query(TokenLotDB).filter(TokenLotDB.id == lot_id).first()

            if lot is None:
                raise ValueError(f"no TokenLotDB row for lot_id={lot_id}")

            lot.remaining_amount = remaining

            db.commit()
            db.refresh(lot)

            return lot

        finally:
            db.close()

    @staticmethod
    def get_projection(token_account_id: int) -> TokenAccountProjectionDB | None:
        db = SessionLocal()

        try:
            return (
                db.query(TokenAccountProjectionDB)
                .filter(TokenAccountProjectionDB.token_account_id == token_account_id)
                .first()
            )

        finally:
            db.close()
