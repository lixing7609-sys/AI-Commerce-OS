"""
抖音开放平台连接器（阶段 8E：框架占位）。

本阶段不接入抖音开放平台真实 API。真正的商品同步/订单同步/OAuth
授权在未来阶段实现时，只需要在本文件里替换 test_connection() /
start_oauth() / refresh_credentials() 的具体实现，不改变
PlatformConnector 抽象接口或调用方（ShopService）的调用方式。
"""

from app.integrations.platforms.mock_or_unconfigured import (
    UnconfiguredPlatformConnector,
)


class DouyinConnector(UnconfiguredPlatformConnector):
    def __init__(self) -> None:
        super().__init__("douyin")
