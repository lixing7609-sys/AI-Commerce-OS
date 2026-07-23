"""
店铺凭据加密服务（阶段 8E）。

使用成熟的 cryptography.fernet.Fernet（AES-128-CBC + HMAC）对称加密，
不自行发明加密算法。密钥只从进程环境变量 SHOP_CREDENTIAL_ENCRYPTION_KEY
读取，不写入代码、不写入数据库、不返回前端、不写入日志。

密钥未配置时：普通店铺资料（ShopDB 本身）仍可正常保存；任何涉及
Secret 加密/保存/解密的调用一律抛出
CredentialEncryptionNotConfiguredError，由上层安全转换为明确的
"未配置加密密钥" 错误响应，绝不退化为明文保存。

解密只允许平台适配器（app.integrations.platforms）内部调用，供未来
真实平台请求使用；本阶段没有真实平台请求会触发解密。
"""

import base64
import os

from cryptography.fernet import Fernet, InvalidToken

_KEY_ENV_VAR = "SHOP_CREDENTIAL_ENCRYPTION_KEY"

_MASK_VISIBLE_SUFFIX = 4
_MASK_PREFIX = "****"


class CredentialEncryptionNotConfiguredError(Exception):
    """SHOP_CREDENTIAL_ENCRYPTION_KEY 未配置或格式无效。"""


class CredentialDecryptionError(Exception):
    """密文无法用当前密钥解密（密钥更换或数据损坏）。"""


def _load_fernet() -> Fernet:
    raw_key = os.environ.get(_KEY_ENV_VAR)

    if not raw_key:
        raise CredentialEncryptionNotConfiguredError(
            f"{_KEY_ENV_VAR} 未配置，Secret 加密功能不可用"
        )

    try:
        return Fernet(raw_key.encode("utf-8"))
    except (ValueError, TypeError) as error:
        raise CredentialEncryptionNotConfiguredError(
            f"{_KEY_ENV_VAR} 格式无效，Secret 加密功能不可用"
        ) from error


class CredentialEncryptionService:
    """
    统一的凭据加密/解密/掩码服务。
    """

    @staticmethod
    def is_configured() -> bool:
        return bool(os.environ.get(_KEY_ENV_VAR))

    @staticmethod
    def encrypt(plaintext: str) -> str:
        """
        加密明文，返回可安全存入数据库 Text 列的 base64 密文字符串。

        未配置密钥时抛出 CredentialEncryptionNotConfiguredError，
        调用方不得捕获后退化为明文保存。
        """

        fernet = _load_fernet()
        token = fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")

    @staticmethod
    def decrypt(ciphertext: str) -> str:
        """
        仅供平台适配器内部调用；本阶段没有真实平台请求会触发本方法。
        """

        fernet = _load_fernet()

        try:
            plaintext = fernet.decrypt(ciphertext.encode("utf-8"))
        except InvalidToken as error:
            raise CredentialDecryptionError(
                "凭据无法解密（密钥可能已更换或数据已损坏）"
            ) from error

        return plaintext.decode("utf-8")

    @staticmethod
    def mask(plaintext: str) -> str:
        """
        生成安全展示用掩码，例如 "****abcd"。只在保存时计算一次并
        存入 value_mask 列，不依赖解密——因此即使密钥缺失也能展示
        既有掩码。
        """

        if not plaintext:
            return _MASK_PREFIX

        visible = plaintext[-_MASK_VISIBLE_SUFFIX:]
        return f"{_MASK_PREFIX}{visible}"

    @staticmethod
    def generate_key() -> str:
        """
        生成一个新的 Fernet 密钥（base64 字符串），供部署方写入
        SHOP_CREDENTIAL_ENCRYPTION_KEY 环境变量。仅供运维工具/文档
        使用，不在业务请求路径中调用。
        """

        return base64.urlsafe_b64encode(os.urandom(32)).decode("utf-8")
