import hmac
import logging

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.core.config import get_external_task_api_key

logger = logging.getLogger("app.external_task_auth")

API_KEY_HEADER_NAME = "X-Task-API-Key"

_UNCONFIGURED_DETAIL = "外部任务接入网关当前不可用，请联系管理员"
_MISSING_KEY_DETAIL = "缺少 API Key"
_INVALID_KEY_DETAIL = "API Key 无效"

# 使用 FastAPI 的 APIKeyHeader 安全模型（而不是普通 Header
# 参数），使 OpenAPI 在 components.securitySchemes 中声明一个
# apiKey/header 类型的 scheme，并让引用它的路由在 Swagger UI 中
# 显示"需要授权、header 名为 X-Task-API-Key"的输入框——不包含、
# 也不显示任何默认值或真实 Key。auto_error=False：缺失 Header 时
# 不由 APIKeyHeader 自己抛 403，而是交给下面的函数体统一按本接口
# 的语义判断返回 401 还是 503。
_api_key_header_scheme = APIKeyHeader(
    name=API_KEY_HEADER_NAME,
    auto_error=False,
    description="外部任务接入网关鉴权 Key",
)


def verify_external_task_api_key(
    x_task_api_key: str | None = Security(_api_key_header_scheme),
) -> None:
    """
    POST /integrations/tasks/submit 的 API Key 鉴权依赖。

    - 服务端未配置 EXTERNAL_TASK_API_KEY：503 + 固定安全文案，
      不区分"没配置"和"配了空字符串"，也不暴露具体原因。
    - 请求未携带或携带空 Header：401。
    - Header 值与已配置的 Key 不一致：401，使用
      hmac.compare_digest() 做恒定时间比较，避免逐字符比较提前
      返回造成的计时侧信道。

    请求携带的 Key、服务端配置的真实 Key、以及 Header 全文，均不
    写入任何日志；本函数本身也不在响应体中回显 Header 值。
    """

    configured_key = get_external_task_api_key()

    if not configured_key:
        logger.error("external task api key is not configured")
        raise HTTPException(status_code=503, detail=_UNCONFIGURED_DETAIL)

    if not x_task_api_key:
        raise HTTPException(status_code=401, detail=_MISSING_KEY_DETAIL)

    if not hmac.compare_digest(x_task_api_key, configured_key):
        raise HTTPException(status_code=401, detail=_INVALID_KEY_DETAIL)
