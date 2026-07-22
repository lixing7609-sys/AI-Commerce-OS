from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.token_ledger_entry_db import TOKEN_LEDGER_ENTRY_TYPES, TokenLedgerEntryDB


class IdempotencyConflictError(Exception):
    """
    同一个业务幂等标识（grant_reference/adjustment_reference/
    version 等）被复用，但本次请求的内容和已提交的记录不一致。

    Token 各服务共用这一个异常类——这不是某一个服务专属的领域
    错误，而是所有 Token 写操作共同遵守的幂等规则的统一表现
    （见 Token Economy Phase 1 Revision 3 §"Revise idempotency"）。
    """

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class NegativeBalanceError(Exception):
    """
    本次操作会导致账户可用余额变为负数，操作被拒绝——不写入任何
    ledger 记录，事务整体不提交（见 ADR-0003 Accounting Invariant
    #1：Token 余额不能悄悄变成负数）。
    """

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class InvalidLedgerEntryError(Exception):
    """
    尝试写入的 ledger 记录不满足该 entry_type 允许的 delta 组合
    ——说明调用方（服务层）有 bug，不应该发生在正常业务流程里。
    """

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


# Phase 1A 每种 entry_type 允许的 delta 形状。三元组含义：
# (available_delta 的符号约束, reserved_delta 的符号约束,
#  lot_delta 的符号约束)，"nonzero_same_sign_as_available" 表示
# lot_delta 必须和 available_delta 同号且非零，"zero" 表示必须
# 恒为 0。这张表把"每种账目类型允许什么效果"这件事显式地写在
# 一个地方，避免散落在各处的隐式约定（见 ADR-0003 Token Domain
# Model §9 的两维账本效果模型）。
_ENTRY_TYPE_SHAPES = {
    "grant_credit": {
        "available": "positive",
        "reserved": "zero",
        "lot": "positive",
        "lot_id_required": True,
    },
    "manual_adjustment": {
        "available": "nonzero",
        "reserved": "zero",
        "lot": "zero",
        "lot_id_required": False,
    },
}


def _check_shape(label: str, constraint: str, value: int) -> None:
    if constraint == "zero" and value != 0:
        raise InvalidLedgerEntryError(f"{label} must be 0, got {value}")

    if constraint == "positive" and value <= 0:
        raise InvalidLedgerEntryError(f"{label} must be > 0, got {value}")

    if constraint == "nonzero" and value == 0:
        raise InvalidLedgerEntryError(f"{label} must be non-zero, got {value}")


class TokenLedgerService:
    """
    Token 账本服务：token_ledger_entries 表的唯一写入入口。

    本表只追加、永不更新或删除，是 Token 记账的唯一事实来源
    （ADR-0003 Token Domain Model §1）。写入方法都是"session-aware"
    的内部辅助方法——接受调用方已经打开的 session，不自己开
    session、不自己 commit，由调用方（TokenAdministrationService
    等业务编排方法）作为唯一的事务所有者统一提交，避免"发放服务
    提交 origin 行 -> 账本服务另开 session 提交 ledger -> 投影服务
    再开一个 session 提交投影"这种破坏原子性的写法（见 Token
    Economy Phase 1 Revision 3 §"Transactions and locking"）。
    """

    @staticmethod
    def append_entry_within_session(
        db: Session,
        *,
        token_account_id: int,
        entry_type: str,
        available_delta: int,
        reserved_delta: int,
        lot_id: int | None,
        lot_delta: int,
        reference_type: str,
        reference_id: int,
    ) -> TokenLedgerEntryDB:
        """
        在调用方已打开的 session 内追加一条 ledger 记录。不
        commit、不 flush——由调用方决定何时 flush/commit，方便在
        同一个事务里紧接着更新投影。

        写入前校验 entry_type 允许的 delta 形状，防止服务层的 bug
        写出不满足两维账本效果模型的记录。
        """

        if entry_type not in TOKEN_LEDGER_ENTRY_TYPES:
            raise InvalidLedgerEntryError(
                f"entry_type {entry_type!r} is not a Phase 1A-supported type"
            )

        shape = _ENTRY_TYPE_SHAPES[entry_type]

        _check_shape("available_delta", shape["available"], available_delta)
        _check_shape("reserved_delta", shape["reserved"], reserved_delta)
        _check_shape("lot_delta", shape["lot"], lot_delta)

        if shape["lot_id_required"] and lot_id is None:
            raise InvalidLedgerEntryError(
                f"entry_type {entry_type!r} requires a lot_id"
            )

        if not shape["lot_id_required"] and lot_id is not None:
            raise InvalidLedgerEntryError(
                f"entry_type {entry_type!r} must not reference a lot_id"
            )

        entry = TokenLedgerEntryDB(
            token_account_id=token_account_id,
            entry_type=entry_type,
            available_delta=available_delta,
            reserved_delta=reserved_delta,
            lot_id=lot_id,
            lot_delta=lot_delta,
            reference_type=reference_type,
            reference_id=reference_id,
        )

        db.add(entry)

        return entry

    @staticmethod
    def compute_available_balance_within_session(
        db: Session, token_account_id: int
    ) -> int:
        """
        对账户所有 ledger 记录的 available_delta 求和，得到"此刻
        真正的"可用余额——不读取、不信任 token_account_projections
        缓存值。用于在锁定账户投影行之后，对余额做出真正安全的
        判断（比如是否允许一次人工调整）。
        """

        total = (
            db.query(func.coalesce(func.sum(TokenLedgerEntryDB.available_delta), 0))
            .filter(TokenLedgerEntryDB.token_account_id == token_account_id)
            .scalar()
        )

        return int(total or 0)

    @staticmethod
    def compute_reserved_balance_within_session(
        db: Session, token_account_id: int
    ) -> int:
        total = (
            db.query(func.coalesce(func.sum(TokenLedgerEntryDB.reserved_delta), 0))
            .filter(TokenLedgerEntryDB.token_account_id == token_account_id)
            .scalar()
        )

        return int(total or 0)

    @staticmethod
    def compute_lot_remaining_within_session(db: Session, lot_id: int) -> int:
        total = (
            db.query(func.coalesce(func.sum(TokenLedgerEntryDB.lot_delta), 0))
            .filter(TokenLedgerEntryDB.lot_id == lot_id)
            .scalar()
        )

        return int(total or 0)

    @staticmethod
    def get_max_entry_id_within_session(
        db: Session, token_account_id: int
    ) -> int | None:
        return (
            db.query(func.max(TokenLedgerEntryDB.id))
            .filter(TokenLedgerEntryDB.token_account_id == token_account_id)
            .scalar()
        )

    @staticmethod
    def get_entries_for_account(token_account_id: int) -> list[TokenLedgerEntryDB]:
        """
        只读查询，供测试/排查使用，不供正常业务流程依赖其顺序
        以外的任何隐含语义。
        """

        db = SessionLocal()

        try:
            return (
                db.query(TokenLedgerEntryDB)
                .filter(TokenLedgerEntryDB.token_account_id == token_account_id)
                .order_by(TokenLedgerEntryDB.id.asc())
                .all()
            )

        finally:
            db.close()

    @staticmethod
    def get_entries_for_lot(lot_id: int) -> list[TokenLedgerEntryDB]:
        db = SessionLocal()

        try:
            return (
                db.query(TokenLedgerEntryDB)
                .filter(TokenLedgerEntryDB.lot_id == lot_id)
                .order_by(TokenLedgerEntryDB.id.asc())
                .all()
            )

        finally:
            db.close()
