"""
企业微信回调 XML 消息的解析与构造。

只做通用的 XML 结构读写，不解析业务指令（那是 n8n
"AI秘书处｜企业微信指令入口" 工作流的职责），也不知道
Agent 名册或任务状态——保持"后端只负责验签/解密/转发"的
职责边界。

使用标准库 xml.etree.ElementTree：企业微信回调的 XML 结构固定且
简单（无 DTD、无外部实体），ElementTree 默认不解析外部实体，
足够安全，不需要额外依赖。
"""

import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass


class WeComMessageFormatError(Exception):
    """
    XML 结构不合法或缺少必需字段时抛出。异常信息只描述缺失的
    字段名，不包含原始 XML 内容。
    """


@dataclass(frozen=True)
class OuterEnvelope:
    """
    POST 回调请求体的外层 XML（未解密前）。
    """

    to_user_name: str
    agent_id: str | None
    encrypt: str


@dataclass(frozen=True)
class InnerMessage:
    """
    解密后的内层明文消息。
    """

    to_user_name: str
    from_user_name: str
    create_time: str
    msg_type: str
    content: str
    msg_id: str


def _find_text(root: ET.Element, tag: str) -> str | None:
    node = root.find(tag)
    if node is None or node.text is None:
        return None
    return node.text.strip()


def parse_outer_envelope(xml_body: str) -> OuterEnvelope:
    try:
        root = ET.fromstring(xml_body)
    except ET.ParseError as error:
        raise WeComMessageFormatError("外层 XML 无法解析") from error

    to_user_name = _find_text(root, "ToUserName") or ""
    agent_id = _find_text(root, "AgentID")
    encrypt = _find_text(root, "Encrypt")

    if not encrypt:
        raise WeComMessageFormatError("外层 XML 缺少 Encrypt 字段")

    return OuterEnvelope(
        to_user_name=to_user_name, agent_id=agent_id, encrypt=encrypt
    )


def parse_inner_message(xml_body: str) -> InnerMessage:
    try:
        root = ET.fromstring(xml_body)
    except ET.ParseError as error:
        raise WeComMessageFormatError("解密后的内层 XML 无法解析") from error

    to_user_name = _find_text(root, "ToUserName") or ""
    from_user_name = _find_text(root, "FromUserName") or ""
    create_time = _find_text(root, "CreateTime") or ""
    msg_type = _find_text(root, "MsgType") or ""
    content = _find_text(root, "Content") or ""
    msg_id = _find_text(root, "MsgId") or ""

    if not from_user_name:
        raise WeComMessageFormatError("内层 XML 缺少 FromUserName 字段")

    if not msg_type:
        raise WeComMessageFormatError("内层 XML 缺少 MsgType 字段")

    return InnerMessage(
        to_user_name=to_user_name,
        from_user_name=from_user_name,
        create_time=create_time,
        msg_type=msg_type,
        content=content,
        msg_id=msg_id,
    )


def _cdata_escape(value: str) -> str:
    """
    构造 XML 时手写 CDATA 包裹（而不是用 ElementTree 生成，因为
    ElementTree 不支持原生输出 CDATA 段）。对内容本身不做转义——
    CDATA 段本身就是为了不需要转义 XML 特殊字符，只需要保证内容
    不包含字面量的 "]]>" 序列。
    """

    safe_value = value.replace("]]>", "]]]]><![CDATA[>")
    return f"<![CDATA[{safe_value}]]>"


def build_plain_text_reply_message(
    *, to_user_name: str, from_user_name: str, content: str
) -> str:
    """
    构造未加密的内层回复消息 XML（text 类型）。
    to_user_name/from_user_name 相对于回复方向而言：这里的
    to_user_name 是原消息的 FromUserName（即企业微信用户），
    from_user_name 是应用自己（原消息的 ToUserName）。
    """

    create_time = str(int(time.time()))

    return (
        "<xml>"
        f"<ToUserName>{_cdata_escape(to_user_name)}</ToUserName>"
        f"<FromUserName>{_cdata_escape(from_user_name)}</FromUserName>"
        f"<CreateTime>{create_time}</CreateTime>"
        f"<MsgType>{_cdata_escape('text')}</MsgType>"
        f"<Content>{_cdata_escape(content)}</Content>"
        "</xml>"
    )


def build_encrypted_reply_envelope(
    *, encrypt: str, msg_signature: str, timestamp: str, nonce: str
) -> str:
    """
    构造返回给企业微信服务器的外层加密 XML。
    """

    return (
        "<xml>"
        f"<Encrypt>{_cdata_escape(encrypt)}</Encrypt>"
        f"<MsgSignature>{_cdata_escape(msg_signature)}</MsgSignature>"
        f"<TimeStamp>{timestamp}</TimeStamp>"
        f"<Nonce>{_cdata_escape(nonce)}</Nonce>"
        "</xml>"
    )
