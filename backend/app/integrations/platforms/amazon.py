"""
Amazon Selling Partner API 连接器（阶段 8E：框架占位）。

本阶段不接入 Amazon SP-API 真实接口。
"""

from app.integrations.platforms.mock_or_unconfigured import (
    UnconfiguredPlatformConnector,
)


class AmazonConnector(UnconfiguredPlatformConnector):
    def __init__(self) -> None:
        super().__init__("amazon")
