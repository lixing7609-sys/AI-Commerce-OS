from sqlalchemy.exc import IntegrityError

from app.database.db import SessionLocal
from app.models.token_account_db import OWNER_SCOPE_TYPES, TokenAccountDB
from app.services.token_projection_service import TokenProjectionService

DEFAULT_OWNER_SCOPE_TYPE = "installation"
DEFAULT_OWNER_SCOPE_ID = "local"


class InvalidOwnerScopeError(Exception):
    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class TokenAccountService:
    """
    Token 账户身份/生命周期服务。

    账户的创建/查找是独立于任何具体记账操作的事务——账户存在
    本身不是一条记账事实，所以 get_or_create_account() 自己开
    session、自己 commit，效仿 RuntimeStateService.get_or_create_
    state() 的写法（见 Token Economy Phase 1 Revision 3
    §"Ownership Abstraction"）。发放/调整等业务操作会先调用本
    服务拿到已经存在的账户，再另开一个事务去写真正的记账内容。
    """

    @staticmethod
    def get_or_create_account(
        owner_scope_type: str, owner_scope_id: str
    ) -> TokenAccountDB:
        if owner_scope_type not in OWNER_SCOPE_TYPES:
            raise InvalidOwnerScopeError(
                f"owner_scope_type {owner_scope_type!r} is not supported in Phase 1A"
            )

        db = SessionLocal()

        try:
            account = (
                db.query(TokenAccountDB)
                .filter(TokenAccountDB.owner_scope_type == owner_scope_type)
                .filter(TokenAccountDB.owner_scope_id == owner_scope_id)
                .first()
            )

            if account is not None:
                return account

            account = TokenAccountDB(
                owner_scope_type=owner_scope_type,
                owner_scope_id=owner_scope_id,
                status="active",
            )

            db.add(account)

            try:
                db.flush()
                TokenProjectionService.ensure_projection_within_session(
                    db, account.id
                )
                db.commit()
            except IntegrityError:
                # 并发创建：另一个请求已经先一步插入成功。回滚后
                # 重新查询"赢家"账户即可，不重试插入——同一模式见
                # RuntimeStateService.get_or_create_state()。
                db.rollback()

                account = (
                    db.query(TokenAccountDB)
                    .filter(TokenAccountDB.owner_scope_type == owner_scope_type)
                    .filter(TokenAccountDB.owner_scope_id == owner_scope_id)
                    .first()
                )

                if account is None:
                    raise

                # 防御性地确保投影行也存在（正常情况下赢家那次调用
                # 已经一起创建了），本身是幂等的 get-or-create。
                TokenProjectionService.ensure_projection_within_session(
                    db, account.id
                )
                db.commit()
                # commit() 默认会 expire session 里的全部对象（不只是
                # 本次写入的那个），包括这里重新查到的"赢家"account——
                # 不显式 refresh 的话，session 关闭后访问它的属性会
                # 抛 DetachedInstanceError（并发测试在真实多线程调度
                # 下才会触发的一个真实 bug：早前只跑目标子集时线程
                # 时序没有触发到这条路径）。
                db.refresh(account)
            else:
                db.refresh(account)

            return account

        finally:
            db.close()

    @staticmethod
    def get_or_create_default_account() -> TokenAccountDB:
        return TokenAccountService.get_or_create_account(
            DEFAULT_OWNER_SCOPE_TYPE, DEFAULT_OWNER_SCOPE_ID
        )

    @staticmethod
    def get_account_by_scope(
        owner_scope_type: str, owner_scope_id: str
    ) -> TokenAccountDB | None:
        db = SessionLocal()

        try:
            return (
                db.query(TokenAccountDB)
                .filter(TokenAccountDB.owner_scope_type == owner_scope_type)
                .filter(TokenAccountDB.owner_scope_id == owner_scope_id)
                .first()
            )

        finally:
            db.close()
