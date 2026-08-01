"""
Sino Orchestrator —— 把 Brain Adapter 的原始输出解析成前端可以直接
落地的统一结果。GPT 返回的内容永远不会被直接展示或执行：这里先
校验 JSON 结构，解析失败时安全降级为"普通回复 + 可恢复错误"，
不让整个对话崩溃。
"""

import json
import logging
import re

from app.llm.exceptions import LLMGatewayError
from app.services.connector.brain_adapter import BrainAdapter, BrainNotConfiguredError
from app.services.connector.connector_run_service import ConnectorRunService
from app.services.connector.context_builder import SYSTEM_PROMPT, build_brain_user_prompt

logger = logging.getLogger("app.connector.orchestrator")

_STAGE_WHITELIST = {"探索", "功能论证", "多模型讨论", "待决策"}

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def _extract_json(raw: str) -> dict:
    text = raw.strip()
    match = _FENCE_RE.search(text)
    if match:
        text = match.group(1).strip()
    return json.loads(text)


def _coerce_str_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


class SinoOrchestrator:
    """
    面向 API 层的单一入口：process_message() 完成
    "组装上下文 -> 调用 Brain -> 解析结果 -> 记录 ConnectorRun"
    整个流程。
    """

    @staticmethod
    def process_message(
        *,
        conversation_id: str,
        message: str,
        sino_state: dict,
        recent_messages: list[dict],
        knowledge: list[str] | None = None,
    ) -> dict:
        user_prompt = build_brain_user_prompt(
            message=message,
            sino_state=sino_state,
            recent_messages=recent_messages,
            knowledge=knowledge,
        )

        run = ConnectorRunService.start_run(
            kind="brain",
            conversation_id=conversation_id,
            input_summary=f"user_message={message[:500]}",
            detail={"stage_before": sino_state.get("stage")},
        )

        try:
            response = BrainAdapter.complete(SYSTEM_PROMPT, user_prompt)
        except BrainNotConfiguredError as error:
            ConnectorRunService.complete_run(
                run.id, status="failed", error="configuration_error"
            )
            return {
                "mock": True,
                "connector_run_id": run.id,
                "reply": None,
                "error_type": "configuration_error",
                "error_message": str(error),
            }
        except LLMGatewayError as error:
            ConnectorRunService.complete_run(
                run.id, status="failed", error=error.error_type
            )
            return {
                "mock": True,
                "connector_run_id": run.id,
                "reply": None,
                "error_type": error.error_type,
                "error_message": "GPT Brain 调用失败，已安全降级",
            }

        try:
            parsed = _extract_json(response.content)
        except (json.JSONDecodeError, ValueError) as error:
            logger.error("brain response parse failed: %s", type(error).__name__)
            ConnectorRunService.complete_run(
                run.id,
                status="completed",
                output_summary=response.content[:2000],
                detail={"parse_error": True},
            )
            # 解析失败时保留普通回复，不让整个对话崩溃：把模型原始
            # 输出原样作为回复展示，同时标注可恢复错误。
            return {
                "mock": False,
                "connector_run_id": run.id,
                "reply": response.content.strip() or "（Sino 暂时没有生成有效回复，可以换个说法再试一次）",
                "topic_update": None,
                "stage_suggestion": None,
                "consensus_add": [],
                "pending_add": [],
                "rejected_add": [],
                "constraint_add": [],
                "suggest_invite_other_models": False,
                "ready_for_decision": False,
                "parse_error": True,
                "recoverable": True,
            }

        stage_suggestion = parsed.get("stage_suggestion")
        if stage_suggestion not in _STAGE_WHITELIST:
            stage_suggestion = None

        result = {
            "mock": False,
            "connector_run_id": run.id,
            "reply": str(parsed.get("reply") or "").strip() or "已记录，我会持续跟踪这个问题。",
            "topic_update": (str(parsed["topic_update"]).strip() if parsed.get("topic_update") else None),
            "stage_suggestion": stage_suggestion,
            "consensus_add": _coerce_str_list(parsed.get("consensus_add")),
            "pending_add": _coerce_str_list(parsed.get("pending_add")),
            "rejected_add": _coerce_str_list(parsed.get("rejected_add")),
            "constraint_add": _coerce_str_list(parsed.get("constraint_add")),
            "suggest_invite_other_models": bool(parsed.get("suggest_invite_other_models")),
            "ready_for_decision": bool(parsed.get("ready_for_decision")),
            "parse_error": False,
            "recoverable": True,
        }

        ConnectorRunService.complete_run(
            run.id,
            status="completed",
            output_summary=result["reply"],
            detail={
                "usage_total_tokens": response.usage.total_tokens if response.usage else None,
                "latency_ms": response.latency_ms,
                "model": response.model,
            },
        )

        return result
