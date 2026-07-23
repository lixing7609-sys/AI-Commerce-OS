from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.shop_db import (
    SHOP_AUTH_TYPES,
    SHOP_CREDENTIAL_TYPES,
    SHOP_PLATFORMS,
)

_CREDENTIAL_MAX_LENGTH = 4096


class ShopCredentialSummary(BaseModel):
    """
    凭据的安全展示摘要，绝不包含明文或密文原值。
    """

    credential_type: str
    configured: bool
    value_mask: str | None = None
    expires_at: datetime | None = None


class ShopItemResponse(BaseModel):
    """
    店铺列表/详情的公共字段。不包含任何 Secret 原值或密文。
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    shop_code: str
    platform: str
    shop_name: str
    platform_shop_id: str | None
    legal_entity_name: str | None
    region: str | None
    currency: str | None
    timezone: str | None
    status: str
    connection_status: str
    auth_type: str
    token_expires_at: datetime | None
    last_connection_test_at: datetime | None
    last_connection_test_status: str | None
    last_sync_at: datetime | None
    created_at: datetime
    updated_at: datetime
    disabled_at: datetime | None
    task_count: int = 0
    deliverable_count: int = 0
    credentials: list[ShopCredentialSummary] = Field(default_factory=list)


class ShopListResponse(BaseModel):
    items: list[ShopItemResponse]
    total: int


class ShopCreateRequest(BaseModel):
    platform: str = Field(...)
    shop_name: str = Field(..., min_length=1, max_length=255)
    platform_shop_id: str | None = Field(default=None, max_length=255)
    legal_entity_name: str | None = Field(default=None, max_length=255)
    region: str | None = Field(default=None, max_length=100)
    currency: str | None = Field(default=None, max_length=10)
    timezone: str | None = Field(default=None, max_length=50)
    auth_type: str = Field(default="none")

    @field_validator("platform")
    @classmethod
    def _validate_platform(cls, value: str) -> str:
        if value not in SHOP_PLATFORMS:
            raise ValueError(f"不支持的平台：{value}")
        return value

    @field_validator("auth_type")
    @classmethod
    def _validate_auth_type(cls, value: str) -> str:
        if value not in SHOP_AUTH_TYPES:
            raise ValueError(f"不支持的授权方式：{value}")
        return value

    @field_validator("shop_name", "platform_shop_id", mode="before")
    @classmethod
    def _strip_strings(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class ShopUpdateRequest(BaseModel):
    shop_name: str | None = Field(default=None, min_length=1, max_length=255)
    platform_shop_id: str | None = Field(default=None, max_length=255)
    legal_entity_name: str | None = Field(default=None, max_length=255)
    region: str | None = Field(default=None, max_length=100)
    currency: str | None = Field(default=None, max_length=10)
    timezone: str | None = Field(default=None, max_length=50)


class ShopCredentialsUpdateRequest(BaseModel):
    """
    PUT /shops/{id}/credentials 请求体。字段值为 None 或空字符串
    表示"不修改该项"，非空字符串才会被加密保存。
    """

    app_key: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    app_secret: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    access_token: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    refresh_token: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    merchant_id: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    seller_id: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    client_id: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    client_secret: str | None = Field(default=None, max_length=_CREDENTIAL_MAX_LENGTH)
    webhook_secret: str | None = Field(
        default=None, max_length=_CREDENTIAL_MAX_LENGTH
    )

    def provided_fields(self) -> dict[str, str]:
        """
        只返回非空（非 None 且去除首尾空白后非空字符串）的字段，
        供 ShopService 逐项加密保存；留空字段完全不出现在返回结果
        里，调用方不会因此误更新为空值。
        """

        result = {}
        for name in SHOP_CREDENTIAL_TYPES:
            if name == "other":
                continue
            value = getattr(self, name, None)
            if isinstance(value, str) and value.strip():
                result[name] = value
        return result


class ConnectionTestResponse(BaseModel):
    status: str
    connector_available: bool
    message: str
    tested_at: datetime


class OAuthStartResponse(BaseModel):
    status: str
    authorize_url: str | None
    message: str


class OAuthCallbackResponse(BaseModel):
    status: str
    message: str
