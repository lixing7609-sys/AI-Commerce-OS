import os

_TRUTHY_VALUES = {"true", "1", "yes", "on"}
_FALSY_VALUES = {"false", "0", "no", "off"}


def get_external_task_api_key() -> str | None:
    """
    读取外部任务接入网关（POST /integrations/tasks/submit）使用的
    API Key。

    只从进程环境变量 EXTERNAL_TASK_API_KEY 读取，不硬编码、不提供
    默认值；未配置（None 或空字符串）时统一视为"未配置"，由调用方
    （verify_external_task_api_key）决定如何处理。
    """

    return os.environ.get("EXTERNAL_TASK_API_KEY")


def parse_bool_env(raw_value: str | None, *, default: bool) -> bool:
    """
    把环境变量原始字符串解析为布尔值的通用函数。

    - 未设置（None）：返回 default。
    - 大小写不敏感，自动去除首尾空白。
    - 支持 true/1/yes/on（真）与 false/0/no/off（假）。
    - 无法识别的值一律安全降级为 default，不会因为拼写错误而
      意外打开某个默认应关闭的开关。本函数不记录、不回显传入的
      原始值。
    """

    if raw_value is None:
        return default

    normalized = raw_value.strip().lower()

    if normalized in _TRUTHY_VALUES:
        return True

    if normalized in _FALSY_VALUES:
        return False

    return default


def get_sqlalchemy_echo() -> bool:
    """
    读取 SQLALCHEMY_ECHO 环境变量，控制 SQLAlchemy engine 是否
    输出完整 SQL 语句和绑定参数（可能包含任务 payload、context、
    task 文本等业务数据）。

    默认关闭（False）；只有显式配置为 true/1/yes/on 时才开启，
    非法值安全降级为 False，绝不默认开启。
    """

    return parse_bool_env(
        os.environ.get("SQLALCHEMY_ECHO"), default=False
    )
