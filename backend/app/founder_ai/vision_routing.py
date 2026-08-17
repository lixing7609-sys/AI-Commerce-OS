"""Explicit model-center routing for real multimodal Founder messages."""
from sqlalchemy import select
from app.core.model_center.model import ModelRegistryDB
from app.database.db import SessionLocal
from app.founder_ai.attachments import multimodal_images
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest

def understand_images(conversation_id: str, text: str, attachment_ids: list[str]) -> dict:
    with SessionLocal() as session:
        model = session.scalar(select(ModelRegistryDB).where(ModelRegistryDB.enabled.is_(True), ModelRegistryDB.supports_vision.is_(True), ModelRegistryDB.supports_tools.is_(True)).order_by(ModelRegistryDB.selected.desc(), ModelRegistryDB.id))
    if model is None: raise ValueError("vision_model_unavailable")
    images = multimodal_images(conversation_id, attachment_ids)
    response = llm_gateway.generate_for_model(model.provider_id, model.model_id, LLMRequest(
        system_prompt="Understand the attached Founder UI screenshot. Describe only visible evidence relevant to the request; do not infer hidden state.",
        user_prompt=text, temperature=0, max_tokens=800, metadata={"images": images, "conversation_id": conversation_id}))
    return {"provider": response.provider, "model": response.model, "understanding": response.content, "attachment_ids": attachment_ids}
