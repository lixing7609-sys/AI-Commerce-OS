"""
企业微信自建应用回调消息加解密（WXBizMsgCrypt 算法）。

实现依据企业微信/微信公众平台官方长期公开、广泛复用的加解密
方案（"企业微信开发者中心 - 消息加解密"），核心步骤：

1. 签名校验：对 (token, timestamp, nonce, encrypt_或_echostr) 四个
   字符串做字典序排序后拼接，取 SHA1 十六进制摘要，与请求携带的
   msg_signature 做恒定时间比较。
2. AES-256-CBC 解密：EncodingAESKey 是 43 位 base64（不含末尾
   "="）字符串，补上一个 "=" 后 base64 解码得到 32 字节密钥；IV
   取密钥前 16 字节。密文 base64 解码后用该 key/IV 做 AES-CBC
   解密，再按官方 PKCS7（块大小固定为 32，而不是 AES 本身的 16——
   这是官方参考实现的既定选择，本模块按此实现以保证与企业微信
   服务端互通）去除填充。
3. 解密后的明文结构为
   `random(16 字节) + msg_len(4 字节网络字节序) + msg + corpid`，
   按此顺序切片还原出原始消息内容，并校验 corpid 与配置一致。
4. 加密回复消息时按相反顺序构造并加密，使用新的随机数。

本模块只做通用的加解密原语，不解析具体业务 XML 字段，也不知道
Agent 名册或任务状态——保持"企业微信工作流只负责验签/解密"的
职责边界。
"""

import base64
import hashlib
import os
import struct

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

_PKCS7_BLOCK_SIZE = 32


class WeComCryptoError(Exception):
    """
    签名校验失败、AES 解密失败、消息结构不合法或 corpid 不匹配时
    统一抛出的异常。异常信息只描述失败类型，不包含密钥、密文或
    明文内容，调用方可以安全地把 str(error) 记录到日志。
    """


def _pkcs7_pad(data: bytes) -> bytes:
    pad_len = _PKCS7_BLOCK_SIZE - (len(data) % _PKCS7_BLOCK_SIZE)
    if pad_len == 0:
        pad_len = _PKCS7_BLOCK_SIZE
    return data + bytes([pad_len]) * pad_len


def _pkcs7_unpad(data: bytes) -> bytes:
    if not data:
        raise WeComCryptoError("解密结果为空，无法去除填充")

    pad_len = data[-1]

    if pad_len < 1 or pad_len > _PKCS7_BLOCK_SIZE or pad_len > len(data):
        raise WeComCryptoError("填充字节不合法")

    return data[:-pad_len]


def _decode_aes_key(encoding_aes_key: str) -> bytes:
    try:
        key = base64.b64decode(encoding_aes_key + "=")
    except Exception as error:
        raise WeComCryptoError("EncodingAESKey 格式不合法") from error

    if len(key) != 32:
        raise WeComCryptoError("EncodingAESKey 解码后长度不是 32 字节")

    return key


def compute_signature(
    token: str, timestamp: str, nonce: str, encrypt_or_echostr: str
) -> str:
    """
    对 4 个字符串排序拼接后取 SHA1 十六进制摘要。
    """

    parts = sorted([token, timestamp, nonce, encrypt_or_echostr])
    joined = "".join(parts)
    return hashlib.sha1(joined.encode("utf-8")).hexdigest()


def verify_signature(
    *,
    token: str,
    timestamp: str,
    nonce: str,
    encrypt_or_echostr: str,
    msg_signature: str,
) -> bool:
    """
    恒定时间比较计算出的签名与请求携带的签名是否一致。
    """

    import hmac as _hmac

    expected = compute_signature(token, timestamp, nonce, encrypt_or_echostr)
    return _hmac.compare_digest(expected, msg_signature)


def decrypt(
    *, encoding_aes_key: str, corp_id: str, encrypted_base64: str
) -> str:
    """
    解密企业微信回调携带的 Encrypt/echostr 字段，返回原始明文
    字符串（UTF-8）。会校验解密出的 corpid 与配置的 corp_id 一致，
    不一致时抛出 WeComCryptoError，防止跨企业消息被误接受。
    """

    key = _decode_aes_key(encoding_aes_key)
    iv = key[:16]

    try:
        ciphertext = base64.b64decode(encrypted_base64)
    except Exception as error:
        raise WeComCryptoError("Encrypt 字段不是合法的 base64") from error

    if len(ciphertext) % 16 != 0:
        raise WeComCryptoError("密文长度不是 AES 块大小的整数倍")

    try:
        decryptor = Cipher(
            algorithms.AES(key), modes.CBC(iv)
        ).decryptor()
        padded_plain = decryptor.update(ciphertext) + decryptor.finalize()
    except Exception as error:
        raise WeComCryptoError("AES 解密失败") from error

    content = _pkcs7_unpad(padded_plain)

    if len(content) < 20:
        raise WeComCryptoError("解密后内容长度不足，结构不合法")

    msg_len = struct.unpack("!I", content[16:20])[0]

    if len(content) < 20 + msg_len:
        raise WeComCryptoError("解密后内容长度与 msg_len 不匹配")

    msg = content[20 : 20 + msg_len]
    received_corp_id = content[20 + msg_len :].decode("utf-8", errors="strict")

    if received_corp_id != corp_id:
        raise WeComCryptoError("解密内容中的 CorpID 与配置不匹配")

    return msg.decode("utf-8", errors="strict")


def encrypt(
    *, encoding_aes_key: str, corp_id: str, plain_text: str
) -> str:
    """
    加密回复给企业微信的明文消息，返回 base64 编码的密文
    （Encrypt 字段值）。
    """

    key = _decode_aes_key(encoding_aes_key)
    iv = key[:16]

    random_bytes = os.urandom(16)
    msg_bytes = plain_text.encode("utf-8")
    msg_len = struct.pack("!I", len(msg_bytes))
    corp_id_bytes = corp_id.encode("utf-8")

    content = random_bytes + msg_len + msg_bytes + corp_id_bytes
    padded_content = _pkcs7_pad(content)

    encryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
    ciphertext = encryptor.update(padded_content) + encryptor.finalize()

    return base64.b64encode(ciphertext).decode("ascii")
