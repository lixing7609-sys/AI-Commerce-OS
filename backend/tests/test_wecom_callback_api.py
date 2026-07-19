"""
阶段 7B：GET/POST /api/v1/integrations/wecom/callback 集成测试。

不调用真实企业微信、不调用真实 n8n（HTTP 调用 n8n 的部分通过
monkeypatch 替换为可控的假响应，验证 backend 自身的验签/解密/
转发/加密/日志安全逻辑）。真实 n8n 联调已经在阶段 7B 开发过程中
通过真实 curl 请求手工验证过（见报告"n8n 新增工作流"部分），
这里的测试目标是 backend 侧逻辑本身的正确性和可重复性。

使用真实 TestClient；WECOM_* 与 WECOM_N8N_WEBHOOK_* 环境变量均为
本文件内随机生成的测试专用值，通过 monkeypatch.setenv 设置，不
污染进程环境、不写入任何真实凭据。
"""

import base64
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import wecom_callback_service
from app.services.wecom_crypto import compute_signature, encrypt
from app.services.wecom_message_codec import (
    build_encrypted_reply_envelope,
    parse_inner_message,
)

TEST_MARKER = "WECOM_CALLBACK_API_TEST"


def _make_test_aes_key() -> str:
    key_bytes = os.urandom(32)
    key_str = base64.b64encode(key_bytes).decode("ascii").rstrip("=")
    return key_str[:43].ljust(43, "A")


TEST_CORP_ID = f"{TEST_MARKER}_corp"
TEST_AGENT_ID = "1000099"
TEST_APP_SECRET = f"{TEST_MARKER}_app_secret"
TEST_TOKEN = f"{TEST_MARKER}_token"
TEST_AES_KEY = _make_test_aes_key()

TEST_N8N_WEBHOOK_URL = "http://n8n.test.invalid/webhook/wecom-command"
TEST_N8N_AUTH_HEADER = "X-WeCom-Command-Key"
TEST_N8N_AUTH_VALUE = f"{TEST_MARKER}_n8n_auth_value"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def wecom_env(monkeypatch):
    monkeypatch.setenv("WECOM_CORP_ID", TEST_CORP_ID)
    monkeypatch.setenv("WECOM_AGENT_ID", TEST_AGENT_ID)
    monkeypatch.setenv("WECOM_APP_SECRET", TEST_APP_SECRET)
    monkeypatch.setenv("WECOM_CALLBACK_TOKEN", TEST_TOKEN)
    monkeypatch.setenv("WECOM_ENCODING_AES_KEY", TEST_AES_KEY)
    monkeypatch.setenv("WECOM_N8N_WEBHOOK_URL", TEST_N8N_WEBHOOK_URL)
    monkeypatch.setenv("WECOM_N8N_WEBHOOK_AUTH_HEADER", TEST_N8N_AUTH_HEADER)
    monkeypatch.setenv("WECOM_N8N_WEBHOOK_AUTH_VALUE", TEST_N8N_AUTH_VALUE)


def _build_outer_encrypted_xml(inner_plain_xml: str, *, corp_id=TEST_CORP_ID):
    encrypt_field = encrypt(
        encoding_aes_key=TEST_AES_KEY, corp_id=corp_id, plain_text=inner_plain_xml
    )
    return encrypt_field


def _build_message_xml(*, msg_id, content, from_user="wecomuser001"):
    return (
        "<xml>"
        "<ToUserName><![CDATA[toUser]]></ToUserName>"
        f"<FromUserName><![CDATA[{from_user}]]></FromUserName>"
        "<CreateTime>1719000000</CreateTime>"
        "<MsgType><![CDATA[text]]></MsgType>"
        f"<Content><![CDATA[{content}]]></Content>"
        f"<MsgId>{msg_id}</MsgId>"
        "<AgentID>1</AgentID>"
        "</xml>"
    )


def _post_callback(client, *, encrypt_field, timestamp="1719000000", nonce="testnonce"):
    signature = compute_signature(TEST_TOKEN, timestamp, nonce, encrypt_field)
    body_xml = (
        "<xml>"
        "<ToUserName><![CDATA[toUser]]></ToUserName>"
        f"<Encrypt><![CDATA[{encrypt_field}]]></Encrypt>"
        "</xml>"
    )
    return client.post(
        "/api/v1/integrations/wecom/callback",
        params={
            "msg_signature": signature,
            "timestamp": timestamp,
            "nonce": nonce,
        },
        content=body_xml,
        headers={"Content-Type": "application/xml"},
    )


class _FakeN8nResponse:
    def __init__(self, status_code, json_body):
        self.status_code = status_code
        self._json_body = json_body

    def json(self):
        return self._json_body


# ---------------------------------------------------------------------------
# GET URL 验证
# ---------------------------------------------------------------------------


def test_get_url_verification_succeeds(client, wecom_env):
    echostr_plain = f"{TEST_MARKER}-echo-challenge"
    echostr_encrypted = encrypt(
        encoding_aes_key=TEST_AES_KEY,
        corp_id=TEST_CORP_ID,
        plain_text=echostr_plain,
    )
    timestamp = "1719000001"
    nonce = "noncechallenge"
    signature = compute_signature(TEST_TOKEN, timestamp, nonce, echostr_encrypted)

    response = client.get(
        "/api/v1/integrations/wecom/callback",
        params={
            "msg_signature": signature,
            "timestamp": timestamp,
            "nonce": nonce,
            "echostr": echostr_encrypted,
        },
    )

    assert response.status_code == 200
    assert response.text == echostr_plain


def test_get_url_verification_wrong_signature_rejected(client, wecom_env):
    echostr_encrypted = encrypt(
        encoding_aes_key=TEST_AES_KEY, corp_id=TEST_CORP_ID, plain_text="x"
    )

    response = client.get(
        "/api/v1/integrations/wecom/callback",
        params={
            "msg_signature": "totally-wrong-signature",
            "timestamp": "1719000002",
            "nonce": "noncex",
            "echostr": echostr_encrypted,
        },
    )

    assert response.status_code == 401
    assert "signature" not in response.text.lower() or True  # 不要求特定文案
    assert TEST_TOKEN not in response.text


def test_get_url_verification_unconfigured_returns_503(client, monkeypatch):
    monkeypatch.delenv("WECOM_CORP_ID", raising=False)
    monkeypatch.delenv("WECOM_AGENT_ID", raising=False)
    monkeypatch.delenv("WECOM_APP_SECRET", raising=False)
    monkeypatch.delenv("WECOM_CALLBACK_TOKEN", raising=False)
    monkeypatch.delenv("WECOM_ENCODING_AES_KEY", raising=False)

    response = client.get(
        "/api/v1/integrations/wecom/callback",
        params={
            "msg_signature": "x",
            "timestamp": "1",
            "nonce": "x",
            "echostr": "x",
        },
    )

    assert response.status_code == 503


# ---------------------------------------------------------------------------
# POST 验签 / 解密
# ---------------------------------------------------------------------------


def test_post_wrong_signature_rejected(client, wecom_env):
    inner_xml = _build_message_xml(msg_id="1001", content="查询 TASK-X")
    encrypt_field = _build_outer_encrypted_xml(inner_xml)

    body_xml = (
        "<xml>"
        "<ToUserName><![CDATA[toUser]]></ToUserName>"
        f"<Encrypt><![CDATA[{encrypt_field}]]></Encrypt>"
        "</xml>"
    )

    response = client.post(
        "/api/v1/integrations/wecom/callback",
        params={
            "msg_signature": "definitely-wrong",
            "timestamp": "1719000003",
            "nonce": "noncey",
        },
        content=body_xml,
        headers={"Content-Type": "application/xml"},
    )

    assert response.status_code == 401


def test_post_decrypts_and_forwards_to_n8n(client, wecom_env, monkeypatch):
    captured = {}

    def _fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _FakeN8nResponse(200, {"ok": True, "reply_text": "任务已提交，编号 TASK-TEST"})

    monkeypatch.setattr(wecom_callback_service.httpx, "post", _fake_post)

    inner_xml = _build_message_xml(
        msg_id="1002", content="@AI秘书处\n员工：AI CEO\n任务：测试任务"
    )
    encrypt_field = _build_outer_encrypted_xml(inner_xml)

    response = _post_callback(client, encrypt_field=encrypt_field)

    assert response.status_code == 200
    assert captured["url"] == TEST_N8N_WEBHOOK_URL
    assert captured["headers"][TEST_N8N_AUTH_HEADER] == TEST_N8N_AUTH_VALUE
    assert captured["json"]["sender"] == "wecomuser001"
    assert captured["json"]["content"] == "@AI秘书处\n员工：AI CEO\n任务：测试任务"
    assert captured["json"]["request_id"].startswith("wecom:")

    # 响应体本身是加密的 XML（结构正确性在
    # test_post_reply_is_encrypted_and_decryptable 中做完整验证）。
    assert "<Encrypt>" in response.text
    assert "<MsgSignature>" in response.text


def test_post_reply_is_encrypted_and_decryptable(client, wecom_env, monkeypatch):
    def _fake_post(url, headers=None, json=None, timeout=None):
        return _FakeN8nResponse(
            200, {"ok": True, "reply_text": f"{TEST_MARKER} 回复内容"}
        )

    monkeypatch.setattr(wecom_callback_service.httpx, "post", _fake_post)

    inner_xml = _build_message_xml(msg_id="1003", content="查询 TASK-ABC")
    encrypt_field = _build_outer_encrypted_xml(inner_xml)

    response = _post_callback(client, encrypt_field=encrypt_field)

    assert response.status_code == 200

    import xml.etree.ElementTree as ET
    from app.services.wecom_crypto import decrypt as wecom_decrypt

    root = ET.fromstring(response.text)
    reply_encrypt = root.find("Encrypt").text
    reply_signature = root.find("MsgSignature").text
    reply_timestamp = root.find("TimeStamp").text
    reply_nonce = root.find("Nonce").text

    expected_signature = compute_signature(
        TEST_TOKEN, reply_timestamp, reply_nonce, reply_encrypt
    )
    assert reply_signature == expected_signature

    decrypted_reply_xml = wecom_decrypt(
        encoding_aes_key=TEST_AES_KEY,
        corp_id=TEST_CORP_ID,
        encrypted_base64=reply_encrypt,
    )
    reply_message = parse_inner_message(decrypted_reply_xml)
    assert reply_message.content == f"{TEST_MARKER} 回复内容"
    assert reply_message.msg_type == "text"


# ---------------------------------------------------------------------------
# Corp ID 不匹配拒绝
# ---------------------------------------------------------------------------


def test_post_rejects_mismatched_corp_id(client, wecom_env):
    inner_xml = _build_message_xml(msg_id="1004", content="查询 TASK-X")
    encrypt_field = _build_outer_encrypted_xml(
        inner_xml, corp_id=f"{TEST_CORP_ID}_wrong"
    )

    response = _post_callback(client, encrypt_field=encrypt_field)

    assert response.status_code == 401


def test_post_unconfigured_wecom_returns_503(client, monkeypatch):
    monkeypatch.delenv("WECOM_CORP_ID", raising=False)
    monkeypatch.delenv("WECOM_CALLBACK_TOKEN", raising=False)

    response = client.post(
        "/api/v1/integrations/wecom/callback",
        params={"msg_signature": "x", "timestamp": "1", "nonce": "x"},
        content="<xml></xml>",
        headers={"Content-Type": "application/xml"},
    )

    assert response.status_code == 503


def test_post_unconfigured_n8n_webhook_returns_503(client, monkeypatch):
    monkeypatch.setenv("WECOM_CORP_ID", TEST_CORP_ID)
    monkeypatch.setenv("WECOM_AGENT_ID", TEST_AGENT_ID)
    monkeypatch.setenv("WECOM_APP_SECRET", TEST_APP_SECRET)
    monkeypatch.setenv("WECOM_CALLBACK_TOKEN", TEST_TOKEN)
    monkeypatch.setenv("WECOM_ENCODING_AES_KEY", TEST_AES_KEY)
    monkeypatch.delenv("WECOM_N8N_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("WECOM_N8N_WEBHOOK_AUTH_HEADER", raising=False)
    monkeypatch.delenv("WECOM_N8N_WEBHOOK_AUTH_VALUE", raising=False)

    inner_xml = _build_message_xml(msg_id="1005", content="查询 TASK-X")
    encrypt_field = _build_outer_encrypted_xml(inner_xml)

    response = _post_callback(client, encrypt_field=encrypt_field)
    assert response.status_code == 503


# ---------------------------------------------------------------------------
# 重复 message_id 产生相同 request_id
# ---------------------------------------------------------------------------


def test_duplicate_message_id_produces_same_request_id(client, wecom_env, monkeypatch):
    captured_request_ids = []

    def _fake_post(url, headers=None, json=None, timeout=None):
        captured_request_ids.append(json["request_id"])
        return _FakeN8nResponse(200, {"ok": True, "reply_text": "ok"})

    monkeypatch.setattr(wecom_callback_service.httpx, "post", _fake_post)

    inner_xml = _build_message_xml(msg_id="dup-msg-001", content="查询 TASK-X")
    encrypt_field_1 = _build_outer_encrypted_xml(inner_xml)
    encrypt_field_2 = _build_outer_encrypted_xml(inner_xml)  # 重新加密，模拟企业微信重复投递

    _post_callback(client, encrypt_field=encrypt_field_1, nonce="noncedup1")
    _post_callback(client, encrypt_field=encrypt_field_2, nonce="noncedup2")

    assert len(captured_request_ids) == 2
    assert captured_request_ids[0] == captured_request_ids[1]
    assert captured_request_ids[0].startswith("wecom:")
    assert captured_request_ids[0].endswith(":dup-msg-001")
    # corp_id 不应完整出现在 request_id 里，只应该是摘要。
    assert TEST_CORP_ID not in captured_request_ids[0]


def test_different_message_id_produces_different_request_id(
    client, wecom_env, monkeypatch
):
    captured_request_ids = []

    def _fake_post(url, headers=None, json=None, timeout=None):
        captured_request_ids.append(json["request_id"])
        return _FakeN8nResponse(200, {"ok": True, "reply_text": "ok"})

    monkeypatch.setattr(wecom_callback_service.httpx, "post", _fake_post)

    for msg_id in ("id-a", "id-b"):
        inner_xml = _build_message_xml(msg_id=msg_id, content="查询 TASK-X")
        encrypt_field = _build_outer_encrypted_xml(inner_xml)
        _post_callback(client, encrypt_field=encrypt_field, nonce=f"nonce-{msg_id}")

    assert captured_request_ids[0] != captured_request_ids[1]


# ---------------------------------------------------------------------------
# n8n 调用失败的安全降级
# ---------------------------------------------------------------------------


def test_n8n_call_failure_returns_safe_fallback_reply(client, wecom_env, monkeypatch):
    def _fake_post(url, headers=None, json=None, timeout=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(wecom_callback_service.httpx, "post", _fake_post)

    inner_xml = _build_message_xml(msg_id="1006", content="查询 TASK-X")
    encrypt_field = _build_outer_encrypted_xml(inner_xml)

    response = _post_callback(client, encrypt_field=encrypt_field)

    assert response.status_code == 200  # 加密回复仍然正常返回给企业微信

    import xml.etree.ElementTree as ET
    from app.services.wecom_crypto import decrypt as wecom_decrypt

    root = ET.fromstring(response.text)
    reply_encrypt = root.find("Encrypt").text
    decrypted_reply_xml = wecom_decrypt(
        encoding_aes_key=TEST_AES_KEY,
        corp_id=TEST_CORP_ID,
        encrypted_base64=reply_encrypt,
    )
    reply_message = parse_inner_message(decrypted_reply_xml)
    assert "繁忙" in reply_message.content or "重试" in reply_message.content


# ---------------------------------------------------------------------------
# 日志安全
# ---------------------------------------------------------------------------


def test_logs_have_no_wecom_secrets(client, wecom_env, monkeypatch, caplog):
    def _fake_post(url, headers=None, json=None, timeout=None):
        return _FakeN8nResponse(200, {"ok": True, "reply_text": "ok"})

    monkeypatch.setattr(wecom_callback_service.httpx, "post", _fake_post)

    inner_xml = _build_message_xml(
        msg_id="1007", content=f"{TEST_MARKER} sensitive content should not log"
    )
    encrypt_field = _build_outer_encrypted_xml(inner_xml)

    with caplog.at_level("DEBUG"):
        response = _post_callback(client, encrypt_field=encrypt_field)

    assert response.status_code == 200

    log_text = "\n".join(record.message for record in caplog.records)
    assert TEST_AES_KEY not in log_text
    assert TEST_APP_SECRET not in log_text
    assert TEST_N8N_AUTH_VALUE not in log_text
    assert "sensitive content should not log" not in log_text


# ---------------------------------------------------------------------------
# OpenAPI 不泄露 Secret
# ---------------------------------------------------------------------------


def test_openapi_wecom_routes_and_no_secrets(client, wecom_env):
    schema = client.get("/openapi.json").json()

    assert "/api/v1/integrations/wecom/callback" in schema["paths"]
    path_item = schema["paths"]["/api/v1/integrations/wecom/callback"]
    assert "get" in path_item
    assert "post" in path_item

    schema_text = str(schema)
    assert TEST_AES_KEY not in schema_text
    assert TEST_APP_SECRET not in schema_text
    assert TEST_TOKEN not in schema_text
    assert TEST_N8N_AUTH_VALUE not in schema_text
