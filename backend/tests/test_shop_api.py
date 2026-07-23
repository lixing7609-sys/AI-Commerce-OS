"""
店铺 API（阶段 8E）端到端测试。

覆盖：创建/列表/详情/编辑/启用/停用/归档/删除、凭据 PUT/DELETE
（不回传明文、mask 正确）、测试连接（未配置/未实现两种安全结果）、
OAuth start（not_implemented、无授权 URL）、OAuth callback（缺少
state/无效 state 均安全拒绝，不泄露 authorization code）。

真实通过 FastAPI TestClient 发起 HTTP 请求，不直接调用 Service，
用于验证路由层的错误码、响应结构和字段过滤是否正确。
"""

import uuid

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from app.database.db import SessionLocal
from app.main import app
from app.models.shop_db import ShopCredentialDB, ShopDB

TEST_MARKER = "SHOP_API_TEST"
TEST_ENCRYPTION_KEY = Fernet.generate_key().decode("utf-8")


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def encryption_key(monkeypatch):
    monkeypatch.setenv("SHOP_CREDENTIAL_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY)
    yield TEST_ENCRYPTION_KEY


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


def _create_shop(client, cleanup_shops, **overrides):
    payload = {
        "platform": "other",
        "shop_name": _unique_shop_name(),
        "auth_type": "manual",
    }
    payload.update(overrides)
    response = client.post("/api/v1/shops", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    cleanup_shops.append(body["id"])
    return body


def test_create_and_get_shop(client, cleanup_shops):
    created = _create_shop(client, cleanup_shops)

    response = client.get(f"/api/v1/shops/{created['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["shop_name"] == created["shop_name"]
    assert body["connection_status"] == "not_configured"
    assert body["task_count"] == 0
    assert body["deliverable_count"] == 0
    assert body["credentials"] == []


def test_list_shops_filters_by_platform(client, cleanup_shops):
    _create_shop(client, cleanup_shops, platform="douyin")

    response = client.get("/api/v1/shops", params={"platform": "douyin"})
    assert response.status_code == 200
    body = response.json()
    assert all(item["platform"] == "douyin" for item in body["items"])


def test_create_shop_rejects_invalid_platform(client):
    response = client.post(
        "/api/v1/shops", json={"platform": "not_real", "shop_name": "x"}
    )
    assert response.status_code == 422


def test_patch_shop_updates_fields(client, cleanup_shops):
    created = _create_shop(client, cleanup_shops)

    response = client.patch(
        f"/api/v1/shops/{created['id']}", json={"region": "华北"}
    )
    assert response.status_code == 200
    assert response.json()["region"] == "华北"


def test_enable_disable_archive_shop(client, cleanup_shops):
    created = _create_shop(client, cleanup_shops)
    shop_id = created["id"]

    disabled = client.post(f"/api/v1/shops/{shop_id}/disable")
    assert disabled.json()["status"] == "disabled"

    enabled = client.post(f"/api/v1/shops/{shop_id}/enable")
    assert enabled.json()["status"] == "active"

    archived = client.post(f"/api/v1/shops/{shop_id}/archive")
    assert archived.json()["status"] == "archived"


def test_delete_shop_without_business_data(client, cleanup_shops):
    created = _create_shop(client, cleanup_shops)

    response = client.delete(f"/api/v1/shops/{created['id']}")
    assert response.status_code == 200
    assert response.json()["success"] is True

    cleanup_shops.remove(created["id"])
    assert client.get(f"/api/v1/shops/{created['id']}").status_code == 404


def test_get_missing_shop_returns_404(client):
    response = client.get("/api/v1/shops/999999999")
    assert response.status_code == 404


def test_put_credentials_never_returns_plaintext(client, cleanup_shops, encryption_key):
    created = _create_shop(client, cleanup_shops)

    response = client.put(
        f"/api/v1/shops/{created['id']}/credentials",
        json={"app_key": "real-secret-app-key-value"},
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["credential_type"] == "app_key"
    assert body[0]["configured"] is True
    assert body[0]["value_mask"].startswith("****")
    assert "real-secret-app-key-value" not in response.text


def test_put_credentials_without_encryption_key_returns_503(client, cleanup_shops, monkeypatch):
    monkeypatch.delenv("SHOP_CREDENTIAL_ENCRYPTION_KEY", raising=False)
    created = _create_shop(client, cleanup_shops)

    response = client.put(
        f"/api/v1/shops/{created['id']}/credentials",
        json={"app_key": "value"},
    )
    assert response.status_code == 503
    assert "value" not in response.text.lower() or "加密" in response.text


def test_delete_credential(client, cleanup_shops, encryption_key):
    created = _create_shop(client, cleanup_shops)
    client.put(
        f"/api/v1/shops/{created['id']}/credentials",
        json={"client_secret": "cs-value"},
    )

    response = client.delete(
        f"/api/v1/shops/{created['id']}/credentials/client_secret"
    )
    assert response.status_code == 200

    missing = client.delete(
        f"/api/v1/shops/{created['id']}/credentials/client_secret"
    )
    assert missing.status_code == 404


def test_test_connection_not_configured(client, cleanup_shops):
    created = _create_shop(client, cleanup_shops)

    response = client.post(f"/api/v1/shops/{created['id']}/test-connection")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_configured"
    assert body["connector_available"] is False


def test_test_connection_not_implemented(client, cleanup_shops, encryption_key):
    created = _create_shop(client, cleanup_shops, platform="taobao")
    client.put(
        f"/api/v1/shops/{created['id']}/credentials",
        json={"app_key": "x", "app_secret": "y"},
    )

    response = client.post(f"/api/v1/shops/{created['id']}/test-connection")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_implemented"
    assert body["status"] != "connected"


def test_oauth_start_not_implemented(client, cleanup_shops):
    created = _create_shop(client, cleanup_shops, platform="douyin", auth_type="oauth")

    response = client.get(f"/api/v1/shops/{created['id']}/oauth/start")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_implemented"
    assert body["authorize_url"] is None


def test_oauth_callback_missing_state_is_safe(client):
    response = client.get("/api/v1/platforms/oauth/callback")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "invalid_state"


def test_oauth_callback_invalid_state_does_not_leak_code(client):
    response = client.get(
        "/api/v1/platforms/oauth/callback",
        params={"state": "not-a-real-state", "code": "AUTH_CODE_SHOULD_NOT_LEAK"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "invalid_state"
    assert "AUTH_CODE_SHOULD_NOT_LEAK" not in response.text
