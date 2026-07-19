"""
企业微信自建应用回调编排。

流程：GET 用于企业微信后台配置时的一次性 URL 校验；POST 用于
实际消息推送——验签 → AES 解密 → 解析内层消息 → 固化幂等
request_id → 同步调用 n8n"AI秘书处｜企业微信指令入口" Webhook →
取回回复文本 → 构造并加密回复消息 → 返回给企业微信。

本服务只做编排、验签、解密、加密、转发，不解析指令类型（那是
n8n workflow 的职责），不维护 Agent 名册，不直接调用
TaskSubmissionService/TaskService——保持"n8n 负责指令路由，
backend 只负责密码学和转发"的职责边界。
"""

import hashlib
import logging

import httpx

from app.core.config import WeComConfig, WeComN8nWebhookConfig
from app.services import wecom_crypto
from app.services.wecom_message_codec import (
    WeComMessageFormatError,
    build_encrypted_reply_envelope,
    build_plain_text_reply_message,
    parse_inner_message,
    parse_outer_envelope,
)

logger = logging.getLogger("app.wecom_callback")

N8N_CALL_TIMEOUT_SECONDS = 8.0

_FALLBACK_REPLY_TEXT = "系统繁忙，请稍后重试。"


class WeComCallbackError(Exception):
    """
    验签失败、解密失败或消息结构不合法时抛出，携带一个安全的
    公开原因描述（不含密钥/密文/明文内容），供 API 层返回
    401/400。
    """

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


def verify_url_challenge(
    *,
    config: WeComConfig,
    msg_signature: str,
    timestamp: str,
    nonce: str,
    echostr: str,
) -> str:
    """
    企业微信后台配置回调 URL 时的一次性 GET 校验：验签通过后解密
    echostr 并原样返回，用于证明本服务持有正确的 Token 和
    EncodingAESKey。
    """

    if not wecom_crypto.verify_signature(
        token=config.callback_token,
        timestamp=timestamp,
        nonce=nonce,
        encrypt_or_echostr=echostr,
        msg_signature=msg_signature,
    ):
        raise WeComCallbackError("签名校验失败")

    try:
        return wecom_crypto.decrypt(
            encoding_aes_key=config.encoding_aes_key,
            corp_id=config.corp_id,
            encrypted_base64=echostr,
        )
    except wecom_crypto.WeComCryptoError as error:
        raise WeComCallbackError("echostr 解密失败") from error


def build_request_id(corp_id: str, msg_id: str) -> str:
    """
    幂等 request_id：wecom:<corp_id 摘要>:<msg_id>。

    - 不使用发送时间，不使用随机 UUID——同一条企业微信消息（同一
      msg_id）无论投递几次，产生完全相同的 request_id。
    - corp_id 不完整写入，只取 SHA-256 前 12 位十六进制摘要，
      避免在任务记录/日志中完整暴露企业 CorpID。
    """

    corp_digest = hashlib.sha256(corp_id.encode("utf-8")).hexdigest()[:12]
    safe_msg_id = msg_id.strip()
    return f"wecom:{corp_digest}:{safe_msg_id}"


def _call_n8n_command_webhook(
    *,
    n8n_config: WeComN8nWebhookConfig,
    request_id: str,
    sender: str,
    content: str,
    msg_type: str,
) -> str:
    """
    同步调用 n8n"AI秘书处｜企业微信指令入口" Webhook，返回
    reply_text。网络失败或 n8n 返回非预期结构时，安全降级为固定
    提示文案，不让原始异常信息进入企业微信回复。
    """

    try:
        response = httpx.post(
            n8n_config.webhook_url,
            headers={
                n8n_config.auth_header_name: n8n_config.auth_header_value,
                "Content-Type": "application/json",
            },
            json={
                "request_id": request_id,
                "sender": sender,
                "content": content,
                "msg_type": msg_type,
            },
            timeout=N8N_CALL_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as error:
        logger.error(
            "wecom command webhook call failed: error_type=%s",
            type(error).__name__,
        )
        return _FALLBACK_REPLY_TEXT

    if response.status_code >= 400:
        logger.error(
            "wecom command webhook returned error status: status=%s",
            response.status_code,
        )
        return _FALLBACK_REPLY_TEXT

    try:
        body = response.json()
    except ValueError:
        logger.error("wecom command webhook returned non-JSON body")
        return _FALLBACK_REPLY_TEXT

    reply_text = body.get("reply_text")

    if not isinstance(reply_text, str) or not reply_text.strip():
        logger.error("wecom command webhook response missing reply_text")
        return _FALLBACK_REPLY_TEXT

    return reply_text


def handle_incoming_message(
    *,
    config: WeComConfig,
    n8n_config: WeComN8nWebhookConfig,
    msg_signature: str,
    timestamp: str,
    nonce: str,
    raw_body: str,
) -> str:
    """
    处理一次企业微信 POST 回调：验签 → 解密 → 解析 → 转发 n8n →
    构造加密回复。返回值是完整的、可以直接作为 HTTP 响应体的
    加密回复 XML 字符串。
    """

    try:
        envelope = parse_outer_envelope(raw_body)
    except WeComMessageFormatError as error:
        raise WeComCallbackError("回调请求体格式不合法") from error

    if not wecom_crypto.verify_signature(
        token=config.callback_token,
        timestamp=timestamp,
        nonce=nonce,
        encrypt_or_echostr=envelope.encrypt,
        msg_signature=msg_signature,
    ):
        raise WeComCallbackError("签名校验失败")

    try:
        inner_plain = wecom_crypto.decrypt(
            encoding_aes_key=config.encoding_aes_key,
            corp_id=config.corp_id,
            encrypted_base64=envelope.encrypt,
        )
    except wecom_crypto.WeComCryptoError as error:
        raise WeComCallbackError("消息解密失败") from error

    try:
        inner_message = parse_inner_message(inner_plain)
    except WeComMessageFormatError as error:
        raise WeComCallbackError("解密后消息格式不合法") from error

    if not inner_message.msg_id:
        raise WeComCallbackError("消息缺少 MsgId，无法保证幂等")

    request_id = build_request_id(config.corp_id, inner_message.msg_id)

    reply_text = _call_n8n_command_webhook(
        n8n_config=n8n_config,
        request_id=request_id,
        sender=inner_message.from_user_name,
        content=inner_message.content,
        msg_type=inner_message.msg_type,
    )

    reply_plain_xml = build_plain_text_reply_message(
        to_user_name=inner_message.from_user_name,
        from_user_name=inner_message.to_user_name,
        content=reply_text,
    )

    reply_encrypt = wecom_crypto.encrypt(
        encoding_aes_key=config.encoding_aes_key,
        corp_id=config.corp_id,
        plain_text=reply_plain_xml,
    )

    reply_timestamp = timestamp
    reply_nonce = nonce
    reply_signature = wecom_crypto.compute_signature(
        config.callback_token, reply_timestamp, reply_nonce, reply_encrypt
    )

    return build_encrypted_reply_envelope(
        encrypt=reply_encrypt,
        msg_signature=reply_signature,
        timestamp=reply_timestamp,
        nonce=reply_nonce,
    )
