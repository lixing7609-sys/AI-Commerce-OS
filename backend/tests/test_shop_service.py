"""
ShopService / CredentialEncryptionService（阶段 8E）测试。

覆盖：店铺创建/编辑/停用/启用/归档、platform 校验、同平台
platform_shop_id 重复拒绝、凭据加密入库（数据库无明文）、API 不
回传 Secret 只回传 mask、留空不覆盖、删除凭据、缺少加密密钥时
拒绝保存 Secret 但普通店铺资料仍可保存、测试连接 not_configured/
not_implemented、OAuth not_implemented、OAuth state 校验、Token
refresh 框架不伪造结果。

测试使用独立的测试 Fernet 密钥（monkeypatch 环境变量），不使用
真实生产密钥；所有测试创建的店铺/凭据按精确 id 清理。
"""

import uuid

import pytest
from cryptography.fernet import Fernet

from app.database.db import SessionLocal
from app.models.shop_api import ShopCreateRequest, ShopCredentialsUpdateRequest, ShopUpdateRequest
from app.models.shop_db import ShopCredentialDB, ShopDB
from app.services.credential_encryption_service import (
    CredentialEncryptionNotConfiguredError,
    CredentialEncryptionService,
)
from app.services.shop_service import DuplicatePlatformShopIdError, ShopService

TEST_MARKER = "SHOP_SERVICE_TEST"
TEST_ENCRYPTION_KEY = Fernet.generate_key().decode("utf-8")


@pytest.fixture
def encryption_key(monkeypatch):
    monkeypatch.setenv("SHOP_CREDENTIAL_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY)
    yield TEST_ENCRYPTION_KEY


@pytest.fixture
def no_encryption_key(monkeypatch):
    monkeypatch.delenv("SHOP_CREDENTIAL_ENCRYPTION_KEY", raising=False)
    yield


@pytest.fixture
def cleanup_shops():
    shop_ids = []

    yield shop_ids

    db = SessionLocal()
    try:
        if shop_ids:
            db.query(ShopCredentialDB).filter(
                ShopCredentialDB.shop_id.in_(shop_ids)
            ).delete(synchronize_session=False)
            db.query(ShopDB).filter(ShopDB.id.in_(shop_ids)).delete(
                synchronize_session=False
            )
            db.commit()
    finally:
        db.close()


def _unique_shop_name():
    return f"{TEST_MARKER}_{uuid.uuid4().hex[:8].upper()}"


def _create_shop(cleanup_shops, **overrides):
    payload = {
        "platform": "other",
        "shop_name": _unique_shop_name(),
        "auth_type": "manual",
    }
    payload.update(overrides)
    shop = ShopService.create_shop(ShopCreateRequest(**payload))
    cleanup_shops.append(shop.id)
    return shop


# ---------------------------------------------------------------------------
# 基础 CRUD
# ---------------------------------------------------------------------------


def test_create_shop_defaults_not_configured(cleanup_shops):
    shop = _create_shop(cleanup_shops)

    assert shop.status == "active"
    assert shop.connection_status == "not_configured"
    assert shop.shop_code.startswith("SHOP-")


def test_create_shop_rejects_invalid_platform():
    with pytest.raises(ValueError):
        ShopCreateRequest(platform="not_a_real_platform", shop_name="x")


def test_duplicate_platform_shop_id_within_same_platform_rejected(cleanup_shops):
    platform_shop_id = f"PSID-{uuid.uuid4().hex[:8]}"
    _create_shop(cleanup_shops, platform="taobao", platform_shop_id=platform_shop_id)

    with pytest.raises(DuplicatePlatformShopIdError):
        _create_shop(cleanup_shops, platform="taobao", platform_shop_id=platform_shop_id)


def test_duplicate_platform_shop_id_across_platforms_allowed(cleanup_shops):
    platform_shop_id = f"PSID-{uuid.uuid4().hex[:8]}"
    _create_shop(cleanup_shops, platform="taobao", platform_shop_id=platform_shop_id)
    # 不同平台允许相同 platform_shop_id，不应抛异常。
    _create_shop(cleanup_shops, platform="douyin", platform_shop_id=platform_shop_id)


def test_multiple_shops_with_null_platform_shop_id_allowed(cleanup_shops):
    _create_shop(cleanup_shops, platform="jd")
    _create_shop(cleanup_shops, platform="jd")


def test_update_shop_only_touches_provided_fields(cleanup_shops):
    shop = _create_shop(cleanup_shops, region="华东")

    updated = ShopService.update_shop(
        shop.id, ShopUpdateRequest(shop_name="新名称")
    )

    assert updated.shop_name == "新名称"
    assert updated.region == "华东"


def test_disable_then_enable_shop(cleanup_shops):
    shop = _create_shop(cleanup_shops)

    disabled = ShopService.disable_shop(shop.id)
    assert disabled.status == "disabled"
    assert disabled.disabled_at is not None

    enabled = ShopService.enable_shop(shop.id)
    assert enabled.status == "active"
    assert enabled.disabled_at is None


def test_archive_shop_does_not_delete_it(cleanup_shops):
    shop = _create_shop(cleanup_shops)

    archived = ShopService.archive_shop(shop.id)
    assert archived.status == "archived"

    still_there = ShopService.get_shop(shop.id)
    assert still_there is not None


def test_disable_or_archive_does_not_delete_history():
    """
    停用/归档只改状态列，不涉及任何删除语句——本测试通过直接检查
    ShopService._set_status 的实现路径（数据库层面）来断言，不需要
    真实历史任务也能验证语义正确。
    """

    import inspect

    source = inspect.getsource(ShopService._set_status)
    assert "delete" not in source.lower()


def test_delete_shop_with_no_business_data_succeeds(cleanup_shops):
    shop = _create_shop(cleanup_shops)

    deleted, reason = ShopService.delete_shop(shop.id)
    assert deleted is True
    assert reason is None
    cleanup_shops.remove(shop.id)

    assert ShopService.get_shop(shop.id) is None


# ---------------------------------------------------------------------------
# 凭据加密
# ---------------------------------------------------------------------------


def test_upsert_credentials_requires_encryption_key(cleanup_shops, no_encryption_key):
    shop = _create_shop(cleanup_shops)

    with pytest.raises(CredentialEncryptionNotConfiguredError):
        ShopService.upsert_credentials(shop.id, {"app_key": "plain-value"})


def test_shop_profile_still_saves_without_encryption_key(cleanup_shops, no_encryption_key):
    # 缺少加密密钥时，普通店铺资料（不含 Secret）仍可正常保存。
    shop = _create_shop(cleanup_shops, shop_name="无密钥也能保存")
    assert shop.id is not None

    updated = ShopService.update_shop(shop.id, ShopUpdateRequest(region="华南"))
    assert updated.region == "华南"


def test_credentials_stored_encrypted_not_plaintext(cleanup_shops, encryption_key):
    shop = _create_shop(cleanup_shops)
    secret_value = "sk-super-secret-value-123456"

    ShopService.upsert_credentials(shop.id, {"app_secret": secret_value})

    db = SessionLocal()
    try:
        row = (
            db.query(ShopCredentialDB)
            .filter(ShopCredentialDB.shop_id == shop.id)
            .filter(ShopCredentialDB.credential_type == "app_secret")
            .first()
        )
        assert row is not None
        assert row.encrypted_value != secret_value
        assert secret_value not in (row.encrypted_value or "")
        assert row.configured is True
        assert row.value_mask == CredentialEncryptionService.mask(secret_value)
    finally:
        db.close()


def test_credentials_summary_never_exposes_plaintext_or_ciphertext(cleanup_shops, encryption_key):
    shop = _create_shop(cleanup_shops)
    ShopService.upsert_credentials(shop.id, {"access_token": "at-real-token-value"})

    summary = ShopService.get_credentials(shop.id)
    assert len(summary) == 1
    row = summary[0]
    # get_credentials 返回 ORM 行本身（供内部 API 层挑选安全字段），
    # 但业务上真正暴露给客户端的路径（ShopCredentialSummary）只应
    # 该出现在 API 层——这里直接断言 ORM 行的 encrypted_value 不等
    # 于明文，且 API 使用的 summary 结构不包含 encrypted_value 字段。
    from app.models.shop_api import ShopCredentialSummary

    exposed = ShopCredentialSummary(
        credential_type=row.credential_type,
        configured=row.configured,
        value_mask=row.value_mask,
        expires_at=row.expires_at,
    )
    assert "encrypted_value" not in exposed.model_dump()
    assert "at-real-token-value" not in str(exposed.model_dump())


def test_empty_string_credential_field_does_not_overwrite(cleanup_shops, encryption_key):
    shop = _create_shop(cleanup_shops)
    ShopService.upsert_credentials(shop.id, {"app_key": "original-value"})

    request = ShopCredentialsUpdateRequest(app_key="", app_secret=None)
    fields = request.provided_fields()
    assert fields == {}

    # 未提供任何字段时 upsert_credentials 直接返回现状，不修改。
    rows = ShopService.upsert_credentials(shop.id, fields)
    app_key_row = next(r for r in rows if r.credential_type == "app_key")
    assert app_key_row.value_mask == CredentialEncryptionService.mask("original-value")


def test_delete_credential_removes_row(cleanup_shops, encryption_key):
    shop = _create_shop(cleanup_shops)
    ShopService.upsert_credentials(shop.id, {"webhook_secret": "whsec_123"})

    deleted = ShopService.delete_credential(shop.id, "webhook_secret")
    assert deleted is True

    remaining = ShopService.get_credentials(shop.id)
    assert remaining == []

    deleted_again = ShopService.delete_credential(shop.id, "webhook_secret")
    assert deleted_again is False


def test_mask_format():
    assert CredentialEncryptionService.mask("abcd1234") == "****1234"
    assert CredentialEncryptionService.mask("") == "****"


def test_encrypt_decrypt_round_trip(encryption_key):
    plaintext = "round-trip-value"
    ciphertext = CredentialEncryptionService.encrypt(plaintext)
    assert ciphertext != plaintext
    assert CredentialEncryptionService.decrypt(ciphertext) == plaintext


def test_encrypt_without_key_raises(no_encryption_key):
    with pytest.raises(CredentialEncryptionNotConfiguredError):
        CredentialEncryptionService.encrypt("x")


# ---------------------------------------------------------------------------
# 测试连接 / OAuth 框架
# ---------------------------------------------------------------------------


def test_test_connection_not_configured_when_no_credentials(cleanup_shops):
    shop = _create_shop(cleanup_shops)

    result = ShopService.test_connection(shop.id)
    assert result.status == "not_configured"
    assert result.connector_available is False

    refreshed = ShopService.get_shop(shop.id)
    assert refreshed.last_connection_test_status == "not_configured"
    assert refreshed.last_connection_test_at is not None


def test_test_connection_not_implemented_when_credentials_configured(cleanup_shops, encryption_key):
    shop = _create_shop(cleanup_shops, platform="douyin")
    ShopService.upsert_credentials(shop.id, {"app_key": "x", "app_secret": "y"})

    result = ShopService.test_connection(shop.id)
    assert result.status == "not_implemented"
    assert result.connector_available is False
    assert "尚未配置真实开放平台接口" in result.message

    refreshed = ShopService.get_shop(shop.id)
    assert refreshed.last_connection_test_status == "not_implemented"
    # not_implemented 不代表 connected，也不清空已有 configured 状态。
    assert refreshed.connection_status != "connected"


def test_test_connection_never_returns_connected(cleanup_shops, encryption_key):
    for platform in ("douyin", "taobao", "amazon", "shopee", "kuaishou"):
        shop = _create_shop(cleanup_shops, platform=platform)
        ShopService.upsert_credentials(shop.id, {"app_key": "x"})
        result = ShopService.test_connection(shop.id)
        assert result.status != "connected"


def test_oauth_start_returns_not_implemented_and_no_url(cleanup_shops):
    shop = _create_shop(cleanup_shops, platform="douyin", auth_type="oauth")

    result = ShopService.start_oauth(shop.id)
    assert result.status == "not_implemented"
    assert result.authorize_url is None


def test_oauth_state_service_rejects_unknown_state():
    from app.services.oauth_state_service import OAuthStateService

    assert OAuthStateService.consume("unknown-token-xyz") is None


def test_oauth_state_service_one_time_use():
    from app.services.oauth_state_service import OAuthStateService

    token = OAuthStateService.issue(1, "douyin")
    first = OAuthStateService.consume(token)
    assert first is not None
    assert first["shop_id"] == 1

    second = OAuthStateService.consume(token)
    assert second is None


def test_oauth_state_service_expires(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app.services import oauth_state_service as module

    token = module.OAuthStateService.issue(1, "douyin")
    # 强制把签发时间改到已过期。
    module._states[token]["expires_at"] = datetime.now(timezone.utc) - timedelta(
        seconds=1
    )

    assert module.OAuthStateService.consume(token) is None


def test_refresh_credentials_framework_not_implemented(cleanup_shops):
    from app.integrations.platforms.registry import get_connector

    shop = _create_shop(cleanup_shops, platform="douyin")
    connector = get_connector(shop.platform)

    result = connector.refresh_credentials(shop)
    assert result.status == "not_implemented"


def test_platform_connectors_never_call_real_network():
    """
    静态检查：占位连接器实现里不出现常见的真实网络调用函数名，
    防止未来误改动引入真实请求却忘记更新测试。
    """

    import inspect

    from app.integrations.platforms import mock_or_unconfigured

    source = inspect.getsource(mock_or_unconfigured)
    for forbidden in ("requests.", "httpx.", "urlopen", "aiohttp"):
        assert forbidden not in source
