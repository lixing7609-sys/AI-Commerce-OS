"""
Shopee Open Platform 连接器（阶段 8E：框架占位）。

本阶段不接入 Shopee 开放平台真实接口。
"""

from app.integrations.platforms.mock_or_unconfigured import (
    UnconfiguredPlatformConnector,
)


class ShopeeConnector(UnconfiguredPlatformConnector):
    def __init__(self) -> None:
        super().__init__("shopee")
