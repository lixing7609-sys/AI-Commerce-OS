"""
任务 result/error 的对外安全展示格式化。

供外部安全查询接口（GET /api/v1/integrations/tasks/{task_id}）和
企业微信查询回复共用——在后端一次性完成脱敏和长度控制，避免把
未脱敏的原始 result/error 传给 n8n 或企业微信之后再过滤（那样任何
一环遗漏都会导致敏感信息泄露一次）。
"""

from typing import Any

_MAX_RESULT_LENGTH = 2000
_MAX_ERROR_LENGTH = 2000
_TRUNCATED_SUFFIX = "\n\n（结果较长，已截断，请在 Task Center 查看完整内容。）"

_EMPTY_RESULT_TEXT = "暂无执行结果"
_EMPTY_ERROR_TEXT = "暂无错误信息"

_SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "token",
    "access_token",
    "accesstoken",
    "authorization",
    "password",
    "secret",
    "database_url",
    "db_url",
}


def _mask_sensitive_values(value: Any) -> Any:
    if isinstance(value, list):
        return [_mask_sensitive_values(item) for item in value]

    if isinstance(value, dict):
        masked = {}
        for key, val in value.items():
            if isinstance(key, str) and key.lower() in _SENSITIVE_KEYS:
                masked[key] = "***"
            else:
                masked[key] = _mask_sensitive_values(val)
        return masked

    return value


def _truncate(text: str, max_length: int) -> str:
    if len(text) <= max_length:
        return text

    return text[:max_length] + _TRUNCATED_SUFFIX


def format_safe_result(result: dict[str, Any] | None) -> str:
    """
    把任务的 result 字段格式化为安全的纯文本摘要：递归屏蔽敏感
    字段、超长截断、不使用原始 HTML、不包含 payload/context（这些
    字段从不会出现在 result 里，因为调用方只应该传入
    TaskDB.result，而不是整条任务记录）。
    """

    if not result:
        return _EMPTY_RESULT_TEXT

    masked = _mask_sensitive_values(result)

    import json

    try:
        text = json.dumps(masked, ensure_ascii=False, indent=2)
    except (TypeError, ValueError):
        text = str(masked)

    return _truncate(text, _MAX_RESULT_LENGTH)


def format_safe_error(error: str | None) -> str:
    """
    把任务的 error 字段格式化为安全的纯文本摘要：超长截断，不
    返回原始 traceback（TaskDB.error 本身就应该只存放安全的错误
    原因文本，而不是异常堆栈——这是既有 TaskExecutionService/
    TaskRecoveryActionService 写入 error 时就已经遵守的约定，这里
    只做长度和展示层面的兜底，不改变这个假设）。
    """

    if not error:
        return _EMPTY_ERROR_TEXT

    return _truncate(str(error), _MAX_ERROR_LENGTH)
