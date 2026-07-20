from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class LLMRequest:
    """
    统一大模型请求。Provider 实现只依赖这些字段，不感知调用方
    （Agent）的业务语义。
    """

    system_prompt: str
    user_prompt: str
    temperature: float = 0.3
    max_tokens: int = 2000
    response_format: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMUsage:
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None


@dataclass(frozen=True)
class LLMResponse:
    """
    统一大模型响应。content 是模型输出的原始文本（由调用方自行
    解析结构化内容）；不携带任何 Provider 凭据或请求头信息。
    """

    content: str
    provider: str
    model: str
    usage: LLMUsage | None
    latency_ms: float
