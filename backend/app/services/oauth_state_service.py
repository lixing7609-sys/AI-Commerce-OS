"""
OAuth state 校验框架（阶段 8E）。

进程内存储，防 CSRF：state 由 issue() 生成、一次性、有时效
（默认 10 分钟）。本阶段所有平台的 start_oauth() 都返回
not_implemented、不生成任何授权 URL，因此实际不会有真实 state 被
签发；本服务的意义在于为未来真实接入 OAuth 的平台提前建好可复用
的校验骨架，callback 路由已经按"state 必须存在且未过期未使用"的
假设实现。

进程重启会清空所有未消费的 state（内存存储），这对一次性、短时效
的授权流程是可接受的，不需要持久化到数据库。
"""

import secrets
import threading
from datetime import datetime, timedelta, timezone

_STATE_TTL = timedelta(minutes=10)

_lock = threading.Lock()
_states: dict[str, dict] = {}


class OAuthStateService:
    @staticmethod
    def issue(shop_id: int, platform: str) -> str:
        token = secrets.token_urlsafe(32)

        with _lock:
            _states[token] = {
                "shop_id": shop_id,
                "platform": platform,
                "expires_at": datetime.now(timezone.utc) + _STATE_TTL,
            }

        return token

    @staticmethod
    def consume(token: str) -> dict | None:
        """
        一次性消费：命中即从存储中移除，无论是否已过期——防止同一
        token 被重复提交用于重试攻击。过期或不存在都返回 None。
        """

        with _lock:
            entry = _states.pop(token, None)

        if entry is None:
            return None

        if entry["expires_at"] < datetime.now(timezone.utc):
            return None

        return entry
