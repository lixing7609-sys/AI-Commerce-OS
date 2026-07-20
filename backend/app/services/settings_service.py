import logging
import os
from datetime import datetime, timezone

import httpx

from app.agents.agent_registry import AgentRegistry
from app.core.config import (
    get_deepseek_llm_config,
    get_external_task_api_key,
    get_llm_provider,
    get_ollama_llm_config,
    get_wecom_config,
)
from app.services.database_readiness_service import (
    DatabaseReadinessError,
    DatabaseReadinessService,
)
from app.services.task_consumer_service import task_consumer_service

logger = logging.getLogger("app.settings_service")

_REACHABILITY_TIMEOUT_SECONDS = 2.0

_DEFAULT_N8N_BASE_URL = "http://localhost:5678"
_DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

_BACKEND_VERSION = "0.1.0"


def _check_reachable(url: str) -> bool:
    """
    对给定地址做一次短超时的只读可达性探测。

    任何异常（连接失败、超时、DNS 解析失败等）都安全降级为
    False，不向上抛出、不阻塞调用方；不记录响应体，只关心是否
    能拿到一个 HTTP 响应。
    """

    try:
        response = httpx.get(url, timeout=_REACHABILITY_TIMEOUT_SECONDS)
        return response.status_code < 500
    except httpx.HTTPError as error:
        logger.info(
            "reachability check failed for %s: %s",
            url,
            type(error).__name__,
        )
        return False


class SettingsService:
    """
    管理后台"设置"页面的安全只读数据服务。

    integration-status 只返回布尔值（已配置/未配置、可达/不可达），
    从不返回环境变量原始值；system-info 只返回不含敏感信息的系统
    元数据。两者都不提供任何写入能力——修改 Secret/API Key/数据库
    连接串只能在服务器安全环境中进行，本服务和对应接口都不提供
    相关操作。
    """

    @staticmethod
    def get_integration_status() -> dict:
        n8n_base_url = os.environ.get("N8N_BASE_URL", _DEFAULT_N8N_BASE_URL)
        ollama_base_url = os.environ.get(
            "OLLAMA_BASE_URL", _DEFAULT_OLLAMA_BASE_URL
        )

        return {
            "external_task_api_key_configured": bool(
                get_external_task_api_key()
            ),
            "n8n_reachable": _check_reachable(f"{n8n_base_url}/healthz"),
            "wecom_configured": get_wecom_config() is not None,
            "deepseek_configured": bool(os.environ.get("DEEPSEEK_API_KEY")),
            "ollama_reachable": _check_reachable(
                f"{ollama_base_url}/api/tags"
            ),
        }

    @staticmethod
    def get_llm_status() -> dict:
        """
        LLM Gateway 配置与可达性状态（只读，只返回布尔/模型名，
        从不返回 API Key 或 Base URL 中的凭据）。

        llm_model 只是模型标识符（如 "deepseek-chat"、
        "qwen2.5:7b"），不是凭据，可以安全展示。checked_at 是本次
        请求发生时的时间戳——可达性检查是即时同步完成的，不做
        历史持久化，因此"最近一次检查时间"恒等于"当前请求时间"。
        """

        ollama_base_url = os.environ.get(
            "OLLAMA_BASE_URL", _DEFAULT_OLLAMA_BASE_URL
        )

        provider = get_llm_provider()
        deepseek_config = get_deepseek_llm_config()
        ollama_config = get_ollama_llm_config()

        deepseek_configured = deepseek_config is not None
        ollama_reachable = _check_reachable(f"{ollama_base_url}/api/tags")

        if provider == "deepseek":
            llm_model = deepseek_config.model if deepseek_config else None
            llm_ready = deepseek_configured
        elif provider == "ollama":
            llm_model = ollama_config.model if ollama_config else None
            llm_ready = ollama_reachable and ollama_config is not None
        else:
            llm_model = None
            llm_ready = False

        return {
            "llm_provider": provider,
            "deepseek_configured": deepseek_configured,
            "ollama_reachable": ollama_reachable,
            "llm_model": llm_model,
            "llm_ready": llm_ready,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def get_system_info() -> dict:
        try:
            migration_head = DatabaseReadinessService.get_current_revision()
        except DatabaseReadinessError as error:
            logger.error(
                "system info: failed to read migration revision: %s",
                type(error).__name__,
            )
            migration_head = None

        consumer_status = task_consumer_service.get_status()

        return {
            "backend_version": _BACKEND_VERSION,
            "database_migration_head": migration_head,
            "consumer_healthy": consumer_status["running"],
            "environment": os.environ.get("APP_ENV", "development"),
            "agent_count": AgentRegistry.count(),
        }
