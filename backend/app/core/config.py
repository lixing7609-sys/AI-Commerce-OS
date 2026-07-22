import os
from dataclasses import dataclass

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


def get_token_accounting_enabled() -> bool:
    """
    读取 TOKEN_ACCOUNTING_ENABLED 环境变量。

    默认关闭（False）：Token Economy Phase 1A 目前没有任何任务/
    Agent 执行路径接入记账，这个开关本身在本阶段还没有被任何
    现有行为读取——先按既定约定加上 getter，保证未来 Phase 1B/1C
    接入时行为默认不变（见 ADR-0003 Token Domain Model /
    Token Economy Phase 1 Revision 3 §"Upgrade shadow metering
    into shadow accounting"）。

    这不是 TOKEN_ENFORCEMENT_ENABLED——是否用余额阻塞任务执行是
    完全独立的、更晚期的开关，Phase 1A 不实现、不提供 getter。
    """

    return parse_bool_env(
        os.environ.get("TOKEN_ACCOUNTING_ENABLED"), default=False
    )


@dataclass(frozen=True)
class WeComConfig:
    """
    企业微信自建应用配置。所有字段只从进程环境变量读取，不硬编码
    默认值；本类实例本身不会被记录到任何日志——调用方也不应该
    把它序列化后输出。
    """

    corp_id: str
    agent_id: str
    app_secret: str
    callback_token: str
    encoding_aes_key: str


def get_wecom_config() -> WeComConfig | None:
    """
    读取企业微信自建应用的 5 项配置：
    WECOM_CORP_ID / WECOM_AGENT_ID / WECOM_APP_SECRET /
    WECOM_CALLBACK_TOKEN / WECOM_ENCODING_AES_KEY。

    5 项必须同时配置，任一缺失都视为"未配置"（返回 None），由
    调用方决定如何处理（本项目中即回调接口返回 503）——不允许
    部分配置就尝试处理真实回调，那样任何一个字段用了错误的空
    默认值都可能导致签名/解密静默出错或产生误导性行为。
    """

    corp_id = os.environ.get("WECOM_CORP_ID")
    agent_id = os.environ.get("WECOM_AGENT_ID")
    app_secret = os.environ.get("WECOM_APP_SECRET")
    callback_token = os.environ.get("WECOM_CALLBACK_TOKEN")
    encoding_aes_key = os.environ.get("WECOM_ENCODING_AES_KEY")

    if not all(
        [corp_id, agent_id, app_secret, callback_token, encoding_aes_key]
    ):
        return None

    return WeComConfig(
        corp_id=corp_id,
        agent_id=agent_id,
        app_secret=app_secret,
        callback_token=callback_token,
        encoding_aes_key=encoding_aes_key,
    )


@dataclass(frozen=True)
class WeComN8nWebhookConfig:
    """
    backend 调用 n8n"AI秘书处｜企业微信指令入口" Webhook 所需的
    地址与鉴权。该 Webhook 只允许被 backend 调用，不面向外部用户
    公开，鉴权 Header 值只从环境变量读取。
    """

    webhook_url: str
    auth_header_name: str
    auth_header_value: str


def get_wecom_n8n_webhook_config() -> WeComN8nWebhookConfig | None:
    """
    读取 WECOM_N8N_WEBHOOK_URL / WECOM_N8N_WEBHOOK_AUTH_HEADER /
    WECOM_N8N_WEBHOOK_AUTH_VALUE。三项必须同时配置。
    """

    webhook_url = os.environ.get("WECOM_N8N_WEBHOOK_URL")
    auth_header_name = os.environ.get("WECOM_N8N_WEBHOOK_AUTH_HEADER")
    auth_header_value = os.environ.get("WECOM_N8N_WEBHOOK_AUTH_VALUE")

    if not all([webhook_url, auth_header_name, auth_header_value]):
        return None

    return WeComN8nWebhookConfig(
        webhook_url=webhook_url,
        auth_header_name=auth_header_name,
        auth_header_value=auth_header_value,
    )


_DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
_DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
_DEFAULT_LLM_TIMEOUT_SECONDS = 60.0
_DEFAULT_LLM_MAX_TOKENS = 2000


def get_llm_provider() -> str | None:
    """
    读取 LLM_PROVIDER（deepseek|ollama）。未设置返回 None，由
    LLMGateway 在解析阶段安全失败（configuration_error），不提供
    默认 Provider。
    """

    return os.environ.get("LLM_PROVIDER")


@dataclass(frozen=True)
class DeepSeekLLMConfig:
    """
    DeepSeek Provider 配置。api_key 只在进程内存中传递给 httpx
    请求头，不写入日志、不写入 Task 结果。
    """

    api_key: str
    base_url: str
    model: str


def get_deepseek_llm_config() -> DeepSeekLLMConfig | None:
    """
    读取 DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL / DEEPSEEK_MODEL。
    API Key 未配置时返回 None（视为"未配置"），不允许用空字符串
    静默发起请求。
    """

    api_key = os.environ.get("DEEPSEEK_API_KEY")

    if not api_key:
        return None

    return DeepSeekLLMConfig(
        api_key=api_key,
        base_url=os.environ.get("DEEPSEEK_BASE_URL", _DEFAULT_DEEPSEEK_BASE_URL),
        model=os.environ.get("DEEPSEEK_MODEL", _DEFAULT_DEEPSEEK_MODEL),
    )


@dataclass(frozen=True)
class OllamaLLMConfig:
    base_url: str
    model: str


def get_ollama_llm_config() -> OllamaLLMConfig | None:
    """
    读取 OLLAMA_BASE_URL / OLLAMA_MODEL。OLLAMA_MODEL 未配置时
    返回 None（视为"未配置"）——本项目不提供默认模型名，模型必须
    由部署方根据实际已安装的 Ollama 模型显式指定。
    """

    model = os.environ.get("OLLAMA_MODEL")

    if not model:
        return None

    return OllamaLLMConfig(
        base_url=os.environ.get("OLLAMA_BASE_URL", _DEFAULT_OLLAMA_BASE_URL),
        model=model,
    )


def get_llm_timeout_seconds() -> float:
    raw = os.environ.get("LLM_TIMEOUT_SECONDS")

    if not raw:
        return _DEFAULT_LLM_TIMEOUT_SECONDS

    try:
        return float(raw)
    except ValueError:
        return _DEFAULT_LLM_TIMEOUT_SECONDS


def get_llm_max_tokens() -> int:
    raw = os.environ.get("LLM_MAX_TOKENS")

    if not raw:
        return _DEFAULT_LLM_MAX_TOKENS

    try:
        return int(raw)
    except ValueError:
        return _DEFAULT_LLM_MAX_TOKENS
