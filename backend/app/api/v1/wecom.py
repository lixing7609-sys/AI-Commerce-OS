import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.core.config import get_wecom_config, get_wecom_n8n_webhook_config
from app.core.edition import Edition, require_edition
from app.services.wecom_callback_service import (
    WeComCallbackError,
    handle_incoming_message,
    verify_url_challenge,
)

logger = logging.getLogger("app.wecom_api")

router = APIRouter(
    prefix="/integrations/wecom",
    tags=["Integrations"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER, Edition.OPERATOR))],
)

_NOT_CONFIGURED_DETAIL = "企业微信回调当前不可用，请联系管理员"


@router.get("/callback")
def verify_wecom_callback_url(
    msg_signature: str = Query(...),
    timestamp: str = Query(...),
    nonce: str = Query(...),
    echostr: str = Query(...),
):
    """
    企业微信后台配置回调 URL 时的一次性 GET 校验。

    验签通过后解密 echostr 并以纯文本原样返回；企业微信服务端
    据此确认本服务持有正确的 Token 和 EncodingAESKey。签名错误
    返回 401，服务端未配置企业微信参数返回 503。
    """

    config = get_wecom_config()

    if config is None:
        logger.error("wecom callback requested but WeCom config is not set")
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED_DETAIL)

    try:
        decrypted_echostr = verify_url_challenge(
            config=config,
            msg_signature=msg_signature,
            timestamp=timestamp,
            nonce=nonce,
            echostr=echostr,
        )
    except WeComCallbackError as error:
        logger.warning(
            "wecom url verification failed: reason=%s", error.reason
        )
        raise HTTPException(status_code=401, detail="签名或参数校验失败") from error

    return Response(content=decrypted_echostr, media_type="text/plain")


@router.post("/callback")
async def receive_wecom_callback(
    request: Request,
    msg_signature: str = Query(...),
    timestamp: str = Query(...),
    nonce: str = Query(...),
):
    """
    企业微信消息回调：验签、AES 解密、提取消息、固化幂等
    request_id、同步调用 n8n"AI秘书处｜企业微信指令入口"
    Webhook、把返回的回复文本加密后同步返回给企业微信。

    只做验签/解密/转发/加密，不解析指令类型、不维护 Agent
    名册、不直接调用任务提交/查询服务——具体指令路由完全交给
    n8n workflow。签名或解密失败返回 401，安全文案不暴露具体
    原因；服务端未配置企业微信参数或未配置 n8n Webhook 地址
    返回 503。
    """

    config = get_wecom_config()

    if config is None:
        logger.error("wecom callback requested but WeCom config is not set")
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED_DETAIL)

    n8n_config = get_wecom_n8n_webhook_config()

    if n8n_config is None:
        logger.error(
            "wecom callback requested but n8n webhook config is not set"
        )
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED_DETAIL)

    raw_body_bytes = await request.body()

    try:
        raw_body = raw_body_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        logger.warning("wecom callback body is not valid utf-8")
        raise HTTPException(status_code=400, detail="请求体格式不合法") from error

    try:
        reply_xml = handle_incoming_message(
            config=config,
            n8n_config=n8n_config,
            msg_signature=msg_signature,
            timestamp=timestamp,
            nonce=nonce,
            raw_body=raw_body,
        )
    except WeComCallbackError as error:
        logger.warning(
            "wecom callback processing failed: reason=%s", error.reason
        )
        raise HTTPException(status_code=401, detail="签名或消息校验失败") from error

    return Response(content=reply_xml, media_type="application/xml")
