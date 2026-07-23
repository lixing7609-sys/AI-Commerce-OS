from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

SHOP_PLATFORMS = (
    "douyin",
    "kuaishou",
    "taobao",
    "tmall",
    "jd",
    "pinduoduo",
    "xiaohongshu",
    "wechat_shop",
    "amazon",
    "shopee",
    "other",
)

SHOP_STATUSES = ("active", "disabled", "archived")

SHOP_CONNECTION_STATUSES = (
    "not_configured",
    "configured",
    "testing",
    "connected",
    "expired",
    "error",
)

SHOP_AUTH_TYPES = ("none", "manual", "oauth")


class ShopDB(Base):
    """
    店铺档案表（阶段 8E）：经营者在各平台注册的真实店铺资料与授权
    框架，不保存任何虚假经营数据（订单、GMV、库存、商品数量等）。
    """

    __tablename__ = "shops"

    __table_args__ = (
        CheckConstraint(
            "platform IN ('" + "','".join(SHOP_PLATFORMS) + "')",
            name="ck_shops_platform",
        ),
        CheckConstraint(
            "status IN ('" + "','".join(SHOP_STATUSES) + "')",
            name="ck_shops_status",
        ),
        CheckConstraint(
            "connection_status IN ('"
            + "','".join(SHOP_CONNECTION_STATUSES)
            + "')",
            name="ck_shops_connection_status",
        ),
        CheckConstraint(
            "auth_type IN ('" + "','".join(SHOP_AUTH_TYPES) + "')",
            name="ck_shops_auth_type",
        ),
        UniqueConstraint(
            "platform",
            "platform_shop_id",
            name="uq_shops_platform_platform_shop_id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    shop_code: Mapped[str] = mapped_column(
        String(40), unique=True, nullable=False, index=True
    )

    platform: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    shop_name: Mapped[str] = mapped_column(String(255), nullable=False)

    platform_shop_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    legal_entity_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    region: Mapped[str | None] = mapped_column(String(100), nullable=True)

    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)

    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", server_default="active"
    )

    connection_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="not_configured",
        server_default="not_configured",
    )

    auth_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="none", server_default="none"
    )

    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    last_connection_test_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    last_connection_test_status: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )

    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    disabled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


SHOP_CREDENTIAL_TYPES = (
    "app_key",
    "app_secret",
    "access_token",
    "refresh_token",
    "merchant_id",
    "seller_id",
    "client_id",
    "client_secret",
    "webhook_secret",
    "other",
)


class ShopCredentialDB(Base):
    """
    店铺凭据表（阶段 8E）：只保存加密后的密文和展示用掩码，绝不
    保存明文 Secret；解密仅供平台适配器内部调用。
    """

    __tablename__ = "shop_credentials"

    __table_args__: Any = (
        CheckConstraint(
            "credential_type IN ('" + "','".join(SHOP_CREDENTIAL_TYPES) + "')",
            name="ck_shop_credentials_credential_type",
        ),
        UniqueConstraint(
            "shop_id",
            "credential_type",
            name="uq_shop_credentials_shop_id_credential_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    shop_id: Mapped[int] = mapped_column(
        Integer, nullable=False, index=True
    )

    credential_type: Mapped[str] = mapped_column(String(30), nullable=False)

    encrypted_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    value_mask: Mapped[str | None] = mapped_column(String(50), nullable=True)

    configured: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
