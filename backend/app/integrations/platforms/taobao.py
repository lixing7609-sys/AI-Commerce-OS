"""
淘宝/天猫开放平台连接器（阶段 8E：框架占位）。

本阶段不接入淘宝开放平台真实 API。
"""

from app.integrations.platforms.mock_or_unconfigured import (
    UnconfiguredPlatformConnector,
)


class TaobaoConnector(UnconfiguredPlatformConnector):
    def __init__(self, platform: str = "taobao") -> None:
        super().__init__(platform)
