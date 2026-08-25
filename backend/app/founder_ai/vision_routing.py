"""Capability-probed model-center routing for real multimodal Founder messages."""
from datetime import datetime, timezone
import json
from sqlalchemy import select
from app.core.model_center.model import AICapabilityConfigDB, ModelRegistryDB
from app.core.model_center.capability_registry import resolve_model_route
from app.database.db import SessionLocal
from app.founder_ai.attachments import multimodal_images
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest

def understand_images(conversation_id: str, text: str, attachment_ids: list[str]) -> dict:
    candidates = [(item["provider_id"], item["model_id"]) for item in resolve_model_route("VISION_UNDERSTANDING")]
    if not candidates: raise ValueError("vision_model_unavailable")
    images = multimodal_images(conversation_id, attachment_ids)
    errors = []
    prompt = """Analyze the attached Founder UI screenshot as image evidence only. Prioritize red arrows, circles, boxes, and other Founder annotations and identify exactly which visible UI element they point to. Do not infer hidden state. Return JSON only with: image_type, observed_ui_area, observed_elements (array), likely_target, visible_issue, founder_annotation_context, confidence (0..1)."""
    for provider_id, model_id in candidates:
        try:
            response = llm_gateway.generate_for_model(provider_id, model_id, LLMRequest(system_prompt=prompt, user_prompt=text, temperature=0, max_tokens=800, response_format="json", metadata={"images": images, "conversation_id": conversation_id, "capability_probe": "image_input", "runtime_role": "vision", "assignment_role": "vision", "invocation_source": "vision", "runtime_mode": "default"}))
            payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            required = ("image_type", "observed_ui_area", "observed_elements", "likely_target", "visible_issue", "founder_annotation_context", "confidence")
            if not isinstance(payload, dict) or any(key not in payload for key in required):
                raise ValueError("invalid_image_understanding")
            result = {**{key: payload[key] for key in required}, "attachment_id": attachment_ids[0], "attachment_ids": attachment_ids, "model_provider": provider_id, "model_id": model_id, "gateway_provider": response.provider}
            _record_probe(provider_id, model_id, "passed", None)
            return result
        except Exception as error:
            errors.append({"provider_id": provider_id, "model_id": model_id, "error_type": type(error).__name__})
            _record_probe(provider_id, model_id, "failed", type(error).__name__)
    raise ValueError("vision_model_unavailable")


def _record_probe(provider_id: str, model_id: str, status: str, error_type: str | None) -> None:
    """Persist capability evidence in the existing capability configuration, never credentials."""
    observed_at = datetime.now(timezone.utc).isoformat()
    with SessionLocal() as session:
        model = session.scalar(select(ModelRegistryDB).where(ModelRegistryDB.provider_id == provider_id, ModelRegistryDB.model_id == model_id))
        if model is not None and status == "passed":
            model.supports_vision = True
        record = session.get(AICapabilityConfigDB, "vision_model_routing")
        configuration = dict(record.configuration or {}) if record else {}
        probes = dict(configuration.get("model_probes") or {})
        probes[f"{provider_id}:{model_id}"] = {"supports_image": status == "passed", "status": status, "source": "real_multimodal_capability_probe", "observed_at": observed_at, "error_type": error_type}
        configuration.update({"model_probes": probes, "last_probe_at": observed_at})
        if record is None:
            session.add(AICapabilityConfigDB(capability_key="vision_model_routing", configuration=configuration))
        else:
            record.configuration = configuration
        session.commit()
