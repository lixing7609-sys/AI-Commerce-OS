import logging

from fastapi import APIRouter, Depends

from app.core.edition import Edition, require_edition
from app.integrations.platforms.registry import get_connector
from app.models.shop_api import OAuthCallbackResponse
from app.services.oauth_state_service import OAuthStateService

logger = logging.getLogger("app.platforms_api")

router = APIRouter(
    prefix="/platforms",
    tags=["Platforms"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)

_INVALID_STATE_MESSAGE = "无效或已过期的授权状态，请重新发起授权"
_NOT_IMPLEMENTED_MESSAGE = "该平台连接器尚未接入，无法完成授权"


@router.get("/oauth/callback", response_model=OAuthCallbackResponse)
def oauth_callback(state: str | None = None, code: str | None = None):
    """
    OAuth 回调框架（阶段 8E）。

    不记录 authorization code（无论成功还是失败路径都不把 code
    写入日志），也不把 code 拼接进任何错误文案；state 一次性消费
    （无论校验结果如何都从存储中移除，防止重放）。

    本阶段没有任何平台真正签发过 state（所有 start_oauth() 都返回
    not_implemented、不生成授权 URL），因此这里 state 校验实际上
    总是失败，返回统一的安全错误——这是预期行为，不是 bug：框架
    已经就绪，真实签发 state 要等到具体平台真正接入 OAuth 时才会
    发生。code 参数只用于判断"是否存在"，从不读取其内容用于展示
    或日志。
    """

    has_code = bool(code)

    if not state:
        logger.info("oauth callback rejected: missing state has_code=%s", has_code)
        return OAuthCallbackResponse(status="invalid_state", message=_INVALID_STATE_MESSAGE)

    entry = OAuthStateService.consume(state)

    if entry is None:
        logger.info(
            "oauth callback rejected: invalid or expired state has_code=%s",
            has_code,
        )
        return OAuthCallbackResponse(status="invalid_state", message=_INVALID_STATE_MESSAGE)

    connector = get_connector(entry["platform"])
    result = connector.start_oauth(None)

    logger.info(
        "oauth callback: shop_id=%s platform=%s connector_status=%s",
        entry["shop_id"],
        entry["platform"],
        result.status,
    )

    return OAuthCallbackResponse(status="not_implemented", message=_NOT_IMPLEMENTED_MESSAGE)
