import logging
import os
from enum import Enum

from fastapi import HTTPException

logger = logging.getLogger("app.edition")

_ENV_VAR_NAME = "EDITION"

_NOT_FOUND_DETAIL = "Not Found"


class Edition(str, Enum):
    """
    ADR-0002 定义的四个产品 Edition。所有 Edition 共享同一个 Core
    （Agents / Services / 数据库），Edition 只决定哪些 API 在当前
    部署上可达，本身不包含任何独立的业务逻辑。
    """

    DEVELOPER = "developer"
    OPERATOR = "operator"
    DEVICE_ADMIN = "device-admin"
    OPERATOR_CLOUD = "operator-cloud"


def get_active_edition() -> Edition:
    """
    读取当前进程的 Edition（环境变量 EDITION，每次调用都重新读取，
    不缓存，风格与 config.py 里其它 get_*_config() 一致）。

    未设置或值无法识别时，安全默认为 DEVELOPER——这保证了
    ADR-0002 之前就存在的所有部署和测试，在不显式设置 EDITION 的
    情况下行为完全不变（开发者可见全部路由）。这个默认值本身就是
    这套改动"零风险上线"的关键：切换到更严格的 Edition 永远是
    显式操作，从不会隐式发生。
    """

    raw_value = os.environ.get(_ENV_VAR_NAME)

    if not raw_value:
        return Edition.DEVELOPER

    try:
        return Edition(raw_value.strip().lower())
    except ValueError:
        logger.error(
            "unknown EDITION value, falling back to developer: %s", raw_value
        )
        return Edition.DEVELOPER


def require_edition(*allowed_editions: Edition):
    """
    路由级权限依赖工厂：返回的依赖函数只在 get_active_edition() 属于
    allowed_editions 时放行，否则 404（不是 403）。

    使用 404 而非 403 是刻意的最小权限选择（ADR-0002 原则 F /
    Least Privilege）：对于不该访问该模块的 Edition，连"这个接口
    存在但你没权限"这一事实本身都不应该被确认。

    这里只做 Edition 级别的粗粒度访问控制，不涉及具体用户/会话
    ——当前系统尚无用户级身份认证。未来引入用户级 RBAC 时，本依赖
    应该和用户角色检查组合使用，而不是被取代。
    """

    def _check_edition() -> None:
        if get_active_edition() not in allowed_editions:
            raise HTTPException(status_code=404, detail=_NOT_FOUND_DETAIL)

    return _check_edition
