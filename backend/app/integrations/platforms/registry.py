"""
平台连接器注册中心（阶段 8E）。

根据 ShopDB.platform 取得对应连接器实例。目前仅 douyin/taobao/
tmall/amazon/shopee 有独立占位文件（对应本阶段规格明确列出的
"至少包含"清单）；其余平台（kuaishou/jd/pinduoduo/xiaohongshu/
wechat_shop/other）复用通用的 UnconfiguredPlatformConnector——
两者行为完全一致（都返回 not_implemented），只是分文件方便未来
逐个平台接入真实 API 时按需替换。
"""

from app.integrations.platforms.amazon import AmazonConnector
from app.integrations.platforms.base import PlatformConnector
from app.integrations.platforms.douyin import DouyinConnector
from app.integrations.platforms.mock_or_unconfigured import (
    UnconfiguredPlatformConnector,
)
from app.integrations.platforms.shopee import ShopeeConnector
from app.integrations.platforms.taobao import TaobaoConnector

_GENERIC_PLATFORMS = (
    "kuaishou",
    "jd",
    "pinduoduo",
    "xiaohongshu",
    "wechat_shop",
    "other",
)


def get_connector(platform: str) -> PlatformConnector:
    """
    根据平台标识返回连接器实例。未知平台字符串（理论上不会发生，
    ShopDB.platform 有数据库 CheckConstraint 约束）安全降级为通用
    占位连接器，不抛异常。
    """

    if platform == "douyin":
        return DouyinConnector()

    if platform in ("taobao", "tmall"):
        return TaobaoConnector(platform)

    if platform == "amazon":
        return AmazonConnector()

    if platform == "shopee":
        return ShopeeConnector()

    if platform in _GENERIC_PLATFORMS:
        return UnconfiguredPlatformConnector(platform)

    return UnconfiguredPlatformConnector(platform)
