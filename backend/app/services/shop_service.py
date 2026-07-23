"""
店铺档案与凭据服务（阶段 8E）。

只负责店铺资料 CRUD、状态流转、凭据加密保存/删除、测试连接和
OAuth 框架调用；不发出任何真实平台请求（真实调用逻辑属于
app.integrations.platforms 里的具体连接器，本阶段全部是安全占位
实现）。
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func

from app.database.db import SessionLocal
from app.integrations.platforms.base import ConnectionTestResult, OAuthStartResult
from app.integrations.platforms.registry import get_connector
from app.models.deliverable_db import DeliverableDB
from app.models.shop_api import ShopCreateRequest, ShopUpdateRequest
from app.models.shop_db import SHOP_CREDENTIAL_TYPES, ShopCredentialDB, ShopDB
from app.models.task_db import TaskDB
from app.services.credential_encryption_service import (
    CredentialEncryptionNotConfiguredError,
    CredentialEncryptionService,
)

logger = logging.getLogger("app.shop_service")


class ShopNotFoundError(Exception):
    pass


class DuplicatePlatformShopIdError(Exception):
    pass


def _generate_shop_code() -> str:
    return f"SHOP-{uuid4().hex[:12].upper()}"


class ShopService:
    @staticmethod
    def create_shop(request: ShopCreateRequest) -> ShopDB:
        db = SessionLocal()

        try:
            shop = ShopDB(
                shop_code=_generate_shop_code(),
                platform=request.platform,
                shop_name=request.shop_name,
                platform_shop_id=request.platform_shop_id or None,
                legal_entity_name=request.legal_entity_name or None,
                region=request.region or None,
                currency=request.currency or None,
                timezone=request.timezone or None,
                auth_type=request.auth_type,
                status="active",
                connection_status="not_configured",
            )

            db.add(shop)

            try:
                db.commit()
            except Exception as error:
                db.rollback()
                if "uq_shops_platform_platform_shop_id" in str(
                    getattr(error, "orig", error)
                ):
                    raise DuplicatePlatformShopIdError(
                        "该平台下的店铺编号已存在"
                    ) from error
                raise

            db.refresh(shop)
            return shop

        finally:
            db.close()

    @staticmethod
    def list_shops(
        *,
        platform: str | None = None,
        status: str | None = None,
        connection_status: str | None = None,
        keyword: str | None = None,
    ) -> list[ShopDB]:
        db = SessionLocal()

        try:
            query = db.query(ShopDB)

            if platform:
                query = query.filter(ShopDB.platform == platform)

            if status:
                query = query.filter(ShopDB.status == status)

            if connection_status:
                query = query.filter(ShopDB.connection_status == connection_status)

            if keyword:
                like = f"%{keyword}%"
                query = query.filter(
                    (ShopDB.shop_name.ilike(like))
                    | (ShopDB.shop_code.ilike(like))
                    | (ShopDB.platform_shop_id.ilike(like))
                )

            return query.order_by(ShopDB.created_at.desc()).all()

        finally:
            db.close()

    @staticmethod
    def get_shop(shop_id: int) -> ShopDB | None:
        db = SessionLocal()

        try:
            return db.query(ShopDB).filter(ShopDB.id == shop_id).first()

        finally:
            db.close()

    @staticmethod
    def get_names_by_ids(shop_ids: list[int]) -> dict[int, str]:
        if not shop_ids:
            return {}

        db = SessionLocal()

        try:
            rows = (
                db.query(ShopDB.id, ShopDB.shop_name)
                .filter(ShopDB.id.in_(set(shop_ids)))
                .all()
            )
            return {row[0]: row[1] for row in rows}

        finally:
            db.close()

    @staticmethod
    def update_shop(shop_id: int, request: ShopUpdateRequest) -> ShopDB | None:
        db = SessionLocal()

        try:
            shop = db.query(ShopDB).filter(ShopDB.id == shop_id).first()

            if shop is None:
                return None

            if request.shop_name is not None:
                shop.shop_name = request.shop_name
            if request.platform_shop_id is not None:
                shop.platform_shop_id = request.platform_shop_id or None
            if request.legal_entity_name is not None:
                shop.legal_entity_name = request.legal_entity_name or None
            if request.region is not None:
                shop.region = request.region or None
            if request.currency is not None:
                shop.currency = request.currency or None
            if request.timezone is not None:
                shop.timezone = request.timezone or None

            shop.updated_at = datetime.now(timezone.utc)

            db.commit()
            db.refresh(shop)
            return shop

        finally:
            db.close()

    @staticmethod
    def _set_status(shop_id: int, status: str) -> ShopDB | None:
        db = SessionLocal()

        try:
            shop = db.query(ShopDB).filter(ShopDB.id == shop_id).first()

            if shop is None:
                return None

            shop.status = status
            shop.updated_at = datetime.now(timezone.utc)

            if status == "disabled":
                shop.disabled_at = datetime.now(timezone.utc)
            elif status == "active":
                shop.disabled_at = None

            db.commit()
            db.refresh(shop)
            return shop

        finally:
            db.close()

    @staticmethod
    def enable_shop(shop_id: int) -> ShopDB | None:
        return ShopService._set_status(shop_id, "active")

    @staticmethod
    def disable_shop(shop_id: int) -> ShopDB | None:
        return ShopService._set_status(shop_id, "disabled")

    @staticmethod
    def archive_shop(shop_id: int) -> ShopDB | None:
        return ShopService._set_status(shop_id, "archived")

    @staticmethod
    def get_task_count(shop_id: int) -> int:
        db = SessionLocal()
        try:
            return db.query(TaskDB).filter(TaskDB.shop_id == shop_id).count()
        finally:
            db.close()

    @staticmethod
    def get_deliverable_count(shop_id: int) -> int:
        db = SessionLocal()
        try:
            return (
                db.query(DeliverableDB)
                .filter(DeliverableDB.shop_id == shop_id)
                .count()
            )
        finally:
            db.close()

    @staticmethod
    def get_task_deliverable_counts(
        shop_ids: list[int],
    ) -> dict[int, dict[str, int]]:
        if not shop_ids:
            return {}

        db = SessionLocal()

        try:
            ids = set(shop_ids)

            task_rows = (
                db.query(TaskDB.shop_id, func.count(TaskDB.id))
                .filter(TaskDB.shop_id.in_(ids))
                .group_by(TaskDB.shop_id)
                .all()
            )
            deliverable_rows = (
                db.query(DeliverableDB.shop_id, func.count(DeliverableDB.id))
                .filter(DeliverableDB.shop_id.in_(ids))
                .group_by(DeliverableDB.shop_id)
                .all()
            )

            task_counts = {row[0]: row[1] for row in task_rows}
            deliverable_counts = {row[0]: row[1] for row in deliverable_rows}

            return {
                shop_id: {
                    "task_count": task_counts.get(shop_id, 0),
                    "deliverable_count": deliverable_counts.get(shop_id, 0),
                }
                for shop_id in ids
            }

        finally:
            db.close()

    # ------------------------------------------------------------------
    # 凭据
    # ------------------------------------------------------------------

    @staticmethod
    def get_credentials(shop_id: int) -> list[ShopCredentialDB]:
        db = SessionLocal()

        try:
            return (
                db.query(ShopCredentialDB)
                .filter(ShopCredentialDB.shop_id == shop_id)
                .order_by(ShopCredentialDB.credential_type.asc())
                .all()
            )

        finally:
            db.close()

    @staticmethod
    def upsert_credentials(
        shop_id: int, fields: dict[str, str]
    ) -> list[ShopCredentialDB]:
        """
        逐项加密保存凭据。fields 只包含用户本次实际提供的非空字段
        （由 ShopCredentialsUpdateRequest.provided_fields() 过滤）。

        未配置 SHOP_CREDENTIAL_ENCRYPTION_KEY 时直接抛出
        CredentialEncryptionNotConfiguredError，不做任何写入，不
        退化为明文保存——由调用方（API 层）转换为安全的错误响应。
        """

        if not fields:
            return ShopService.get_credentials(shop_id)

        if not CredentialEncryptionService.is_configured():
            raise CredentialEncryptionNotConfiguredError(
                "SHOP_CREDENTIAL_ENCRYPTION_KEY 未配置，无法保存 Secret"
            )

        db = SessionLocal()

        try:
            for credential_type, plaintext in fields.items():
                if credential_type not in SHOP_CREDENTIAL_TYPES:
                    continue

                encrypted = CredentialEncryptionService.encrypt(plaintext)
                mask = CredentialEncryptionService.mask(plaintext)

                row = (
                    db.query(ShopCredentialDB)
                    .filter(ShopCredentialDB.shop_id == shop_id)
                    .filter(ShopCredentialDB.credential_type == credential_type)
                    .first()
                )

                if row is None:
                    row = ShopCredentialDB(
                        shop_id=shop_id,
                        credential_type=credential_type,
                    )
                    db.add(row)

                row.encrypted_value = encrypted
                row.value_mask = mask
                row.configured = True
                row.updated_at = datetime.now(timezone.utc)

            shop = db.query(ShopDB).filter(ShopDB.id == shop_id).first()
            if shop is not None and shop.connection_status == "not_configured":
                shop.connection_status = "configured"
                shop.updated_at = datetime.now(timezone.utc)

            db.commit()

            return (
                db.query(ShopCredentialDB)
                .filter(ShopCredentialDB.shop_id == shop_id)
                .order_by(ShopCredentialDB.credential_type.asc())
                .all()
            )

        finally:
            db.close()

    @staticmethod
    def delete_credential(shop_id: int, credential_type: str) -> bool:
        db = SessionLocal()

        try:
            row = (
                db.query(ShopCredentialDB)
                .filter(ShopCredentialDB.shop_id == shop_id)
                .filter(ShopCredentialDB.credential_type == credential_type)
                .first()
            )

            if row is None:
                return False

            db.delete(row)

            remaining = (
                db.query(ShopCredentialDB)
                .filter(ShopCredentialDB.shop_id == shop_id)
                .filter(ShopCredentialDB.id != row.id)
                .filter(ShopCredentialDB.configured.is_(True))
                .count()
            )

            if remaining == 0:
                shop = db.query(ShopDB).filter(ShopDB.id == shop_id).first()
                if shop is not None and shop.connection_status in (
                    "configured",
                    "error",
                    "expired",
                ):
                    shop.connection_status = "not_configured"
                    shop.updated_at = datetime.now(timezone.utc)

            db.commit()
            return True

        finally:
            db.close()

    @staticmethod
    def delete_shop(shop_id: int) -> tuple[bool, str | None]:
        """
        物理删除店铺资料。已产生业务数据（任务或成果）的店铺拒绝
        删除，返回 (False, 原因)；调用方应引导用户改用停用/归档。
        """

        if (
            ShopService.get_task_count(shop_id) > 0
            or ShopService.get_deliverable_count(shop_id) > 0
        ):
            return False, "该店铺已产生任务或成果记录，无法删除，请改为停用或归档"

        db = SessionLocal()

        try:
            shop = db.query(ShopDB).filter(ShopDB.id == shop_id).first()

            if shop is None:
                return False, "店铺不存在"

            db.query(ShopCredentialDB).filter(
                ShopCredentialDB.shop_id == shop_id
            ).delete()

            db.delete(shop)
            db.commit()
            return True, None

        finally:
            db.close()

    # ------------------------------------------------------------------
    # 测试连接 / OAuth
    # ------------------------------------------------------------------

    @staticmethod
    def test_connection(shop_id: int) -> ConnectionTestResult | None:
        shop = ShopService.get_shop(shop_id)

        if shop is None:
            return None

        credentials = ShopService.get_credentials(shop_id)
        credential_flags = {row.credential_type: row.configured for row in credentials}

        connector = get_connector(shop.platform)
        result = connector.test_connection(shop, credential_flags)

        db = SessionLocal()
        try:
            row = db.query(ShopDB).filter(ShopDB.id == shop_id).first()
            if row is not None:
                row.last_connection_test_at = datetime.now(timezone.utc)
                row.last_connection_test_status = result.status
                row.updated_at = datetime.now(timezone.utc)

                # 本阶段没有任何连接器会返回 connected；not_configured
                # 时把店铺整体 connection_status 也同步回 not_configured，
                # 其余情况（not_implemented）保持已有 connection_status
                # 不变，不伪装成功。
                if result.status == "not_configured":
                    row.connection_status = "not_configured"

                db.commit()
        finally:
            db.close()

        logger.info(
            "shop connection test: shop_id=%s platform=%s status=%s",
            shop_id,
            shop.platform,
            result.status,
        )

        return result

    @staticmethod
    def start_oauth(shop_id: int) -> OAuthStartResult | None:
        shop = ShopService.get_shop(shop_id)

        if shop is None:
            return None

        connector = get_connector(shop.platform)
        return connector.start_oauth(shop)
