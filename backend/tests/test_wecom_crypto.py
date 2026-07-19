"""
阶段 7B：企业微信 WXBizMsgCrypt 加解密算法单元测试。

不调用真实企业微信、不使用真实 Corp ID/Token/EncodingAESKey——
所有测试使用本文件内随机生成的测试专用凭据，验证算法本身的
正确性（加密后能解密回原文、签名能验证、篡改能被拒绝），而不是
验证与企业微信服务端的真实互通性（那需要真实回调，见阶段 7B
报告中"真实企业微信联调"部分的说明）。
"""

import base64
import os

import pytest

from app.services.wecom_crypto import (
    WeComCryptoError,
    compute_signature,
    decrypt,
    encrypt,
    verify_signature,
)

TEST_MARKER = "WECOM_CRYPTO_TEST"


def _make_test_aes_key() -> str:
    """
    生成一个符合企业微信规范的 43 位测试 EncodingAESKey
    （base64 字符集，解码后为 32 字节）。
    """

    key_bytes = os.urandom(32)
    key_str = base64.b64encode(key_bytes).decode("ascii").rstrip("=")
    # base64.b64encode(32 字节) 不含 "=" 时长度恒为 43，
    # 这里仍做一次保险截断/补齐，避免因编码细节产生长度误差。
    return key_str[:43].ljust(43, "A")


@pytest.fixture
def aes_key():
    return _make_test_aes_key()


@pytest.fixture
def corp_id():
    return f"{TEST_MARKER}_corp_id_001"


# ---------------------------------------------------------------------------
# encrypt/decrypt 往返
# ---------------------------------------------------------------------------


def test_encrypt_decrypt_round_trip_ascii(aes_key, corp_id):
    plain = f"{TEST_MARKER} hello world"
    encrypted = encrypt(encoding_aes_key=aes_key, corp_id=corp_id, plain_text=plain)
    decrypted = decrypt(
        encoding_aes_key=aes_key, corp_id=corp_id, encrypted_base64=encrypted
    )
    assert decrypted == plain


def test_encrypt_decrypt_round_trip_unicode_and_xml_chars(aes_key, corp_id):
    plain = (
        f"{TEST_MARKER} 这是一条包含 <xml>&特殊字符</xml> 的测试消息，"
        "换行\n和制表符\t也要保留"
    )
    encrypted = encrypt(encoding_aes_key=aes_key, corp_id=corp_id, plain_text=plain)
    decrypted = decrypt(
        encoding_aes_key=aes_key, corp_id=corp_id, encrypted_base64=encrypted
    )
    assert decrypted == plain


def test_encrypt_decrypt_round_trip_empty_string(aes_key, corp_id):
    encrypted = encrypt(encoding_aes_key=aes_key, corp_id=corp_id, plain_text="")
    decrypted = decrypt(
        encoding_aes_key=aes_key, corp_id=corp_id, encrypted_base64=encrypted
    )
    assert decrypted == ""


def test_encrypt_decrypt_round_trip_long_message(aes_key, corp_id):
    plain = f"{TEST_MARKER} " + ("测试内容片段。" * 200)
    encrypted = encrypt(encoding_aes_key=aes_key, corp_id=corp_id, plain_text=plain)
    decrypted = decrypt(
        encoding_aes_key=aes_key, corp_id=corp_id, encrypted_base64=encrypted
    )
    assert decrypted == plain


def test_encrypt_produces_different_ciphertext_each_time(aes_key, corp_id):
    """
    每次加密使用新的随机数，因此同一段明文两次加密结果应不同
    （即使解密后都还原成同一明文）。
    """

    plain = f"{TEST_MARKER} same content"
    encrypted_1 = encrypt(encoding_aes_key=aes_key, corp_id=corp_id, plain_text=plain)
    encrypted_2 = encrypt(encoding_aes_key=aes_key, corp_id=corp_id, plain_text=plain)

    assert encrypted_1 != encrypted_2
    assert (
        decrypt(encoding_aes_key=aes_key, corp_id=corp_id, encrypted_base64=encrypted_1)
        == plain
    )
    assert (
        decrypt(encoding_aes_key=aes_key, corp_id=corp_id, encrypted_base64=encrypted_2)
        == plain
    )


# ---------------------------------------------------------------------------
# CorpID 校验
# ---------------------------------------------------------------------------


def test_decrypt_rejects_mismatched_corp_id(aes_key, corp_id):
    encrypted = encrypt(
        encoding_aes_key=aes_key, corp_id=corp_id, plain_text="x"
    )

    with pytest.raises(WeComCryptoError):
        decrypt(
            encoding_aes_key=aes_key,
            corp_id=f"{corp_id}_different",
            encrypted_base64=encrypted,
        )


# ---------------------------------------------------------------------------
# 篡改/损坏输入的安全处理
# ---------------------------------------------------------------------------


def test_decrypt_rejects_corrupted_base64(aes_key, corp_id):
    with pytest.raises(WeComCryptoError):
        decrypt(
            encoding_aes_key=aes_key,
            corp_id=corp_id,
            encrypted_base64="not-valid-base64-!!!",
        )


def test_decrypt_rejects_wrong_length_ciphertext(aes_key, corp_id):
    # 合法 base64，但解码后长度不是 16 的整数倍。
    bad_ciphertext = base64.b64encode(b"short").decode("ascii")

    with pytest.raises(WeComCryptoError):
        decrypt(
            encoding_aes_key=aes_key,
            corp_id=corp_id,
            encrypted_base64=bad_ciphertext,
        )


def test_decrypt_rejects_ciphertext_encrypted_with_different_key(corp_id):
    key_a = _make_test_aes_key()
    key_b = _make_test_aes_key()

    encrypted = encrypt(encoding_aes_key=key_a, corp_id=corp_id, plain_text="x")

    with pytest.raises(WeComCryptoError):
        decrypt(encoding_aes_key=key_b, corp_id=corp_id, encrypted_base64=encrypted)


def test_invalid_encoding_aes_key_format_rejected(corp_id):
    with pytest.raises(WeComCryptoError):
        decrypt(
            encoding_aes_key="too-short",
            corp_id=corp_id,
            encrypted_base64=base64.b64encode(b"0" * 32).decode("ascii"),
        )


# ---------------------------------------------------------------------------
# 签名
# ---------------------------------------------------------------------------


def test_signature_verifies_for_correct_inputs():
    token = f"{TEST_MARKER}_token"
    timestamp = "1719000000"
    nonce = "nonce123"
    encrypt_field = "some-encrypted-or-echostr-value"

    signature = compute_signature(token, timestamp, nonce, encrypt_field)

    assert verify_signature(
        token=token,
        timestamp=timestamp,
        nonce=nonce,
        encrypt_or_echostr=encrypt_field,
        msg_signature=signature,
    )


@pytest.mark.parametrize(
    "mutate_field",
    ["token", "timestamp", "nonce", "encrypt"],
)
def test_signature_rejects_any_single_field_tampering(mutate_field):
    token = f"{TEST_MARKER}_token"
    timestamp = "1719000000"
    nonce = "nonce123"
    encrypt_field = "some-encrypted-value"

    signature = compute_signature(token, timestamp, nonce, encrypt_field)

    values = {
        "token": token,
        "timestamp": timestamp,
        "nonce": nonce,
        "encrypt": encrypt_field,
    }
    values[mutate_field] = values[mutate_field] + "_tampered"

    assert not verify_signature(
        token=values["token"],
        timestamp=values["timestamp"],
        nonce=values["nonce"],
        encrypt_or_echostr=values["encrypt"],
        msg_signature=signature,
    )


def test_signature_is_order_independent_due_to_sorting():
    """
    官方算法要求先排序再拼接，因此传参顺序本身不影响最终结果——
    这里验证 compute_signature 内部确实做了排序（用两组明显
    字典序不同的输入验证签名一致）。
    """

    sig1 = compute_signature("bbb", "aaa", "ccc", "ddd")
    sig2 = compute_signature("ddd", "ccc", "bbb", "aaa")
    assert sig1 == sig2
