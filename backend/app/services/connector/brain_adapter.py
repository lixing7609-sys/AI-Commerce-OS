"""
Brain Adapter —— 唯一知道"当前 Brain 是 OpenAI GPT"这件事的模块。

Sino Orchestrator 只依赖 BrainAdapter.complete()，不感知具体供应商；
未来要换成别的模型供应商，只需要替换这里的实现。
"""

import logging

from app.llm.exceptions import LLMGatewayError
from app.llm.models import LLMRequest, LLMResponse
from app.llm.openai_provider import OpenAIProvider
from app.services.connector.credential_service import CredentialService

logger = logging.getLogger("app.connector.brain_adapter")


class BrainNotConfiguredError(Exception):
    pass


class BrainAdapter:
    @staticmethod
    def complete(system_prompt: str, user_prompt: str, *, max_tokens: int = 1200) -> LLMResponse:
        config = CredentialService.get_brain_config()

        if config is None:
            raise BrainNotConfiguredError("OPENAI_API_KEY 未配置")

        provider = OpenAIProvider(
            api_key=config.api_key,
            base_url=config.base_url,
            model=config.model,
            timeout_seconds=60.0,
        )

        request = LLMRequest(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.4,
            max_tokens=max_tokens,
            response_format="json",
        )

        try:
            return provider.generate(request)
        except LLMGatewayError:
            raise
