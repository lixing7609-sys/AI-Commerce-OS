"""
Credential Service —— Sino Connector 的唯一凭据/连接配置读取入口。

Brain Adapter、Executor Adapter、健康检查接口都通过这里获取配置，
不直接在各自模块里散落 os.environ.get() 调用；前端永远不会看到、
也不会经手任何这里读取到的密钥原文。
"""

import logging
import os
import shutil
import subprocess

from app.core.config import (
    ClaudeCodeExecutorConfig,
    OpenAIBrainConfig,
    get_claude_code_executor_config,
    get_openai_brain_config,
)

logger = logging.getLogger("app.connector.credentials")

_AUTH_STATUS_TIMEOUT_SECONDS = 8


class CredentialService:
    @staticmethod
    def get_brain_config() -> OpenAIBrainConfig | None:
        return get_openai_brain_config()

    @staticmethod
    def get_executor_config() -> ClaudeCodeExecutorConfig:
        return get_claude_code_executor_config()

    @staticmethod
    def check_brain_health() -> dict:
        """
        只读检测，不发起真实模型请求（避免每次健康检查都消耗
        Token）。只判断 OPENAI_API_KEY 是否已配置。
        """

        config = get_openai_brain_config()

        if config is None:
            return {
                "configured": False,
                "ready": False,
                "model": None,
                "issue": "missing_api_key",
                "fix_hint": "在 backend/.env（或部署环境变量）中设置 OPENAI_API_KEY 后重启 backend 进程",
            }

        return {
            "configured": True,
            "ready": True,
            "model": config.model,
            "issue": None,
            "fix_hint": None,
        }

    @staticmethod
    def check_executor_health() -> dict:
        """
        只读检测 Claude Code CLI 是否安装、是否已登录，不触发任何
        真实的 -p 执行、不修改任何文件。
        """

        config = get_claude_code_executor_config()
        cli_path = shutil.which(config.cli_path) or (
            config.cli_path if os.path.isabs(config.cli_path) and os.access(config.cli_path, os.X_OK) else None
        )

        if not cli_path:
            return {
                "configured": False,
                "ready": False,
                "cli_installed": False,
                "authenticated": None,
                "workdir": config.workdir,
                "issue": "cli_not_found",
                "fix_hint": (
                    f"未找到 Claude Code CLI（当前配置路径：{config.cli_path}）。"
                    "请确认本机已安装 Claude Code CLI 并在 PATH 中，"
                    "或设置 CLAUDE_CODE_CLI_PATH 指向可执行文件的绝对路径。"
                ),
            }

        try:
            result = subprocess.run(
                [cli_path, "auth", "status"],
                capture_output=True,
                text=True,
                timeout=_AUTH_STATUS_TIMEOUT_SECONDS,
                cwd=config.workdir,
            )
            output = f"{result.stdout}\n{result.stderr}".lower()
            authenticated = result.returncode == 0 and (
                "not logged in" not in output and "not authenticated" not in output
            )
        except (subprocess.TimeoutExpired, OSError) as error:
            logger.error("claude auth status check failed: %s", type(error).__name__)
            return {
                "configured": True,
                "ready": False,
                "cli_installed": True,
                "authenticated": None,
                "workdir": config.workdir,
                "issue": "auth_check_failed",
                "fix_hint": "无法执行 `claude auth status`，请在终端手动运行确认 CLI 是否可用",
            }

        if not authenticated:
            return {
                "configured": True,
                "ready": False,
                "cli_installed": True,
                "authenticated": False,
                "workdir": config.workdir,
                "issue": "not_authenticated",
                "fix_hint": "请在终端运行 `claude auth login` 完成登录后重试",
            }

        return {
            "configured": True,
            "ready": True,
            "cli_installed": True,
            "authenticated": True,
            "workdir": config.workdir,
            "issue": None,
            "fix_hint": None,
        }
