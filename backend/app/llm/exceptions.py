"""
LLM Gateway 安全失败语义。

每个异常子类只携带一个固定的安全分类标签（error_type），绝不
携带 Provider 原始响应体、请求头、URL query 或 traceback——
调用方（Agent）捕获后允许直接把 str(error) 写入 Task.error /
self.last_error，不需要额外脱敏，因为异常消息本身就是安全的。
"""

SAFE_LLM_ERROR_TYPES = frozenset(
    {
        "configuration_error",
        "authentication_failed",
        "rate_limited",
        "provider_unavailable",
        "network_error",
        "timeout",
        "invalid_response",
    }
)


class LLMGatewayError(Exception):
    def __init__(self, error_type: str):
        self.error_type = error_type
        super().__init__(error_type)


class ConfigurationError(LLMGatewayError):
    """Provider 未配置或配置不完整（缺少 Key / 模型名等）。"""

    def __init__(self):
        super().__init__("configuration_error")


class AuthenticationError(LLMGatewayError):
    """Provider 返回 401/403。"""

    def __init__(self):
        super().__init__("authentication_failed")


class RateLimitedError(LLMGatewayError):
    """Provider 返回 429。"""

    def __init__(self):
        super().__init__("rate_limited")


class ProviderUnavailableError(LLMGatewayError):
    """Provider 返回 5xx，或本地 Provider（如 Ollama）无法连接。"""

    def __init__(self):
        super().__init__("provider_unavailable")


class NetworkError(LLMGatewayError):
    """其它网络传输层错误（非超时、非连接失败）。"""

    def __init__(self):
        super().__init__("network_error")


class LLMTimeoutError(LLMGatewayError):
    """请求超时。"""

    def __init__(self):
        super().__init__("timeout")


class InvalidResponseError(LLMGatewayError):
    """Provider 返回非预期结构（非 200 且未归类，或字段缺失/无法解析）。"""

    def __init__(self):
        super().__init__("invalid_response")
