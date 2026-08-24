from __future__ import annotations

import os
from uuid import uuid4
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
import httpx
from sqlalchemy import func, select

from app.core.council.model import CouncilModelRunDB
from app.core.model_center.model import AICapabilityConfigDB, ApplicationCapabilityAssignmentDB, ModelProviderConfigDB, ModelRegistryDB, ModelRoleAssignmentDB
from app.database.db import SessionLocal


PROVIDER_CATALOG = {
    "openai": {"display_name": "OpenAI Official", "default_base_url": "https://api.openai.com/v1", "protocol": "openai"},
    "anthropic": {"display_name": "Anthropic Official", "default_base_url": "https://api.anthropic.com/v1", "protocol": "anthropic"},
    "deepseek": {"display_name": "DeepSeek Official", "default_base_url": "https://api.deepseek.com", "protocol": "openai"},
    "ofoxai": {"display_name": "OfoxAI", "default_base_url": "", "protocol": "openai"},
    "openrouter": {"display_name": "OpenRouter", "default_base_url": "https://openrouter.ai/api/v1", "protocol": "openai"},
    "siliconflow": {"display_name": "SiliconFlow", "default_base_url": "https://api.siliconflow.cn/v1", "protocol": "openai"},
    "google_ai_studio": {"display_name": "Google AI Studio", "default_base_url": "https://generativelanguage.googleapis.com/v1beta", "protocol": "gemini"},
    "azure_openai": {"display_name": "Azure OpenAI", "default_base_url": "", "protocol": "openai"},
    "gemini": {"display_name": "Gemini", "default_base_url": "https://generativelanguage.googleapis.com/v1beta", "protocol": "gemini"},
    "qwen": {"display_name": "Qwen", "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1", "protocol": "openai"},
    "kimi": {"display_name": "Kimi", "default_base_url": "https://api.moonshot.cn/v1", "protocol": "openai"},
    "doubao": {"display_name": "豆包", "default_base_url": "https://ark.cn-beijing.volces.com/api/v3", "protocol": "openai"},
    "local": {"display_name": "本地模型", "default_base_url": "http://127.0.0.1:11434/v1", "protocol": "openai"},
    "openai_compatible": {"display_name": "OpenAI Compatible", "default_base_url": "", "protocol": "openai"},
    "custom": {"display_name": "自定义 Provider", "default_base_url": "", "protocol": "openai"},
}
PROVIDERS = {
    "deepseek": {**PROVIDER_CATALOG["deepseek"], "provider_type": "deepseek"},
    "gpt": {**PROVIDER_CATALOG["openai"], "display_name": "GPT", "provider_type": "openai"},
    "claude": {**PROVIDER_CATALOG["anthropic"], "display_name": "Claude", "provider_type": "anthropic"},
}
CAPABILITIES = ("sino_conversation", "deep_thinking", "system_builder", "goal_reasoning", "project_analysis", "solution_review", "multi_model_discussion", "code_execution")
CAPABILITY_LABELS = {"sino_conversation": "Sino 对话", "deep_thinking": "深度思考", "system_builder": "系统构建", "goal_reasoning": "目标推理", "project_analysis": "项目分析", "solution_review": "方案评审", "multi_model_discussion": "多模型讨论", "code_execution": "代码执行"}
LEGACY_ROLE_ALIASES = {"reasoner": "sino_conversation", "architect": "system_builder", "reviewer": "project_analysis", "executor": "code_execution"}
APPLICATIONS = {"founder_ai": "Founder AI", "operator_ai": "Operator AI", "studio_ai": "Studio AI", "industrial_ai": "Industrial AI", "quant_ai": "Quant AI"}
AGENT_REGISTRY = {
    "sino_founder_ai": {
        "application_system_id": "founder_ai",
        "display_name": "Sino AI 秘书",
        "description": "Founder AI 当前唯一的核心 AI Agent，负责讨论、项目理解、决策沉淀、知识整理、系统构建与执行协同。",
        "status": "running",
        "agent_type": "ai_secretary",
        "default_model_refs": ("sino_conversation", "deep_thinking", "goal_reasoning", "project_analysis", "system_builder", "solution_review", "multi_model_discussion", "code_execution"),
        "work_refs": (),
        "skill_refs": ("conversation", "reasoning", "project_intelligence", "decision", "knowledge", "living_prompt", "goal", "system_builder", "execution_coordination", "memory", "multi_model_discussion"),
        "workflow_refs": (),
        "tool_refs": (),
        "execution_engine_ref": "codex",
        "created_at": None,
        "updated_at": None,
    },
}
SKILL_REGISTRY = {
    "conversation": {"display_name": "对话", "description": "与 Founder 持续讨论并维护上下文。", "capability_refs": ("sino_conversation",), "model_assignment_capability": "sino_conversation", "memory_refs": ("conversation_memory",)},
    "reasoning": {"display_name": "推理", "description": "用于目标理解、约束分析、方案判断和执行中的局部重新推理。", "capability_refs": ("deep_thinking", "goal_reasoning"), "model_assignment_capability": "deep_thinking", "memory_refs": ()},
    "project_intelligence": {"display_name": "项目智能", "description": "恢复项目上下文、定位、知识、决策和待确认问题。", "capability_refs": ("project_analysis",), "model_assignment_capability": "project_analysis", "memory_refs": ("project_context",)},
    "decision": {"display_name": "决策", "description": "识别、整理和沉淀 Founder 正式确认的决策。", "capability_refs": ("solution_review",), "model_assignment_capability": "solution_review", "memory_refs": ("decision",)},
    "knowledge": {"display_name": "知识", "description": "提炼并维护项目长期有效知识。", "capability_refs": ("project_analysis",), "model_assignment_capability": "project_analysis", "memory_refs": ("knowledge",)},
    "living_prompt": {"display_name": "动态提示词", "description": "根据长期讨论和决策持续维护 Agent 的动态 Prompt。", "capability_refs": ("project_analysis",), "model_assignment_capability": "project_analysis", "memory_refs": ("living_prompt",)},
    "goal": {"display_name": "目标", "description": "识别正式目标并连接后续计划与执行。", "capability_refs": ("goal_reasoning",), "model_assignment_capability": "deep_thinking", "memory_refs": ()},
    "system_builder": {"display_name": "系统构建", "description": "辅助设计和修改 Application System（应用系统）。", "capability_refs": ("system_builder",), "model_assignment_capability": "system_builder", "memory_refs": ()},
    "execution_coordination": {"display_name": "执行协同", "description": "连接已确认设计、Execution Center、Execution Supplement 与执行状态。", "capability_refs": ("code_execution",), "model_assignment_capability": "code_execution", "memory_refs": ("historical_state",)},
    "memory": {"display_name": "记忆", "description": "维护长期上下文和恢复能力。", "capability_refs": ("sino_conversation", "project_analysis"), "model_assignment_capability": "sino_conversation", "memory_refs": ("conversation_memory", "project_context", "knowledge", "decision", "living_prompt")},
    "multi_model_discussion": {"display_name": "多模型讨论", "description": "组织多个模型独立分析、比较分歧并由 Sino 综合。", "capability_refs": ("multi_model_discussion",), "model_assignment_capability": "multi_model_discussion", "memory_refs": ()},
}
EXECUTION_ENGINE_REGISTRY = {
    "codex": {
        "display_name": "Codex",
        "status": "available",
        "engine_type": "codex",
    },
}
INVALID_MODEL_NAMES = frozenset({"gpt", "claude", "runtime-gpt-model", "runtime-claude-model", "test", "placeholder"})
LEGACY_ENV = {
    "deepseek": ("DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"),
    "gpt": ("OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"),
    "claude": ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"),
}


@dataclass(frozen=True)
class RuntimeModelConfig:
    provider_key: str
    provider_type: str
    api_key: str
    base_url: str
    model: str


class ModelCenterCipher:
    """Local encrypted credential store; the generated key never enters the DB or API."""

    @staticmethod
    def _key_path() -> Path:
        configured = os.environ.get("MODEL_CENTER_KEY_FILE")
        return Path(configured) if configured else Path(__file__).resolve().parents[4] / ".runtime" / "model-center.key"

    @classmethod
    def _fernet(cls) -> Fernet:
        path = cls._key_path()
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(Fernet.generate_key())
            path.chmod(0o600)
        return Fernet(path.read_bytes().strip())

    @classmethod
    def encrypt(cls, value: str) -> str:
        return cls._fernet().encrypt(value.encode()).decode()

    @classmethod
    def decrypt(cls, value: str) -> str:
        try:
            return cls._fernet().decrypt(value.encode()).decode()
        except InvalidToken as error:
            raise RuntimeError("model_center_credential_unreadable") from error


def _mask(value: str) -> str:
    return f"****{value[-4:]}" if value else ""


def _valid_model(model: str | None) -> bool:
    return bool(model and model.strip() and model.strip().casefold() not in INVALID_MODEL_NAMES)


def _is_configured(row: ModelProviderConfigDB | None) -> bool:
    return bool(row and row.encrypted_api_key and _valid_model(row.model))


def _serialize(row: ModelProviderConfigDB | None, key: str) -> dict:
    definition = PROVIDERS.get(key) or PROVIDER_CATALOG.get(row.provider_type if row else "custom", PROVIDER_CATALOG["custom"])
    configured = _is_configured(row)
    installed = bool(row and row.encrypted_api_key)
    if row and not row.enabled:
        state = "disabled"
    elif installed and row.health_status == "unhealthy":
        state = "unhealthy"
    elif installed and row.available_models and not configured:
        state = "pending_selection"
    elif installed and not configured:
        state = "pending_check"
    elif not configured:
        state = "not_configured"
    else:
        state = row.health_status if row.health_status in {"healthy", "unhealthy"} else "pending_check"
    return {
        "provider_key": key,
        "provider_type": row.provider_type if row else definition.get("provider_type", key),
        "display_name": definition["display_name"],
        "base_url": row.base_url if row else definition["default_base_url"],
        "model": row.model if row and _valid_model(row.model) else "",
        "installed": bool(row and row.encrypted_api_key),
        "credential_configured": bool(row and row.encrypted_api_key),
        "available_models": [_model_metadata(item, row.provider_type if row else definition.get("provider_type", key)) for item in (row.available_models or [])] if row else [],
        "selected_models": list(row.selected_models or []) if row else [],
        "configured": configured,
        "api_key_mask": row.api_key_mask if row and row.encrypted_api_key else None,
        "enabled": row.enabled if row else False,
        "health_status": state,
        "generation_availability": "available" if state == "healthy" and configured else (row.health_error if row and row.health_error else "unknown"),
        "health_error": row.health_error if state == "unhealthy" else None,
        "health_checked_at": row.health_checked_at.isoformat() if row and row.health_checked_at else None,
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


def _model_metadata(model: str, provider_type: str) -> dict:
    name = model.lower()
    tags, recommended, cost, speed, reasoning, context = [], [], "标准", "标准", "标准", "标准"
    if any(term in name for term in ("sonnet", "gpt-5", "deepseek-chat", "qwen-max", "kimi")):
        tags, recommended = ["对话", "项目分析"], ["Sino 对话", "项目分析"]
    if any(term in name for term in ("opus", "reasoner", "reasoning", "o1", "o3")):
        tags, recommended, reasoning = ["深度思考", "方案评审"], ["深度思考", "方案评审"], "强"
    if any(term in name for term in ("sonnet", "opus")):
        recommended.append("系统构建"); context = "长上下文"
    if any(term in name for term in ("mini", "haiku", "flash", "lite")):
        tags.append("快速任务"); recommended.append("低成本调用"); cost, speed = "低", "快"
    if not recommended:
        tags, recommended = ["通用"], ["Sino 对话"]
    return {"model_id": model, "display_name": _friendly_model_name(model, provider_type), "capability_tags": list(dict.fromkeys(tags)), "recommendation_score": 90 if recommended else 60, "recommended_for": list(dict.fromkeys(recommended)), "cost_class": cost, "speed_class": speed, "reasoning_class": reasoning, "context_class": context, "supports_reasoning": reasoning == "强", "supports_vision": False, "supports_tools": not any(term in name for term in ("embedding", "tts", "image")), "context_window": None}


def _sync_model_registry(session, row: ModelProviderConfigDB, model_ids: list[str]) -> None:
    selected = set(row.selected_models or [])
    for model_id in model_ids:
        metadata = _model_metadata(model_id, row.provider_type)
        record = session.scalar(select(ModelRegistryDB).where(ModelRegistryDB.provider_id == row.provider_key, ModelRegistryDB.model_id == model_id))
        if record is None:
            record = ModelRegistryDB(provider_id=row.provider_key, model_id=model_id, display_name=metadata["display_name"])
            session.add(record)
        record.display_name = metadata["display_name"]
        record.capability = metadata["capability_tags"]
        record.context_window = metadata["context_window"]
        record.supports_reasoning = metadata["supports_reasoning"]
        # Image-input support is capability evidence, not a model-name heuristic.
        # Preserve a successful runtime probe when provider model lists refresh.
        if record.id is None:
            record.supports_vision = False
        record.supports_tools = metadata["supports_tools"]
        record.selected = model_id in selected
        record.enabled = True


def _friendly_model_name(model: str, provider_type: str) -> str:
    text = model.replace("-", " ").replace("_", " ")
    prefixes = {"anthropic": "Claude ", "openai": "GPT ", "deepseek": "DeepSeek "}
    if provider_type in prefixes and not text.lower().startswith(prefixes[provider_type].strip().lower()):
        text = prefixes[provider_type] + text.removeprefix(provider_type).strip()
    return " ".join(part.upper() if part.lower() in {"ai", "gpt"} else part.capitalize() for part in text.split())


def get_model_center() -> dict:
    _bootstrap_legacy_runtime_once()
    with SessionLocal() as session:
        rows = {row.provider_key: row for row in session.scalars(select(ModelProviderConfigDB))}
        # Backfill Provider Registry V1 discoveries into the normalized V2 model
        # registry. This is idempotent and keeps existing installed models usable
        # immediately after the migration.
        for row in rows.values():
            _sync_model_registry(session, row, row.available_models or [])
        session.commit()
        rows = {row.provider_key: row for row in session.scalars(select(ModelProviderConfigDB))}
        roles = {row.role_key: row.provider_key for row in session.scalars(select(ModelRoleAssignmentDB))}
        assignments = list(session.scalars(select(ApplicationCapabilityAssignmentDB)))
        usage_rows = session.execute(select(CouncilModelRunDB.provider, func.count(CouncilModelRunDB.id), func.avg(CouncilModelRunDB.latency_ms)).group_by(CouncilModelRunDB.provider)).all()
        capability_configs = {row.capability_key: row for row in session.scalars(select(AICapabilityConfigDB))}
        registry_rows = list(session.scalars(select(ModelRegistryDB)))
        from app.core.conversation_first.model import SinoBrainSessionDB
        brain_states = list(session.scalars(select(SinoBrainSessionDB)))
    provider_items = [_serialize(row, key) for key, row in rows.items()]
    for key in PROVIDERS:
        if key not in rows:
            provider_items.append(_serialize(None, key))
    usage = {provider: {"calls": count, "average_latency_ms": round(float(latency), 1) if latency is not None else None, "tokens": None, "cost": None, "quota": None} for provider, count, latency in usage_rows}
    capability_roles = []
    for capability in CAPABILITIES:
        legacy = next((old for old, new in LEGACY_ROLE_ALIASES.items() if new == capability), None)
        config = (capability_configs.get(capability).configuration if capability_configs.get(capability) else {}) or {}
        capability_roles.append({"role_key": capability, "label": CAPABILITY_LABELS[capability], "provider_key": config.get("provider_key") or roles.get(capability) or roles.get(legacy), "model": config.get("model"), "fallbacks": list(config.get("fallbacks", [])), "fixed": False, "multiple": capability == "multi_model_discussion", "models": list(config.get("models", [])) if capability == "multi_model_discussion" else [], "execution_engine_id": config.get("execution_engine_id", "codex") if capability == "code_execution" else None})
    vision_probes = dict(((capability_configs.get("vision_model_routing").configuration if capability_configs.get("vision_model_routing") else {}) or {}).get("model_probes") or {})
    image_generation_probes = dict(((capability_configs.get("image_generation_model_routing").configuration if capability_configs.get("image_generation_model_routing") else {}) or {}).get("model_probes") or {})
    from app.core.model_center.capability_registry import build_model_capability_registry
    image_results = {}
    for state in brain_states:
        loop = dict((state.discovery or {}).get("autonomous_main_loop") or {})
        for result in (loop.get("model_probe_job") or {}).get("probe_results") or []:
            image_results[f"{result.get('provider_id')}:{result.get('model_id')}"] = result
    capability_registry = build_model_capability_registry(rows, registry_rows, capability_configs, image_results)
    return {
        "provider_catalog": [{"provider_type": key, "display_name": value["display_name"], "default_base_url": value["default_base_url"], "requires_base_url": not bool(value["default_base_url"])} for key, value in PROVIDER_CATALOG.items()],
        "providers": provider_items,
        "models": [{"provider_id": item.provider_id, "model_id": item.model_id, "display_name": item.display_name, "capability": list(item.capability or []), "context_window": item.context_window, "supports_text": bool(item.enabled and rows.get(item.provider_id) and rows[item.provider_id].health_status == "healthy"), "supports_reasoning": item.supports_reasoning, "supports_vision": bool(vision_probes.get(f"{item.provider_id}:{item.model_id}", {}).get("supports_image")), "supports_image": bool(vision_probes.get(f"{item.provider_id}:{item.model_id}", {}).get("supports_image")), "supports_image_generation": bool(image_generation_probes.get(f"{item.provider_id}:{item.model_id}", {}).get("supports_image_generation")), "image_generation_capability_source": image_generation_probes.get(f"{item.provider_id}:{item.model_id}", {}).get("source"), "supports_structured_output": bool(vision_probes.get(f"{item.provider_id}:{item.model_id}", {}).get("status") == "passed"), "vision_capability_source": vision_probes.get(f"{item.provider_id}:{item.model_id}", {}).get("source"), "supports_tools": item.supports_tools, "selected": item.selected, "enabled": item.enabled} for item in registry_rows],
        "roles": capability_roles,
        "agents": [{"agent_id": agent_id, **definition} for agent_id, definition in AGENT_REGISTRY.items() if definition["application_system_id"] == "founder_ai"],
        "skills": _agent_skills("sino_founder_ai", capability_configs, roles),
        "applications": [{"application_key": key, "label": label, "assignments": [_application_assignment(key, capability, assignments, rows, roles) for capability in CAPABILITIES]} for key, label in APPLICATIONS.items()],
        "health_cost": [{**item, "usage": usage.get(item["provider_key"], {"calls": 0, "average_latency_ms": None, "tokens": None, "cost": None, "quota": None})} for item in provider_items],
        "execution_engines": [{"engine_id": key, **value} for key, value in EXECUTION_ENGINE_REGISTRY.items()],
        "model_capability_registry": capability_registry,
    }


def _agent_skills(agent_id: str, capability_configs: dict, roles: dict) -> list[dict]:
    agent = AGENT_REGISTRY.get(agent_id)
    if not agent:
        return []
    items = []
    for skill_id in agent["skill_refs"]:
        definition = SKILL_REGISTRY[skill_id]
        capability = definition["model_assignment_capability"]
        config = (capability_configs.get(capability).configuration if capability_configs.get(capability) else {}) or {}
        legacy = next((old for old, new in LEGACY_ROLE_ALIASES.items() if new == capability), None)
        provider_key = config.get("provider_key") or roles.get(capability) or roles.get(legacy)
        model = config.get("model")
        models = list(config.get("models", [])) if skill_id == "multi_model_discussion" else []
        configured = bool(models if skill_id == "multi_model_discussion" else provider_key and model)
        items.append({"skill_id": skill_id, "agent_id": agent_id, **definition, "status": "running" if configured else "unconfigured", "model_assignment": {"provider_key": provider_key, "model": model} if configured and not models else None, "model_assignments": models, "prompt_refs": (), "workflow_refs": (), "tool_refs": (), "created_at": None, "updated_at": None})
    return items


def _application_assignment(application_key: str, capability: str, assignments: list, rows: dict, roles: dict) -> dict:
    if capability == "code_execution":
        return {"capability_key": capability, "label": CAPABILITY_LABELS[capability], "provider_key": "codex", "model": "Codex", "fixed": True}
    explicit = next((item for item in assignments if item.application_key == application_key and item.capability_key == capability), None)
    provider_key = explicit.provider_key if explicit else None
    model = explicit.model if explicit else None
    if application_key == "founder_ai" and not provider_key:
        legacy = next((old for old, new in LEGACY_ROLE_ALIASES.items() if new == capability), None)
        provider_key = roles.get(capability) or roles.get(legacy)
        provider = rows.get(provider_key)
        model = provider.model if provider else None
    return {"capability_key": capability, "label": CAPABILITY_LABELS[capability], "provider_key": provider_key, "model": model, "fixed": False}


def _bootstrap_legacy_runtime_once() -> None:
    """One-way migration for existing installations; UI/DB is authoritative afterwards."""
    with SessionLocal() as session:
        existing = set(session.scalars(select(ModelProviderConfigDB.provider_key)))
        for key, (key_var, url_var, model_var) in LEGACY_ENV.items():
            api_key, model = os.environ.get(key_var), os.environ.get(model_var)
            if key in existing or not api_key or not model:
                continue
            session.add(ModelProviderConfigDB(
                provider_key=key,
                provider_type=PROVIDERS[key]["provider_type"],
                display_name=PROVIDERS[key]["display_name"],
                base_url=os.environ.get(url_var) or PROVIDERS[key]["default_base_url"],
                model=model,
                available_models=[model],
                selected_models=[model],
                encrypted_api_key=ModelCenterCipher.encrypt(api_key),
                api_key_mask=_mask(api_key),
                enabled=True,
            ))
        if not session.get(ModelRoleAssignmentDB, "reasoner"):
            legacy_primary = {"openai": "gpt", "anthropic": "claude"}.get(os.environ.get("LLM_PROVIDER", ""), os.environ.get("LLM_PROVIDER"))
            if legacy_primary in PROVIDERS and (legacy_primary in existing or os.environ.get(LEGACY_ENV[legacy_primary][0])):
                session.add(ModelRoleAssignmentDB(role_key="reasoner", provider_key=legacy_primary))
        session.commit()


def save_provider(provider_key: str, *, base_url: str, model: str, api_key: str | None, enabled: bool) -> dict:
    if provider_key not in PROVIDERS:
        raise LookupError("provider_not_supported")
    clean_url, clean_model = base_url.strip().rstrip("/"), model.strip()
    if not clean_url or not _valid_model(clean_model):
        raise ValueError("base_url_and_model_required")
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None:
            if not api_key:
                raise ValueError("api_key_required")
            row = ModelProviderConfigDB(provider_key=provider_key, provider_type=PROVIDERS[provider_key]["provider_type"], display_name=PROVIDERS[provider_key]["display_name"], base_url=clean_url, model=clean_model, available_models=[clean_model], selected_models=[clean_model])
            session.add(row)
        row.base_url, row.model, row.enabled = clean_url, clean_model, enabled
        row.available_models = list(dict.fromkeys([*(row.available_models or []), clean_model]))
        row.selected_models = list(dict.fromkeys([*(row.selected_models or []), clean_model]))
        if api_key:
            row.encrypted_api_key = ModelCenterCipher.encrypt(api_key.strip())
            row.api_key_mask = _mask(api_key.strip())
        _sync_model_registry(session, row, row.available_models or [])
        row.health_status, row.health_error = "unknown", None
        session.commit(); session.refresh(row)
        return _serialize(row, provider_key)


def save_roles(assignments: dict[str, str | None]) -> dict:
    normalized = {LEGACY_ROLE_ALIASES.get(key, key): value for key, value in assignments.items()}
    invalid = set(normalized) - set(CAPABILITIES)
    if invalid:
        raise ValueError("role_not_supported")
    with SessionLocal() as session:
        for role, provider in normalized.items():
            if role == "code_execution":
                continue
            if provider is not None and provider not in PROVIDERS:
                raise ValueError("provider_not_supported")
            if provider is not None:
                provider_row = session.get(ModelProviderConfigDB, provider)
                if not provider_row or not provider_row.enabled or not _is_configured(provider_row):
                    raise ValueError("provider_not_available")
            row = session.get(ModelRoleAssignmentDB, role)
            if row is None:
                row = ModelRoleAssignmentDB(role_key=role); session.add(row)
            row.provider_key = provider
        session.commit()
    return get_model_center()


def save_multi_model_assignment(models: list[dict]) -> dict:
    with SessionLocal() as session:
        clean = []
        for item in models:
            provider_key, model = item.get("provider_key"), item.get("model")
            row = session.get(ModelProviderConfigDB, provider_key) if provider_key else None
            if not row or not row.enabled or row.health_status != "healthy" or model not in (row.selected_models or []):
                raise ValueError("model_not_available")
            clean.append({"provider_key": provider_key, "model": model})
        config = session.get(AICapabilityConfigDB, "multi_model_discussion")
        if config is None:
            config = AICapabilityConfigDB(capability_key="multi_model_discussion"); session.add(config)
        config.configuration = {"models": clean}; session.commit()
    return get_model_center()


def _validated_model_reference(session, provider_key: str | None, model: str | None, *, require_healthy: bool = True) -> dict | None:
    if not provider_key:
        return None
    provider = session.get(ModelProviderConfigDB, provider_key)
    if (not provider or not provider.enabled or (require_healthy and provider.health_status != "healthy")
            or model not in (provider.selected_models or [])):
        raise ValueError("model_not_available")
    return {"provider_key": provider_key, "model": model}


def save_capability_assignment(capability: str, provider_key: str | None, model: str | None, fallbacks: list[dict] | None = None) -> dict:
    if capability not in CAPABILITIES or capability == "multi_model_discussion":
        raise ValueError("capability_not_assignable")
    with SessionLocal() as session:
        primary = _validated_model_reference(session, provider_key, model)
        fallback_refs = []
        seen = {(provider_key, model)} if provider_key else set()
        for item in (fallbacks or [])[:2]:
            ref = _validated_model_reference(session, item.get("provider_key"), item.get("model"))
            identity = (ref["provider_key"], ref["model"])
            if identity not in seen:
                fallback_refs.append(ref); seen.add(identity)
        config = session.get(AICapabilityConfigDB, capability)
        if config is None:
            config = AICapabilityConfigDB(capability_key=capability); session.add(config)
        previous = dict(config.configuration or {})
        configuration = {**(primary or {}), "fallbacks": fallback_refs} if primary else {}
        if capability == "code_execution":
            configuration["execution_engine_id"] = previous.get("execution_engine_id", "codex")
        config.configuration = configuration
        session.commit()
    return get_model_center()


def resolve_runtime_chain(role: str) -> list[RuntimeModelConfig]:
    """Resolve one bounded, provider-independent model chain for a Runtime role."""
    capability = LEGACY_ROLE_ALIASES.get(role, role)
    with SessionLocal() as session:
        config = session.get(AICapabilityConfigDB, capability)
        configuration = dict(config.configuration or {}) if config else {}
    references = []
    if configuration.get("provider_key") and configuration.get("model"):
        references.append({"provider_key": configuration["provider_key"], "model": configuration["model"]})
    references.extend(configuration.get("fallbacks") or [])
    resolved, seen = [], set()
    for ref in references[:3]:
        identity = (ref.get("provider_key"), ref.get("model"))
        if identity in seen:
            continue
        seen.add(identity)
        runtime = resolve_runtime_config(provider_key=identity[0], model=identity[1])
        if runtime:
            resolved.append(runtime)
    if not resolved:
        runtime = resolve_runtime_config(role=role)
        if runtime:
            resolved.append(runtime)
    return resolved


def save_execution_engine(engine_id: str) -> dict:
    engine = EXECUTION_ENGINE_REGISTRY.get(engine_id)
    if not engine or engine.get("status") != "available":
        raise ValueError("execution_engine_not_available")
    with SessionLocal() as session:
        config = session.get(AICapabilityConfigDB, "code_execution")
        if config is None:
            config = AICapabilityConfigDB(capability_key="code_execution")
            session.add(config)
        configuration = dict(config.configuration or {})
        configuration["execution_engine_id"] = engine_id
        config.configuration = configuration
        session.commit()
    return get_model_center()


def resolve_multi_model_configs() -> list[RuntimeModelConfig]:
    with SessionLocal() as session:
        config = session.get(AICapabilityConfigDB, "multi_model_discussion")
        items = list((config.configuration if config else {}).get("models", []))
    configs = []
    for item in items:
        runtime = resolve_runtime_config(provider_key=item.get("provider_key"), model=item.get("model"))
        if runtime:
            configs.append(runtime)
    return configs


def resolve_execution_capability() -> dict:
    runtime = resolve_runtime_config(role="code_execution")
    with SessionLocal() as session:
        config = session.get(AICapabilityConfigDB, "code_execution")
        engine_id = ((config.configuration if config else {}) or {}).get("execution_engine_id", "codex")
    engine = EXECUTION_ENGINE_REGISTRY.get(engine_id)
    if not engine or engine.get("status") != "available":
        engine_id, engine = None, None
    return {"execution_system_model_id": runtime.model if runtime else None, "execution_system_provider_id": runtime.provider_key if runtime else None, "execution_engine_id": engine_id, "execution_engine": engine}


def resolve_runtime_config(provider_key: str | None = None, role: str | None = None, model: str | None = None) -> RuntimeModelConfig | None:
    with SessionLocal() as session:
        key = provider_key
        if role:
            capability = LEGACY_ROLE_ALIASES.get(role, role)
            capability_config = session.get(AICapabilityConfigDB, capability)
            app_assignment = session.scalar(select(ApplicationCapabilityAssignmentDB).where(ApplicationCapabilityAssignmentDB.application_key == "founder_ai", ApplicationCapabilityAssignmentDB.capability_key == capability))
            assignment = session.get(ModelRoleAssignmentDB, capability) or session.get(ModelRoleAssignmentDB, role)
            # Agent capability assignments are the current Founder-facing source of
            # truth.  Application assignments are retained for compatibility, but
            # must not override a model explicitly selected for the Sino skill.
            if capability_config and capability_config.configuration.get("provider_key"):
                key = capability_config.configuration.get("provider_key")
                selected_model = capability_config.configuration.get("model")
            elif app_assignment and app_assignment.provider_key:
                key = app_assignment.provider_key
                selected_model = app_assignment.model
            else:
                selected_model = None
                key = assignment.provider_key if assignment else None
        if not key:
            reasoner = session.get(ModelRoleAssignmentDB, "sino_conversation") or session.get(ModelRoleAssignmentDB, "reasoner")
            key = reasoner.provider_key if reasoner else None
            selected_model = None
        row = session.get(ModelProviderConfigDB, key) if key else None
        if not row or not row.enabled or not _is_configured(row):
            return None
        resolved_model = model or (selected_model if 'selected_model' in locals() and selected_model in (row.selected_models or []) else row.model)
        if resolved_model not in (row.selected_models or []):
            return None
        return RuntimeModelConfig(key, row.provider_type, ModelCenterCipher.decrypt(row.encrypted_api_key), row.base_url, resolved_model)


def record_health(provider_key: str, status: str, error: str | None = None) -> dict:
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None:
            raise LookupError("provider_not_configured")
        row.health_status, row.health_error, row.health_checked_at = status, error, datetime.now(timezone.utc)
        session.commit(); session.refresh(row)
        return _serialize(row, provider_key)


def install_provider(*, provider_type: str, api_key: str, base_url: str | None = None, display_name: str | None = None) -> dict:
    definition = PROVIDER_CATALOG.get(provider_type)
    if definition is None:
        raise ValueError("provider_not_supported")
    clean_key = api_key.strip()
    clean_url = (base_url or definition["default_base_url"]).strip().rstrip("/")
    if not clean_key or not clean_url:
        raise ValueError("api_key_and_base_url_required")
    canonical = {"openai": "gpt", "anthropic": "claude", "deepseek": "deepseek"}.get(provider_type)
    with SessionLocal() as session:
        provider_key = canonical if canonical and session.get(ModelProviderConfigDB, canonical) is None else f"{provider_type}-{uuid4().hex[:8]}"
        row = ModelProviderConfigDB(provider_key=provider_key, provider_type=provider_type, display_name=(display_name or definition["display_name"]).strip(), base_url=clean_url, model="", available_models=[], selected_models=[], encrypted_api_key=ModelCenterCipher.encrypt(clean_key), api_key_mask=_mask(clean_key), enabled=True, health_status="unknown")
        session.add(row); session.commit(); session.refresh(row)
    return discover_models(provider_key)


def update_provider_credentials(provider_key: str, *, api_key: str | None, base_url: str | None, display_name: str | None) -> dict:
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None: raise LookupError("provider_not_configured")
        if api_key:
            row.encrypted_api_key, row.api_key_mask = ModelCenterCipher.encrypt(api_key.strip()), _mask(api_key.strip())
        if base_url: row.base_url = base_url.strip().rstrip("/")
        if display_name: row.display_name = display_name.strip()
        row.health_status, row.health_error = "unknown", None
        session.commit()
    return discover_models(provider_key)


def _fetch_available_models(row: ModelProviderConfigDB) -> list[str]:
    key = ModelCenterCipher.decrypt(row.encrypted_api_key)
    protocol = PROVIDER_CATALOG.get(row.provider_type, PROVIDER_CATALOG["custom"])["protocol"]
    if protocol == "anthropic":
        response = httpx.get(f"{row.base_url}/models", headers={"x-api-key": key, "anthropic-version": "2023-06-01"}, timeout=20)
    elif protocol == "gemini":
        response = httpx.get(f"{row.base_url}/models", params={"key": key}, timeout=20)
    else:
        response = httpx.get(f"{row.base_url}/models", headers={"Authorization": f"Bearer {key}"}, timeout=20)
    if response.status_code in (401, 403):
        raise PermissionError("invalid_credentials")
    if response.status_code != 200:
        raise ConnectionError("provider_unavailable")
    payload = response.json()
    raw = payload.get("data") if isinstance(payload, dict) else None
    if raw is None and isinstance(payload, dict): raw = payload.get("models")
    models = []
    for item in raw or []:
        identifier = item.get("id") or item.get("name") if isinstance(item, dict) else None
        if identifier:
            models.append(str(identifier).removeprefix("models/"))
    return sorted(dict.fromkeys(models))


def discover_models(provider_key: str) -> dict:
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None or not row.encrypted_api_key:
            raise LookupError("provider_not_configured")
        try:
            models = _fetch_available_models(row)
            # Preserve already installed models that remain healthy at runtime even when
            # a provider's discovery endpoint only advertises its newest catalogue.
            row.available_models = list(dict.fromkeys([*(row.selected_models or []), *models]))
            _sync_model_registry(session, row, row.available_models)
            row.health_status, row.health_error, row.health_checked_at = "healthy", None, datetime.now(timezone.utc)
        except PermissionError:
            row.health_status, row.health_error, row.health_checked_at = "unhealthy", "invalid_credentials", datetime.now(timezone.utc)
            session.commit(); raise
        except (httpx.HTTPError, ConnectionError, ValueError):
            row.health_status, row.health_error, row.health_checked_at = "unhealthy", "provider_unavailable", datetime.now(timezone.utc)
            session.commit(); raise ConnectionError("provider_unavailable")
        session.commit(); session.refresh(row)
        return _serialize(row, provider_key)


def select_models(provider_key: str, models: list[str]) -> dict:
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None:
            raise LookupError("provider_not_configured")
        selected = list(dict.fromkeys(item for item in models if item in (row.available_models or [])))
        if not selected:
            raise ValueError("at_least_one_available_model_required")
        row.selected_models, row.model = selected, selected[0]
        row.enabled = True
        _sync_model_registry(session, row, row.available_models or [])
        session.commit(); session.refresh(row)
        return _serialize(row, provider_key)


def set_provider_enabled(provider_key: str, enabled: bool) -> dict:
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None: raise LookupError("provider_not_configured")
        row.enabled = enabled; session.commit(); session.refresh(row)
        return _serialize(row, provider_key)


def delete_provider(provider_key: str) -> None:
    with SessionLocal() as session:
        row = session.get(ModelProviderConfigDB, provider_key)
        if row is None: raise LookupError("provider_not_configured")
        session.query(ModelRoleAssignmentDB).filter(ModelRoleAssignmentDB.provider_key == provider_key).update({"provider_key": None})
        session.query(ApplicationCapabilityAssignmentDB).filter(ApplicationCapabilityAssignmentDB.provider_key == provider_key).update({"provider_key": None, "model": None})
        session.query(ModelRegistryDB).filter(ModelRegistryDB.provider_id == provider_key).delete()
        session.delete(row); session.commit()


def save_application_assignments(application_key: str, assignments: dict[str, dict | None]) -> dict:
    if application_key not in APPLICATIONS: raise ValueError("application_not_supported")
    with SessionLocal() as session:
        for capability, value in assignments.items():
            if capability not in CAPABILITIES: raise ValueError("capability_not_supported")
            provider = (value or {}).get("provider_key")
            model = (value or {}).get("model")
            if provider:
                row = session.get(ModelProviderConfigDB, provider)
                if not row or not row.enabled or model not in (row.selected_models or []): raise ValueError("model_not_available")
            assignment = session.scalar(select(ApplicationCapabilityAssignmentDB).where(ApplicationCapabilityAssignmentDB.application_key == application_key, ApplicationCapabilityAssignmentDB.capability_key == capability))
            if assignment is None:
                assignment = ApplicationCapabilityAssignmentDB(application_key=application_key, capability_key=capability); session.add(assignment)
            assignment.provider_key, assignment.model = provider, model
        session.commit()
    return get_model_center()
