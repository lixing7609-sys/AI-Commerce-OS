"""
平台连接器抽象接口（阶段 8E）。

本阶段不接入任何真实平台 API（抖音/淘宝/天猫/京东/拼多多/小红书/
视频号/快手/亚马逊/Shopee 等）。所有具体连接器（douyin.py/
taobao.py/amazon.py/shopee.py）在本阶段都只是"框架已就绪、尚未
接入真实开放平台接口"的安全占位实现，不发出任何真实网络请求、不
调用任何未知第三方 URL、不伪装成功。

未来真实接入时，具体子类只需要实现 test_connection() /
start_oauth() / refresh_credentials() 三个方法里真正的平台调用
逻辑，本文件定义的返回结构和错误语义不需要改变。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ConnectionTestResult:
    """
    POST /shops/{id}/test-connection 的统一返回结构。

    connector_available=False 时 status 只能是 "not_implemented"
    （连接器框架已就绪但尚未接入真实平台接口）；connector_available
    =True 且凭据未配置时 status 为 "not_configured"；本阶段没有任何
    连接器会返回 "connected"，因为没有真实平台请求会被发出。
    """

    status: str
    connector_available: bool
    message: str
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OAuthStartResult:
    """
    GET /shops/{id}/oauth/start 的统一返回结构。

    not_implemented 平台不生成任何授权 URL（authorize_url 恒为
    None），避免前端把占位 URL 误当作真实可用的跳转地址。
    """

    status: str
    authorize_url: str | None
    message: str


@dataclass(frozen=True)
class RefreshResult:
    """
    refresh_credentials() 的统一返回结构。本阶段所有连接器都返回
    not_implemented，不生成任何虚假过期时间或 token。
    """

    status: str
    message: str


class PlatformConnector(ABC):
    """
    单个电商/内容平台的连接器抽象基类。
    """

    platform: str

    @abstractmethod
    def test_connection(self, shop, credentials: dict[str, bool]) -> ConnectionTestResult:
        """
        测试店铺当前配置的凭据是否可用。

        credentials 只包含"该凭据类型是否已配置"的布尔值（例如
        {"app_key": True, "app_secret": False}），不包含任何明文
        或密文 Secret——具体连接器如果未来需要真实调用平台接口，
        必须自行通过 CredentialEncryptionService 在内部解密，本
        方法签名不传递明文。
        """

        raise NotImplementedError

    @abstractmethod
    def start_oauth(self, shop) -> OAuthStartResult:
        """
        生成 OAuth 授权跳转地址。本阶段所有平台都返回
        not_implemented，不生成任何授权 URL。
        """

        raise NotImplementedError

    @abstractmethod
    def refresh_credentials(self, shop) -> RefreshResult:
        """
        刷新 access_token/refresh_token。本阶段所有平台都返回
        not_implemented，不启动真实定时刷新、不生成虚假过期时间。
        """

        raise NotImplementedError
