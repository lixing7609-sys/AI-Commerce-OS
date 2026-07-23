"""
未接入真实平台接口时的安全占位连接器（阶段 8E）。

所有真实平台适配器（douyin.py/taobao.py/amazon.py/shopee.py）在
本阶段都直接复用这个占位实现，不发出任何真实网络请求。类名保留
"Mock" 字样只是为了和测试专用的 FakePlatformConnector（见
backend/tests，只在测试依赖注入中使用）明确区分——本类可以在正式
运行环境安全启用，因为它不做任何事情、不返回任何虚假成功状态；
FakePlatformConnector 不可以。
"""

from app.integrations.platforms.base import (
    ConnectionTestResult,
    OAuthStartResult,
    PlatformConnector,
    RefreshResult,
)

_NOT_IMPLEMENTED_MESSAGE = "平台连接器框架已就绪，尚未配置真实开放平台接口。"


class UnconfiguredPlatformConnector(PlatformConnector):
    """
    对任意平台都安全返回"未接入"的占位连接器。
    """

    def __init__(self, platform: str) -> None:
        self.platform = platform

    def test_connection(self, shop, credentials: dict[str, bool]) -> ConnectionTestResult:
        if not any(credentials.values()):
            return ConnectionTestResult(
                status="not_configured",
                connector_available=False,
                message="尚未配置任何凭据，无法测试连接。",
            )

        return ConnectionTestResult(
            status="not_implemented",
            connector_available=False,
            message=_NOT_IMPLEMENTED_MESSAGE,
        )

    def start_oauth(self, shop) -> OAuthStartResult:
        return OAuthStartResult(
            status="not_implemented",
            authorize_url=None,
            message=_NOT_IMPLEMENTED_MESSAGE,
        )

    def refresh_credentials(self, shop) -> RefreshResult:
        return RefreshResult(
            status="not_implemented",
            message=_NOT_IMPLEMENTED_MESSAGE,
        )
